// ===== scripts/components/settings.component.v2.js =====
// 页面内设置面板（用于在 B 站页面内直接调整设置）
window.__biliExt = window.__biliExt || {}

class SettingsPanel {
  constructor () {
    this.panel = null
    this.overlay = null
    this.isOpen = false
  }

  async open () {
    if (this.isOpen) return
    this.isOpen = true

    const configs = await window.__biliExt.ConfigService.getAllConfigs()
    const templateHtml = window.__biliExt.templates?.getTemplate?.('settingsPanel')
    if (templateHtml) {
      const t = document.createElement('template')
      t.innerHTML = templateHtml
      const fragment = t.content
      this.overlay = fragment.querySelector('#biliSettingsOverlay')
      this.panel = fragment.querySelector('#biliSettingsPanel')
      document.body.appendChild(this.overlay)
      document.body.appendChild(this.panel)

      const content = this.panel.querySelector('#biliSettingsContent')
      const renderer = new (window.__biliExt.SettingsRenderer)()
      renderer.render(configs, content)

      const closeBtn = this.panel.querySelector('#biliSettingsClose')
      closeBtn?.addEventListener('click', () => this.close())

      this.overlay?.addEventListener('click', () => this.close())

      // 绑定配置变更
      content.querySelectorAll('[data-config-key]').forEach(el => {
        const key = el.dataset.configKey
        const eventType = el.type === 'checkbox' ? 'change' : 'input'
        el.addEventListener(eventType, async () => {
          let value
          if (el.type === 'checkbox') value = el.checked
          else if (el.type === 'number') value = parseInt(el.value) || 0
          else value = el.value
          await window.__biliExt.ConfigService.setValue(key, value)
        })
      })
    }
  }

  close () {
    this.overlay?.remove()
    this.panel?.remove()
    this.overlay = null
    this.panel = null
    this.isOpen = false
  }
}

window.__biliExt.SettingsPanel = SettingsPanel
