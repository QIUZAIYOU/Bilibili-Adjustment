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
            for (const [key, defaultValue] of this.DEFAULT_VALUES.entries()) {
                const currentValue = await storageService.userGet(key)
                if (currentValue === null || currentValue === undefined) {
                    await this.setValue(key, defaultValue)
                }
            }
            this.#logger.debug('默认配置初始化完成')
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
                const defaultValue = this.DEFAULT_VALUES.get(name)
                if (defaultValue !== undefined) {
                    try {
                        await this.setValue(name, defaultValue)
                    } catch (setError) {
                        this.#logger.warn(`配置 ${name} 写入默认值失败，返回默认值但不缓存`, setError)
                    }
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
}
export const ConfigServiceStatic = ConfigService
