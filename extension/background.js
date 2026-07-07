/**
 * Bilibili-Adjustment 浏览器插件 — Background Service Worker
 *
 * 职责：
 * - 作为后台常驻进程，处理跨域请求（AI API、更新检查等）
 * - 管理 chrome.storage（替代前端 IndexedDB）
 * - 定时检查更新（chrome.alarms）
 * - 消息中转：Content Script ↔ Background
 */

// ==================== 常量 ====================
const STORAGE_KEYS = {
  CONFIG_PREFIX: 'config_',
  HISTORY_PREFIX: 'history_',
  CACHE_PREFIX: 'cache_',
  PROXY_STATUS: 'proxyStatus',
  UPDATE_CACHE: 'latestScriptCache',
}

const DEFAULT_CONFIG = {
  // 播放页
  auto_locate: true,
  offset_top: 5,
  player_offset_top: 168,
  video_player_offset_top: 168,
  bangumi_player_offset_top: 104,
  auto_locate_video: true,
  auto_locate_bangumi: true,
  click_player_auto_locate: true,
  current_player_mode: 'normal',
  selected_player_mode: 'wide',
  auto_select_video_highest_quality: true,
  contain_quality4k: false,
  contain_quality8k: false,
  auto_cancel_mute: true,
  webfull_unlock: false,
  pause_video: false,
  continue_play: false,
  auto_subtitle: false,
  auto_hi_res: true,
  is_vip: true,
  insert_video_description_to_comment: true,
  show_comment_location: true,
  remove_comment_tags: true,
  // 广告跳过
  auto_skip: false,
  auto_reload: false,
  // AI 服务
  ai_apikey: '',
  ai_provider: 'siliconflow',
  ai_model: 'deepseek-ai/DeepSeek-V3',
  custom_base_url: '',
  use_custom_model: false,
  custom_model_id: '',
  custom_model_api_url: '',
  custom_model_api_key: '',
  // 首页
  dynamic_video_link: 'https://t.bilibili.com/?tab=video',
  // 更新
  auto_check_update: true,
  update_check_frequency: 24,
  auto_update: false,
  skip_update_check: false,
  // 日志
  log_level_info: true,
  log_level_error: true,
  log_level_warn: true,
  log_level_debug: false,
}

// ==================== 存储服务 ====================
const Storage = {
  /** 获取用户配置 */
  async getConfig(key) {
    const result = await chrome.storage.sync.get(`${STORAGE_KEYS.CONFIG_PREFIX}${key}`)
    const value = result[`${STORAGE_KEYS.CONFIG_PREFIX}${key}`]
    return value !== undefined ? value : DEFAULT_CONFIG[key]
  },

  /** 批量获取配置 */
  async getConfigs(keys) {
    const prefixedKeys = keys.map(k => `${STORAGE_KEYS.CONFIG_PREFIX}${k}`)
    const result = await chrome.storage.sync.get(prefixedKeys)
    const configs = {}
    for (const key of keys) {
      const prefixed = `${STORAGE_KEYS.CONFIG_PREFIX}${key}`
      configs[key] = result[prefixed] !== undefined ? result[prefixed] : DEFAULT_CONFIG[key]
    }
    return configs
  },

  /** 设置用户配置 */
  async setConfig(key, value) {
    await chrome.storage.sync.set({ [`${STORAGE_KEYS.CONFIG_PREFIX}${key}`]: value })
  },

  /** 批量设置配置 */
  async setConfigs(configs) {
    const entries = {}
    for (const [key, value] of Object.entries(configs)) {
      entries[`${STORAGE_KEYS.CONFIG_PREFIX}${key}`] = value
    }
    await chrome.storage.sync.set(entries)
  },

  /** 删除配置 */
  async removeConfig(key) {
    await chrome.storage.sync.remove(`${STORAGE_KEYS.CONFIG_PREFIX}${key}`)
  },

  /** 获取所有配置（用于导入/导出） */
  async getAllConfigs() {
    const result = await chrome.storage.sync.get(null)
    const configs = {}
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith(STORAGE_KEYS.CONFIG_PREFIX)) {
        configs[key.slice(STORAGE_KEYS.CONFIG_PREFIX.length)] = value
      }
    }
    return { ...DEFAULT_CONFIG, ...configs }
  },

  /** 重置所有配置 */
  async resetAllConfigs() {
    await chrome.storage.sync.clear()
  },

  // ---- 首页推荐视频历史记录 ----

  async getHistory() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_PREFIX)
    return result[STORAGE_KEYS.HISTORY_PREFIX] || []
  },

  async setHistory(items) {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_PREFIX]: items })
  },

  async addHistoryItem(item) {
    const history = await this.getHistory()
    history.unshift({
      ...item,
      timestamp: Date.now(),
    })
    // 最多保留 500 条
    if (history.length > 500) history.length = 500
    await this.setHistory(history)
    return history
  },

  async clearHistory() {
    await chrome.storage.local.remove(STORAGE_KEYS.HISTORY_PREFIX)
  },

  async searchHistory(query) {
    const history = await this.getHistory()
    const q = query.toLowerCase()
    return history.filter(item =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.author && item.author.toLowerCase().includes(q))
    )
  },

  // ---- 缓存 ----

  async getCache(key) {
    const result = await chrome.storage.local.get(`${STORAGE_KEYS.CACHE_PREFIX}${key}`)
    return result[`${STORAGE_KEYS.CACHE_PREFIX}${key}`]
  },

  async setCache(key, value) {
    await chrome.storage.local.set({ [`${STORAGE_KEYS.CACHE_PREFIX}${key}`]: value })
  },

  async removeCache(key) {
    await chrome.storage.local.remove(`${STORAGE_KEYS.CACHE_PREFIX}${key}`)
  },
}

// ==================== 更新检查服务 ====================
const UpdateChecker = {
  GITHUB_API_URL: 'https://api.github.com/repos/QIUZAIYOU/Bilibili-Adjustment/releases/latest',
  GITHUB_RAW_URL: 'https://raw.githubusercontent.com/QIUZAIYOU/Bilibili-Adjustment/main/package.json',

  async checkForUpdates(currentVersion) {
    try {
      const response = await fetch(this.GITHUB_API_URL, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      })
      if (!response.ok) {
        // 回退到 raw 方式
        return await this._checkViaRaw(currentVersion)
      }
      const data = await response.json()
      const latestVersion = data.tag_name?.replace(/^v/, '') || data.name
      if (!latestVersion) return { hasUpdate: false }

      const hasUpdate = this._compareVersions(latestVersion, currentVersion) > 0
      return {
        hasUpdate,
        latestVersion,
        currentVersion,
        url: data.html_url,
        body: data.body,
        publishedAt: data.published_at,
      }
    } catch (error) {
      console.error('[BilibiliAdjustment] 更新检查失败:', error)
      return { hasUpdate: false, error: error.message }
    }
  },

  async _checkViaRaw(currentVersion) {
    const response = await fetch(this.GITHUB_RAW_URL)
    if (!response.ok) return { hasUpdate: false }
    const pkg = await response.json()
    const latestVersion = pkg.version
    if (!latestVersion) return { hasUpdate: false }

    const hasUpdate = this._compareVersions(latestVersion, currentVersion) > 0
    return {
      hasUpdate,
      latestVersion,
      currentVersion,
      url: 'https://github.com/QIUZAIYOU/Bilibili-Adjustment/releases/latest',
    }
  },

  _compareVersions(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na > nb) return 1
      if (na < nb) return -1
    }
    return 0
  },
}

// ==================== AI 服务代理 ====================
const AIService = {
  SILICONFLOW_BASE: 'https://api.siliconflow.cn/v1',

  /** 通过后台代理 AI API 调用（绕过 CORS） */
  async chatCompletion(provider, model, messages, apiKey, customBaseUrl) {
    let url, headers, body

    if (provider === 'siliconflow') {
      url = `${this.SILICONFLOW_BASE}/chat/completions`
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }
      body = { model, messages, temperature: 0.1, max_tokens: 500 }
    } else if (provider === 'custom') {
      const baseUrl = customBaseUrl || 'https://api.openai.com/v1'
      url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }
      body = { model, messages, temperature: 0.1, max_tokens: 500 }
    } else {
      throw new Error(`不支持的 AI 提供商: ${provider}`)
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!response.ok) {
      const err = await response.text()
      throw new Error(`AI API 错误 (${response.status}): ${err}`)
    }
    return response.json()
  },

  /** 验证 API Key 有效性 */
  async validateApiKey(provider, apiKey) {
    try {
      await this.chatCompletion(provider, 'gpt-3.5-turbo', [
        { role: 'user', content: 'test' }
      ], apiKey)
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error.message }
    }
  },

  /** 获取可用模型列表 */
  async getModels(provider, apiKey) {
    if (provider === 'siliconflow') {
      const response = await fetch(`${this.SILICONFLOW_BASE}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!response.ok) throw new Error('获取模型列表失败')
      const data = await response.json()
      return data.data || []
    }
    return []
  },
}

// ==================== 消息处理 ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.type]
  if (handler) {
    handler(message, sender).then(sendResponse).catch(error => {
      console.error('[BilibiliAdjustment] 消息处理错误:', message.type, error)
      sendResponse({ error: error.message })
    })
    return true // 保持通道打开，支持异步响应
  }
})

const MESSAGE_HANDLERS = {
  // 配置操作
  async 'config:get'({ key }) {
    const value = await Storage.getConfig(key)
    return { value }
  },
  async 'config:getMany'({ keys }) {
    return await Storage.getConfigs(keys)
  },
  async 'config:set'({ key, value }) {
    await Storage.setConfig(key, value)
    return { success: true }
  },
  async 'config:setMany'({ configs }) {
    await Storage.setConfigs(configs)
    return { success: true }
  },
  async 'config:getAll'() {
    const configs = await Storage.getAllConfigs()
    return { configs }
  },
  async 'config:reset'() {
    await Storage.resetAllConfigs()
    return { success: true }
  },
  async 'config:remove'({ key }) {
    await Storage.removeConfig(key)
    return { success: true }
  },

  // 历史记录操作
  async 'history:get'() {
    const items = await Storage.getHistory()
    return { items }
  },
  async 'history:add'({ item }) {
    const items = await Storage.addHistoryItem(item)
    return { items }
  },
  async 'history:clear'() {
    await Storage.clearHistory()
    return { success: true }
  },
  async 'history:search'({ query }) {
    const items = await Storage.searchHistory(query)
    return { items }
  },

  // 更新检查
  async 'update:check'({ currentVersion }) {
    return await UpdateChecker.checkForUpdates(currentVersion)
  },

  // AI 服务
  async 'ai:chat'({ provider, model, messages, apiKey, customBaseUrl }) {
    const result = await AIService.chatCompletion(provider, model, messages, apiKey, customBaseUrl)
    return result
  },
  async 'ai:validateKey'({ provider, apiKey }) {
    return await AIService.validateApiKey(provider, apiKey)
  },
  async 'ai:getModels'({ provider, apiKey }) {
    return await AIService.getModels(provider, apiKey)
  },

  // 缓存
  async 'cache:get'({ key }) {
    const value = await Storage.getCache(key)
    return { value }
  },
  async 'cache:set'({ key, value }) {
    await Storage.setCache(key, value)
    return { success: true }
  },
}

// ==================== 定时任务 ====================
// 启动时注册每日更新检查
chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化默认配置（首次安装时）
  if (details.reason === 'install') {
    await Storage.setConfigs(DEFAULT_CONFIG)
    console.log('[BilibiliAdjustment] 初始配置已写入')

    // 打开欢迎/选项页面
    chrome.runtime.openOptionsPage()
  }

  // 设置定时检查更新（每6小时一次）
  chrome.alarms.create('updateCheck', { periodInMinutes: 360 })
})

// 处理定时任务
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateCheck') {
    const autoCheck = await Storage.getConfig('auto_check_update')
    if (autoCheck) {
      const result = await UpdateChecker.checkForUpdates('3.13.3')
      if (result.hasUpdate) {
        // 通知用户（通过 storage 标记，等待下次 content script 初始化时读取）
        await Storage.setCache('pendingUpdate', result)
      }
    }
  }
})

console.log('[BilibiliAdjustment] Background Service Worker 已启动')
