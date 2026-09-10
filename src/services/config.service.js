import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { eventBus } from '@/core/event-bus'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
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
export class ConfigService {
    static #logger = new LoggerService('ConfigService')
    static #initialized = false
    static #cache = new Map()
    // 跨标签页配置同步（IndexedDB 不触发跨标签 storage 事件，需 BroadcastChannel）
    static #syncChannelName = 'bili-adjustment-config-sync'
    static #syncChannel = null
    // 从设置 schema 派生默认值：新增设置项只需在 settings-config.js 定义 defaultValue，
    // 这里无需再手动维护；defaultValue 为函数时惰性求值（如 log_level_debug 依赖构建环境）
    static DEFAULT_VALUES = ConfigService.#buildDefaultValues()
    static #buildDefaultValues () {
        const map = new Map()
        const collect = items => {
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
    static async initialize () {
        if (this.#initialized) return
        try {
            await storageService.init()
            this.#initialized = true
            this.#ensureSyncChannel()
            await this.#migrateLegacyConfigs()
        } catch (error) {
            this.#logger.error('配置服务初始化失败', error)
            throw error
        }
    }
    /**
     * 迁移已移除的配置项
     * v3.18: 移除「自定义 OpenAI 格式」提供商选项（与「使用自定义模型」功能重复），存量用户迁移到硅基流动
     */
    static async #migrateLegacyConfigs () {
        try {
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
     * 建立跨标签页同步通道
     * 收到其他标签页写入的配置时更新本地缓存，并广播事件供设置 UI 刷新
     */
    static #ensureSyncChannel () {
        if (this.#syncChannel || typeof BroadcastChannel === 'undefined') return
        try {
            this.#syncChannel = new BroadcastChannel(this.#syncChannelName)
            this.#syncChannel.onmessage = event => {
                const { key, value } = event.data || {}
                if (!key) return
                // 与本地缓存相同则跳过，避免同标签页自身的写入触发重复刷新
                if (this.#cache.get(key) === value) return
                this.#cache.set(key, value)
                eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key, value })
            }
        } catch (error) {
            this.#logger.warn('跨标签页同步通道初始化失败', error)
        }
    }
    static async initializeDefaults () {
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
            const missing = []
            for (const [key, defaultValue] of this.DEFAULT_VALUES.entries()) {
                if (stored[key] === undefined || stored[key] === null) {
                    missing.push({ key, value: defaultValue })
                } else {
                    this.#cache.set(key, stored[key])
                }
            }
            if (missing.length > 0) {
                await storageService.userBatchSet(missing)
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
    static async #migrateAIProviderToModel () {
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
    static async #migrateDeprecatedModel () {
        try {
            const currentProvider = await storageService.userGet('ai_provider') || 'siliconflow'
            const currentModel = await storageService.userGet('ai_model')
            if (!currentModel) return
            // 仅对硅基流动提供商执行迁移
            if (currentProvider !== 'siliconflow') return
            // 硅基流动模型格式为 "厂商/模型名"，包含斜杠
            // 旧版模型名不包含斜杠（如 deepseek-chat, gpt-4 等）
            const isSiliconFlowFormat = currentModel.includes('/')
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
    static async #cleanupDeprecatedConfigs () {
        try {
            // 检查是否存在旧版 ai_provider 配置（v3.10.x 及更早版本的字符串格式）
            // 当前版本的 ai_provider 是有效的配置项，无需清理
            // 此方法保留用于未来版本清理不再使用的配置项
            this.#logger.debug('配置清理完成')
        } catch (error) {
            this.#logger.warn('清理废弃配置失败', error)
        }
    }
    static async getValue (name) {
        if (!this.#initialized) {
            await this.initialize()
        }
        try {
            if (this.#cache.has(name)) {
                return this.#cache.get(name)
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
            this.#cache.set(name, value)
            return value
        } catch (error) {
            this.#logger.error('配置读取失败', error)
            // 读取失败时尝试返回默认值
            const defaultValue = this.DEFAULT_VALUES.get(name)
            return defaultValue !== undefined ? defaultValue : null
        }
    }
    static async setValue (name, value) {
        try {
            await storageService.userSet(name, value)
            this.#cache.set(name, value)
            this.#ensureSyncChannel()
            // 本地写入也广播事件：主题等运行时即时生效项依赖该事件（远端消息处理见 #ensureSyncChannel）
            if (name === 'theme') {
                eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key: name, value })
            }
            this.#syncChannel?.postMessage({ key: name, value })
        } catch (error) {
            this.#logger.error('配置写入失败', error)
            throw error
        }
    }
    static async removeValue (name) {
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
     * @param {Array<{key:string,value:any}>} entries
     * @returns {Promise<number>} 写入条数
     */
    static async setValues (entries) {
        const records = (entries || []).filter(entry => entry && entry.key !== undefined)
        if (records.length === 0) return 0
        await storageService.userBatchSet(records)
        this.#ensureSyncChannel()
        for (const { key, value } of records) {
            this.#cache.set(key, value)
            // 主题等运行时即时生效项依赖该事件（与 setValue 保持一致）
            if (key === 'theme') {
                eventBus.emit(EVENT_NAMES.CONFIG_CHANGED, { key, value })
            }
            this.#syncChannel?.postMessage({ key, value })
        }
        return records.length
    }
    /**
     * 关闭跨标签页同步通道
     * BroadcastChannel 会保持事件循环活跃，非浏览器环境（Node 单测）与卸载场景需显式关闭
     */
    static closeSyncChannel () {
        try {
            this.#syncChannel?.close()
        } catch { /* 忽略关闭异常 */ }
        this.#syncChannel = null
    }
}
export const ConfigServiceStatic = ConfigService
