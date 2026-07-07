// ===== scripts/services/config.service.js =====
window.__biliExt = window.__biliExt || {}

class ConfigService {
  static #initialized = false
  static #cache = new Map()

  static DEFAULT_VALUES = new Map([
    ['is_vip', true], ['page_type', 'video'], ['offset_top', 5], ['player_offset_top', 168],
    ['video_player_offset_top', 168], ['bangumi_player_offset_top', 104],
    ['auto_locate', true], ['get_offset_method', 'function'], ['auto_locate_video', true],
    ['auto_locate_bangumi', true], ['click_player_auto_locate', true],
    ['current_player_mode', 'normal'], ['selected_player_mode', 'wide'],
    ['auto_select_video_highest_quality', true], ['auto_cancel_mute', true],
    ['contain_quality4k', false], ['contain_quality8k', false],
    ['webfull_unlock', false], ['auto_reload', false], ['auto_skip', false],
    ['insert_video_description_to_comment', true],
    ['dynamic_video_link', 'https://t.bilibili.com/?tab=video'],
    ['pause_video', false], ['continue_play', false], ['auto_subtitle', false],
    ['show_location', true], ['show_comment_location', true], ['remove_comment_tags', true],
    ['auto_hi_res', true], ['auto_check_update', true],
    ['ai_apikey', ''], ['ai_provider', 'siliconflow'], ['ai_model', 'deepseek-ai/DeepSeek-V3'],
    ['custom_base_url', ''], ['use_custom_model', false], ['custom_model_id', ''],
    ['custom_model_api_url', ''], ['custom_model_api_key', ''],
    ['log_level_info', true], ['log_level_error', true], ['log_level_warn', true],
    ['log_level_debug', false],
    ['update_check_frequency', 24], ['auto_update', false], ['skip_update_check', false],
  ])

  static get storage () { return window.__biliExt.storageService }
  static get logger () { return window.__biliExt.LoggerService ? new window.__biliExt.LoggerService('ConfigService') : console }

  static async initialize () {
    if (this.#initialized) return
    this.#initialized = true
  }

  static async initializeDefaults () {
    await this.initialize()
    for (const [key, defaultValue] of this.DEFAULT_VALUES) {
      const currentValue = await this.storage.getConfig(key)
      if (currentValue === null || currentValue === undefined) {
        await this.setValue(key, defaultValue)
      }
    }
    this.logger.debug('默认配置初始化完成')
  }

  static async getValue (name) {
    if (this.#cache.has(name)) return this.#cache.get(name)
    try {
      const value = await this.storage.getConfig(name)
      if (value === null || value === undefined) {
        const defaultVal = this.DEFAULT_VALUES.get(name)
        if (defaultVal !== undefined) { await this.setValue(name, defaultVal); return defaultVal }
        return null
      }
      this.#cache.set(name, value)
      return value
    } catch (e) {
      const defaultVal = this.DEFAULT_VALUES.get(name)
      return defaultVal !== undefined ? defaultVal : null
    }
  }

  static async setValue (name, value) {
    await this.storage.setConfig(name, value)
    this.#cache.set(name, value)
  }

  static async removeValue (name) {
    await this.storage.removeConfig(name)
    this.#cache.delete(name)
  }

  static invalidateCache (key) { if (key) this.#cache.delete(key); else this.#cache.clear() }
}

window.__biliExt.ConfigService = ConfigService
