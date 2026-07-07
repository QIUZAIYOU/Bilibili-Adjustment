// ===== scripts/services/storage.service.js =====
// 使用 chrome.storage 替代 IndexedDB，通过桥接通信
window.__biliExt = window.__biliExt || {}

class StorageService {
  static #instance

  constructor () {
    if (StorageService.#instance) return StorageService.#instance
    StorageService.#instance = this
  }

  get bridge () { return window.__biliExt.bridge }

  // 配置管理
  async getConfig (key) { return this.bridge.getConfig(key) }
  async setConfig (key, value) { return this.bridge.setConfig(key, value) }
  async removeConfig (key) { return this.bridge.removeConfig(key) }
  async getAllConfigs () { return this.bridge.getAllConfigs() }
  async resetConfig () { return this.bridge.resetConfig() }

  // 历史记录
  async getHistory () { return this.bridge.getHistory() }
  async addHistoryItem (item) { return this.bridge.addHistoryItem(item) }
  async clearHistory () { return this.bridge.clearHistory() }
  async searchHistory (query) { return this.bridge.searchHistory(query) }
}

window.__biliExt.StorageService = StorageService
window.__biliExt.storageService = new StorageService()
