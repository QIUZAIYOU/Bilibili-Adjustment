// ===== scripts/services/update.service.js =====
window.__biliExt = window.__biliExt || {}

class UpdateService {
  static #checkExecuted = false

  static get logger () { return window.__biliExt.LoggerService ? new window.__biliExt.LoggerService('UpdateService') : console }
  static get bridge () { return window.__biliExt.bridge }

  static async checkForUpdates (currentVersion, changelog) {
    if (this.#checkExecuted) return null
    this.#checkExecuted = true

    try {
      const result = await this.bridge.checkUpdate(currentVersion)
      if (result?.hasUpdate) {
        this.logger.info(`发现新版本: ${result.latestVersion}`)
        this.#showUpdateNotification(result, changelog)
      } else {
        this.logger.info('已是最新版本')
      }
      return result
    } catch (error) {
      this.logger.error('更新检查失败:', error)
      return null
    }
  }

  static #showUpdateNotification (updateInfo, changelog) {
    const common = window.__biliExt.common
    const container = document.createElement('div')
    container.className = 'bili-adjustment-update-notification'
    container.style.cssText = `position:fixed;top:12px;right:12px;z-index:999999;background:#16213e;border:1px solid #e94560;border-radius:8px;padding:16px;max-width:360px;color:#eaeaea;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;`

    const header = document.createElement('div')
    header.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:8px;color:#e94560;'
    header.textContent = `🎉 新版本 v${updateInfo.latestVersion} 可用！`
    container.appendChild(header)

    if (updateInfo.body) {
      const body = document.createElement('div')
      body.style.cssText = 'font-size:12px;color:#8899aa;margin-bottom:12px;max-height:200px;overflow-y:auto;line-height:1.6;'
      body.textContent = updateInfo.body.replace(/^## /gm, '').replace(/[#*]/g, '').slice(0, 500)
      container.appendChild(body)
    }

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:8px;'
    const downloadBtn = document.createElement('a')
    downloadBtn.href = updateInfo.url || 'https://github.com/QIUZAIYOU/Bilibili-Adjustment/releases/latest'
    downloadBtn.target = '_blank'
    downloadBtn.textContent = '📥 前往下载'
    downloadBtn.style.cssText = 'flex:1;padding:6px 12px;background:#e94560;color:white;border-radius:6px;text-align:center;text-decoration:none;font-size:12px;'
    actions.appendChild(downloadBtn)

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '关闭'
    closeBtn.style.cssText = 'padding:6px 12px;background:#0f3460;color:#eaeaea;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer;font-size:12px;'
    closeBtn.onclick = () => container.remove()
    actions.appendChild(closeBtn)

    container.appendChild(actions)
    document.body.appendChild(container)

    // 5 分钟后自动关闭
    setTimeout(() => container.remove(), 300000)
  }

  static isCheckExecuted () { return this.#checkExecuted }
  static markCheckExecuted () { this.#checkExecuted = true }
}

window.__biliExt.UpdateService = UpdateService
