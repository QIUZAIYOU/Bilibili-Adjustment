import { StorageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'

export class ConfigService {
    static #logger = new LoggerService('ConfigService')
    static #storage = new StorageService()
    static #initialized = false
    static #cache = new Map()
    static DEFAULT_VALUES = [
        { name: 'is_vip', value: true },
        { name: 'player_type', value: 'video' },
        { name: 'offset_top', value: 5 },
        { name: 'video_player_offset_top', value: 168 },
        { name: 'bangumi_player_offset_top', value: 104 },
        { name: 'auto_locate', value: true },
        { name: 'get_offset_method', value: 'function' },
        { name: 'auto_locate_video', value: true },
        { name: 'auto_locate_bangumi', value: true },
        { name: 'click_player_auto_locate', value: true },
        { name: 'current_player_mode', value: 'normal' },
        { name: 'selected_player_mode', value: 'wide' },
        { name: 'auto_select_video_highest_quality', value: true },
        { name: 'contain_quality_4k', value: false },
        { name: 'contain_quality_8k', value: false },
        { name: 'webfull_unlock', value: false },
        { name: 'auto_reload', value: false },
        { name: 'auto_skip', value: false },
        { name: 'insert_video_description_to_comment', value: true },
        { name: 'web_video_link', value: 'https://t.bilibili.com/?tab=video' },
        { name: 'signIn_date', value: '' },
        { name: 'dev_checkScreenModeSwitchSuccess_method', value: 'interval' },
        { name: 'pause_video', value: false },
        { name: 'continue_play', value: false },
        { name: 'auto_subtitle', value: false }
    ]
    static async initialize() {
        if (this.#initialized) return
        try {
            // 增加重试逻辑
            await this.#retryInit(3)
            this.#initialized = true
        } catch (error) {
            this.#logger.error('配置服务初始化失败', error)
            throw error
        }
    }
    static async #retryInit(maxRetries) {
        let attempts = 0
        while (attempts < maxRetries) {
            try {
                await this.#storage.init()
                await this.initializeDefaults()
                return
            } catch (error) {
                if (attempts === maxRetries - 1) throw error
                await new Promise(resolve => setTimeout(resolve, 1000 * ++attempts))
            }
        }
    }
    static async initializeDefaults() {
        await Promise.all(this.DEFAULT_VALUES.map(async item => {
            try {
                // 优先从缓存检查
                if (this.#cache.has(item.name)) return

                const exists = await this.#storage.get(item.name)
                if (exists === null || exists === undefined) {
                    await this.setValue(item.name, item.value)
                    this.#cache.set(item.name, item.value) // 初始化时填充缓存
                }
            } catch (error) {
                this.#logger.error(`默认值初始化失败: ${item.name}`, error)
            }
        }))
    }
    static async getValue(name) {
        try {
            // 缓存命中检查
            if (this.#cache.has(name)) {
                return this.#cache.get(name)
            }

            const value = await this.#storage.get(name)
            this.#cache.set(name, value) // 更新缓存
            return value
        } catch (error) {
            this.#logger.error('配置读取失败', error)
            return null
        }
    }
    static async setValue(name, value) {
        try {
            // 同步更新缓存
            this.#cache.set(name, value)
            await this.#storage.set(name, value)
        } catch (error) {
            this.#cache.delete(name) // 回滚缓存
            this.#logger.error('配置存储失败', error)
            throw error
        }
    }
    // 新增缓存清理方法
    static clearCache() {
        this.#cache.clear()
    }
}
