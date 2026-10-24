import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { gmStorageService } from '@/services/gm-storage.service'
import { planConfigMigration } from '@/utils/config-migration'
import { normalizeConfigValue } from '@/config/config-normalize'
import { eventBus } from '@/core/event-bus'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import type { SettingItemSchema } from '@/config/settings-config'
import { EVENT_NAMES } from '@/shared/constants'
// 不渲染为 UI 设置项的运行时配置默认值（页面类型、播放器布局偏移等）
const RUNTIME_DEFAULTS = {
    page_type: 'video',
    player_offset_top: 168,
    video_player_offset_top: 168,
    bangumi_player_offset_top: 104,
    get_offset_method: 'function',
    current_player_mode: 'normal'
}
/**
 * 本地写入后需要**立刻广播** `config:changed` 的配置键。
 *
 * 其余键在同一个页面里改完不需要立刻反应（跨标签页同步由 BroadcastChannel 通道负责），
 * 只有"改了就要当场生效、不能等刷新"的运行时项才在这里登记：
 * - `theme`：主题即时切换（ThemeManager 订阅）
 * - `home_video_preview`：首页视频预览开关（首页设置面板里一开就要立刻给卡片加按钮）
 */
const LOCAL_EMIT_CONFIG_KEYS = new Set(['theme', 'home_video_preview'])
/**
 * 迁移幂等标记（写在**旧库** IndexedDB 里，每个源各一份）
 * 不放在 GM 存储里：只看 GM 的标记会让第二个源误判「已迁移」而跳过自己库里的数据。
 */
const MIGRATION_MARKER_KEY = 'adj.meta.migrated'
export class ConfigService {
    static #logger = new LoggerService('ConfigService')
    static #initialized = false
    static #cache = new Map<string, unknown>()
    // 跨标签页配置同步（IndexedDB 不触发跨标签 storage 事件，需 BroadcastChannel）
    static #syncChannelName = 'bili-adjustment-config-sync'
    static #syncChannel: BroadcastChannel | null = null
    /** 同步通道是否已建立（GM 模式下 #syncChannel 恒为 null，需要单独标记） */
    static #syncChannelStarted = false
    // 从设置 schema 派生默认值：新增设置项只需在 settings-config.js 定义 defaultValue，
    // 这里无需再手动维护；defaultValue 为函数时惰性求值（如 log_level_debug 依赖构建环境）
    static DEFAULT_VALUES: Map<string, unknown> = ConfigService.#buildDefaultValues()
    static #buildDefaultValues (): Map<string, unknown> {
        const map = new Map<string, unknown>()
        const collect = (items: SettingItemSchema[]): void => {
            for (const item of items) {
                if (item.id && 'defaultValue' in item) {
                    const value = item.defaultValue
                    map.set(item.id, typeof value === 'function' ? value() : value)
                }
                if (item.children?.length) collect(item.children)
                if (item.items?.length) collect(item.items)
            }
        }
        collect(videoSettingsConfig)
        collect(dynamicSettingsConfig)
        for (const [key, value] of Object.entries(RUNTIME_DEFAULTS)) {
            map.set(key, value)
        }
        return map
    }
    static async initialize (): Promise<void> {
        if (this.#initialized) return
        try {
            await storageService.init()
            this.#initialized = true
            // 迁移必须早于 initializeDefaults：默认值补齐会写进 GM 存储（写入时间更新），
            // 若先跑，用户显式设过的值会被默认值按时间戳压掉。
            await this.#migrateUserConfigsToGm()
            this.#ensureSyncChannel()
            await this.#migrateLegacyConfigs()
        } catch (error) {
            this.#logger.error('配置服务初始化失败', error)
            throw error
        }
    }
    /**
     * 把 IndexedDB 里的用户配置迁移到 GM 存储（一次性、幂等）
     *
     * 为什么：IndexedDB 按源隔离（www / t / search / space 各一份同名库），
     * 用户在 www 设的「视频卡片预览」「界面主题」在搜索页/空间页读到的仍是默认值 ——
     * 功能半残、配色分裂。GM 存储是脚本级的，迁移后一份配置全局生效（且跨源实时同步）。
     *
     * 合并规则见 utils/config-migration.ts：默认值让位、未知键不搬、冲突按时间戳裁决。
     */
    static async #migrateUserConfigsToGm (): Promise<void> {
        if (!gmStorageService.available) return
        try {
            const legacyEntries = await storageService.legacyUserEntries()
            if (legacyEntries.some(entry => entry.key === MIGRATION_MARKER_KEY)) {
                this.#logger.debug('配置迁移丨已完成（幂等标记存在），跳过')
                return
            }
            const remote = await gmStorageService.readAll()
            const plan = planConfigMigration(legacyEntries, remote, this.DEFAULT_VALUES, normalizeConfigValue)
            if (plan.writes.length > 0) {
                await gmStorageService.writeMany(plan.writes.map(write => ({
                    key: write.key,
                    value: write.value,
                    timestamp: write.timestamp
                })))
            }
            await storageService.legacyUserSet(MIGRATION_MARKER_KEY, Date.now())
            this.#logger.info(`配置迁移丨写入 ${plan.writes.length} 项，跳过 ${plan.skips.length} 项（默认值让位 / 未知键 / 远端更新）`)
        } catch (error) {
            this.#logger.warn('配置迁移失败（已忽略，继续用当前后端）', error)
        }
    }
    /**
     * 读「当前版本已移除」的历史配置键
     * 这些键不在 schema 默认值表里 → 不会被迁到 GM 存储 → GM 模式下只能从旧库快照里读
     */
    static async #readRemovedKey (name: string): Promise<unknown> {
        if (gmStorageService.available) return storageService.legacyUserGet(name)
        return storageService.userGet(name)
    }
    /**
     * 迁移已移除的配置项
     * v3.18: 移除「自定义 OpenAI 格式」提供商选项（与「使用自定义模型」功能重复），存量用户迁移到硅基流动
     */
    static async #migrateLegacyConfigs (): Promise<void> {
        try {
            // v3.34: 「更新配置」一刀切为「自动 / 手动」——旧的 auto_check_update / skip_update_check
            // 合并为 update_mode。老用户若曾关掉自动检查或勾选跳过检查，迁移为「手动」，避免升级后被弹窗骚扰
            const storedUpdateMode = await storageService.userGet('update_mode')
            if (storedUpdateMode === null || storedUpdateMode === undefined) {
                const legacyAutoCheck = await this.#readRemovedKey('auto_check_update')
                const legacySkipCheck = await this.#readRemovedKey('skip_update_check')
                const legacyManual = legacySkipCheck === true || legacySkipCheck === 'true' ||
                    legacyAutoCheck === false || legacyAutoCheck === 'false'
                // 仅在老配置确实表示「手动」时落库；否则沿用 schema 默认值 auto，避免无谓写入
                // （P0-3 约定：读配置不写库，initializeDefaults 会补齐缺失的默认键）
                if (legacyManual) {
                    await this.setValue('update_mode', 'manual')
                    this.#logger.info('配置迁移丨更新方式迁移为「手动」（沿用旧的跳过检查 / 关闭自动检查设置）')
                }
            }
            const provider = await this.getValue('ai_provider')
            const useCustomModel = await this.getValue('use_custom_model')
            if (provider === 'custom' && !useCustomModel) {
                await this.setValue('ai_provider', 'siliconflow')
                this.#logger.info('配置迁移丨已移除「自定义 OpenAI 格式」提供商，ai_provider 迁移为 siliconflow')
            }
            // v3.30 起拆分「跳过片段」总开关与「AI 自动识别广告」子开关：
            // 存量用户开启过 auto_skip（自动跳过广告）则让 ai_auto_identify 继承该值，升级后行为不变
            const storedAutoSkip = await storageService.userGet('auto_skip')
            const storedAiIdentify = await storageService.userGet('ai_auto_identify')
            if (storedAutoSkip !== null && storedAutoSkip !== undefined && (storedAiIdentify === null || storedAiIdentify === undefined)) {
                const inherited = Boolean(storedAutoSkip)
                await this.setValue('ai_auto_identify', inherited)
                this.#logger.info(`配置迁移丨拆分跳过片段开关：ai_auto_identify 继承 auto_skip = ${inherited}`)
            }
        } catch (error) {
            this.#logger.warn('配置迁移失败', error)
        }
    }
    /**
     * 建立跨标签页 / 跨源同步通道
     *
     * 优先用 GM 存储的变更监听（GM_addValueChangeListener）：它是**脚本级**的，
     * 能跨源（www 改设置 → 已开着的 space/search 标签页立刻生效）。
     * 旧的 BroadcastChannel 只通同源，跨源收不到 —— 这正是「设置按站点分裂」的另一半原因。
     * GM 不可用（老管理器）时回落 BroadcastChannel（至少同源内还能同步）。
     */
    static #ensureSyncChannel (): void {
        if (ConfigService.#syncChannelStarted) return
        ConfigService.#syncChannelStarted = true
        if (gmStorageService.available) {
            const keys = Array.from(ConfigService.DEFAULT_VALUES.keys())
            const handler = (key: string, record: { v: unknown } | null): void => {
                ConfigService.#applyRemoteChange(key, record ? record.v : undefined)
            }
            gmStorageService.watch(keys, handler)
            // 补监听 GM 里存在但不在 schema 里的键（如用户导入的未知键）
            void gmStorageService.readAll()
                .then(records => {
                    const extra = Array.from(records.keys()).filter(key => !keys.includes(key))
                    if (extra.length > 0) gmStorageService.watch(extra, handler)
                })
                .catch(() => { /* 补监听失败不影响主流程 */ })
            return
        }
        if (typeof BroadcastChannel === 'undefined') return
        try {
            this.#syncChannel = new BroadcastChannel(this.#syncChannelName)
            this.#syncChannel.onmessage = event => {
                const { key, value } = event.data || {}
                if (!key) return
                ConfigService.#applyRemoteChange(key, value)
            }
        } catch (error) {
            this.#logger.warn('跨标签页同步通道初始化失败', error)
        }
    }
    /** 应用来自其它标签页 / 其它源的配置变更（更新缓存 + 广播事件） */
    static #applyRemoteChange (key: string, value: unknown): void {
        // 与本地缓存相同则跳过，避免同标签页自身的写入触发重复刷新
        if (this.#cache.get(key) === value) return
        // 跨标签页来的值同样归一化（对方可能是旧版本脚本写入的字符串值）
        const normalized = ConfigService.#normalizeValue(key, value)
        this.#cache.set(key, normalized)
        eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key, value: normalized })
    }
    static async initializeDefaults (): Promise<void> {
        if (!this.#initialized) {
            await this.initialize()
        }
        try {
            // 迁移旧版 ai_provider 配置到新版 ai_model
            await this.#migrateAIProviderToModel()
            // 迁移已弃用的模型配置到最新模型
            await this.#migrateDeprecatedModel()
            // 清理废弃配置项
            await this.#cleanupDeprecatedConfigs()
            // P0-3：单事务读取全部默认键，缺失项再单事务批量写入。
            // 原实现逐键 userGet + setValue（每键两次事务），冷启动往返次数随配置项线性增长。
            const keys = Array.from(this.DEFAULT_VALUES.keys())
            const stored = await storageService.userBatchGet(keys)
            const missing: Array<{ key: string; value: unknown }> = []
            for (const [key, defaultValue] of this.DEFAULT_VALUES.entries()) {
                if (stored[key] === undefined || stored[key] === null) {
                    missing.push({ key, value: defaultValue })
                } else {
                    // 存库值也要归一化后再进缓存：否则缓存里是原始值，
                    // getValue 命中缓存就直接返回，归一化代码永远不执行（2026-10-23 审查发现）
                    this.#cache.set(key, ConfigService.#normalizeValue(key, stored[key]))
                }
            }
            if (missing.length > 0) {
                // 标记为「默认值补齐」：迁移期与用户显式设置冲突时，默认值必须让位
                await storageService.userBatchSet(missing, { isDefault: true })
                for (const { key, value } of missing) {
                    this.#cache.set(key, value)
                }
                this.#logger.debug(`默认配置初始化完成（单事务写入 ${missing.length} 项）`)
            } else {
                this.#logger.debug('默认配置初始化完成（无需写入）')
            }
        } catch (error) {
            this.#logger.error('默认配置初始化失败', error)
            throw error
        }
    }
    /**
     * 迁移旧版 ai_provider 配置到新版 ai_model
     * 兼容 v3.10.x 及更早版本的用户配置
     */
    static async #migrateAIProviderToModel (): Promise<void> {
        try {
            const oldProvider = await storageService.userGet('ai_provider')
            const newModel = await storageService.userGet('ai_model')
            // 如果存在旧配置且不存在新配置，执行迁移
            if (oldProvider && !newModel) {
                // 旧版迁移到硅基流动默认模型
                const migratedModel = 'deepseek-ai/DeepSeek-V3'
                await this.setValue('ai_model', migratedModel)
                this.#logger.info(`配置已自动迁移: ai_provider=${oldProvider} -> ai_model=${migratedModel}`)
            }
        } catch (error) {
            this.#logger.warn('AI 配置迁移失败', error)
        }
    }
    /**
     * 迁移已弃用的 ai_model 配置到硅基流动模型
     * 仅当使用硅基流动提供商且模型名不是硅基流动格式时，才自动迁移到默认模型
     */
    static async #migrateDeprecatedModel (): Promise<void> {
        try {
            const currentProvider = await storageService.userGet('ai_provider') || 'siliconflow'
            const currentModel = await storageService.userGet('ai_model')
            if (!currentModel) return
            // 仅对硅基流动提供商执行迁移
            if (currentProvider !== 'siliconflow') return
            // 硅基流动模型格式为 "厂商/模型名"，包含斜杠
            // 旧版模型名不包含斜杠（如 deepseek-chat, gpt-4 等）
            const isSiliconFlowFormat = typeof currentModel === 'string' && currentModel.includes('/')
            if (!isSiliconFlowFormat) {
                const migratedModel = 'deepseek-ai/DeepSeek-V3'
                await this.setValue('ai_model', migratedModel)
                this.#logger.info(`模型配置已自动迁移到硅基流动: ${currentModel} -> ${migratedModel}`)
            }
        } catch (error) {
            this.#logger.warn('模型配置迁移失败', error)
        }
    }
    /**
     * 清理已弃用的配置项
     * 移除不再使用的旧版配置
     */
    static async #cleanupDeprecatedConfigs (): Promise<void> {
        try {
            // 检查是否存在旧版 ai_provider 配置（v3.10.x 及更早版本的字符串格式）
            // 当前版本的 ai_provider 是有效的配置项，无需清理
            // 此方法保留用于未来版本清理不再使用的配置项
            this.#logger.debug('配置清理完成')
        } catch (error) {
            this.#logger.warn('清理废弃配置失败', error)
        }
    }
    /** 按默认值类型归一化存储值（逻辑与用例见 config-normalize.ts / test/config-normalize.test.js） */
    static #normalizeValue (name: string, value: unknown): unknown {
        return normalizeConfigValue(this.DEFAULT_VALUES.get(name), value)
    }
    static async getValue (name: string): Promise<unknown> {
        if (!this.#initialized) {
            await this.initialize()
        }
        try {
            if (this.#cache.has(name)) {
                // 缓存命中也要归一化（写边界已归一，这里是防御性读路径：
                // 旧版本脚本写入的历史数据 / 跨标签页同步过来的值可能仍是字符串）
                return ConfigService.#normalizeValue(name, this.#cache.get(name))
            }
            const value = await storageService.userGet(name)
            if (value === null || value === undefined) {
                // P0-3：读配置不写库 —— 默认值只在内存覆盖（缓存并返回），
                // 是否持久化交给 initializeDefaults 的一次性批量补齐或用户显式 setValue。
                const defaultValue = this.DEFAULT_VALUES.get(name)
                if (defaultValue !== undefined) {
                    this.#cache.set(name, defaultValue)
                    return defaultValue
                }
                return null
            }
            const normalized = ConfigService.#normalizeValue(name, value)
            this.#cache.set(name, normalized)
            return normalized
        } catch (error) {
            this.#logger.error('配置读取失败', error)
            // 读取失败时尝试返回默认值
            const defaultValue = this.DEFAULT_VALUES.get(name)
            return defaultValue !== undefined ? defaultValue : null
        }
    }
    static async setValue (name: string, value: unknown): Promise<void> {
        try {
            // 写入前归一化：原生 select 的 value 恒为字符串（存的是 '72' 而不是 72），
            // 历史数据里复选框可能存 'false'，不归一化会让 `Boolean(x)` 判断反了（issue #27）。
            // 归一化必须落在**写边界**上：只靠读路径归一会被内存缓存绕过
            // （2026-10-23 审查发现：initializeDefaults / setValue 把原始值灌进缓存，
            //   getValue 命中缓存就直接返回，归一化代码永远不执行）。
            const normalized = ConfigService.#normalizeValue(name, value)
            await storageService.userSet(name, normalized)
            this.#cache.set(name, normalized)
            this.#ensureSyncChannel()
            // 本地写入也广播事件：**运行时即时生效项**依赖该事件（其余键本页不需要立刻反应，
            // 跨标签页同步由下面的 postMessage 通道负责）
            if (LOCAL_EMIT_CONFIG_KEYS.has(name)) {
                eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key: name, value: normalized })
            }
            this.#syncChannel?.postMessage({ key: name, value: normalized })
        } catch (error) {
            this.#logger.error('配置写入失败', error)
            throw error
        }
    }
    static async removeValue (name: string): Promise<void> {
        try {
            await storageService.userRemove(name)
            this.#cache.delete(name)
        } catch (error) {
            this.#logger.error('配置删除失败', error)
            throw error
        }
    }
    /**
     * 批量写入配置（P0-3）
     * 一次事务写全部键 + 一次跨标签广播，替代逐键 setValue 的 N 次事务往返。
     * @param entries 待写入的键值对
     * @returns 写入条数
     */
    static async setValues (entries: Array<{ key: string; value: unknown }>): Promise<number> {
        const records = (entries || []).filter(entry => entry && entry.key !== undefined)
        if (records.length === 0) return 0
        // 与 setValue 同口径：写库与写缓存前都归一化（2026-10-23 审查发现）
        const normalizedRecords = records.map(({ key, value }) => ({ key, value: ConfigService.#normalizeValue(key, value) }))
        await storageService.userBatchSet(normalizedRecords)
        this.#ensureSyncChannel()
        for (const { key, value } of normalizedRecords) {
            this.#cache.set(key, value)
            // 主题等运行时即时生效项依赖该事件（与 setValue 保持一致）
            if (key === 'theme') {
                eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key, value })
            }
            this.#syncChannel?.postMessage({ key, value })
        }
        return normalizedRecords.length
    }
    /**
     * 关闭跨标签页同步通道
     * BroadcastChannel 会保持事件循环活跃，非浏览器环境（Node 单测）与卸载场景需显式关闭
     */
    static closeSyncChannel (): void {
        try {
            this.#syncChannel?.close()
        } catch { /* 忽略关闭异常 */ }
        this.#syncChannel = null
        this.#syncChannelStarted = false
        gmStorageService.unwatchAll()
    }
}
