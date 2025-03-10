// src/services/config.service.js
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
export class ConfigService {
    static #logger = new LoggerService('ConfigService')
    static #initialized = false
    static #cache = new Map()
    static DEFAULT_VALUES = new Map([
        ['is_vip', true],
        ['player_type', 'video'],
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
        ['contain_quality_4k', false],
        ['contain_quality_8k', false],
        ['webfull_unlock', false],
        ['auto_reload', false],
        ['auto_skip', false],
        ['insert_video_description_to_comment', true],
        ['dynamic_video_link', 'https://t.bilibili.com/?tab=video'],
        ['signIn_date', ''],
        ['dev_checkScreenModeSwitchSuccess_method', 'interval'],
        ['pause_video', false],
        ['continue_play', false],
        ['auto_subtitle', false],
        ['show_location', true]
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
            for (const [key, defaultValue] of this.DEFAULT_VALUES.entries()) {
                const currentValue = await storageService.legacyGet(key)
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
    static async getValue (name) {
        if (!this.#initialized) {
            await this.initialize()
        }
        try {
            // 缓存命中检查
            if (this.#cache.has(name)) {
                return this.#cache.get(name)
            }
            const value = await storageService.legacyGet(name)
            if (value === null || value === undefined) {
                const defaultValue = this.DEFAULT_VALUES.get(name)
                if (defaultValue !== undefined) {
                    await this.setValue(name, defaultValue)
                    return defaultValue
                }
                return null
            }
            this.#cache.set(name, value) // 更新缓存
            return value
        } catch (error) {
            this.#logger.error('配置读取失败', error)
            return null
        }
    }
    static async setValue (name, value) {
        if (!this.#initialized) {
            await this.initialize()
        }
        try {
            // 同步更新缓存
            this.#cache.set(name, value)
            await storageService.legacySet(name, value)
        } catch (error) {
            this.#cache.delete(name) // 回滚缓存
            this.#logger.error('配置存储失败', error)
            throw error
        }
    }
    // 新增缓存清理方法
    static clearCache () {
        this.#cache.clear()
    }
}
// 保持单例导出方式不变
export const configService = new ConfigService()
