import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
export class ConfigService {
    static #logger = new LoggerService('ConfigService')
    static #initialized = false
    static #cache = new Map()
    static DEFAULT_VALUES = new Map([
        ['is_vip', true],
        ['page_type', 'video'],
        ['offset_top', 5],
        ['player_offset_top', 168],
        ['video_player_offset_top', 168],
        ['bangumi_player_offset_top', 104],
        ['auto_locate', true],
        ['get_offset_method', 'function'],
        ['auto_locate_video', true],
        ['auto_locate_bangumi', true],
        ['click_player_auto_locate', true],
        ['current_player_mode', 'normal'],
        ['selected_player_mode', 'wide'],
        ['auto_select_video_highest_quality', true],
        ['auto_cancel_mute', true],
        ['preserve_player_mode', true],
        ['preserve_mode_wide', true],
        ['preserve_mode_web', true],
        ['preserve_mode_full', true],
        ['contain_quality4k', false],
        ['contain_quality8k', false],
        ['webfull_unlock', false],
        ['auto_reload', false],
        ['auto_skip', false],
        ['insert_video_description_to_comment', true],
        ['dynamic_video_link', 'https://t.bilibili.com/?tab=video'],
        ['pause_video', false],
        ['continue_play', false],
        ['auto_subtitle', false],
        ['show_comment_location', true], // 显示评论IP属地
        ['remove_comment_tags', true],
        ['auto_hi_res', true],
        ['auto_check_update', true],
        ['ai_apikey', ''],
        ['ai_provider', 'siliconflow'], // AI 提供商
        ['ai_model', 'deepseek-ai/DeepSeek-V3'], // AI 模型 (硅基流动默认模型)
        ['custom_base_url', ''], // 自定义 API 地址
        ['use_custom_model', false], // 是否使用自定义模型
        ['custom_model_id', ''], // 自定义模型ID
        ['custom_model_api_url', ''], // 自定义模型 API 地址
        ['custom_model_api_key', ''], // 自定义模型 API Key
        // 日志级别配置
        ['log_level_info', true],
        ['log_level_error', true],
        ['log_level_warn', true],
        ['log_level_debug', import.meta.env.DEV],
        // 更新配置
        ['update_check_frequency', 24], // 更新检查频率（小时）
        ['auto_update', false], // 自动更新
        ['skip_update_check', false] // 跳过更新检查
    ])
    static async initialize () {
        if (this.#initialized) return
        try {
            await storageService.init()
            this.#initialized = true
        } catch (error) {
            this.#logger.error('配置服务初始化失败', error)
            throw error
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
