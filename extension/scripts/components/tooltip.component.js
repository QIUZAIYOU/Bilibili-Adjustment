// ===== scripts/components/tooltip.component.js =====
window.__biliExt = window.__biliExt || {}

class Tooltip {
  constructor () {
    this.tooltipEl = null
    this._hideTimeout = null
  }

  init () {
    if (this.tooltipEl) return
    const template = window.__biliExt.templates?.getTemplate?.('tooltip')
    if (template) {
      const t = document.createElement('template')
      t.innerHTML = template
      this.tooltipEl = t.content.firstElementChild
      document.body.appendChild(this.tooltipEl)
    } else {
      this.tooltipEl = document.createElement('div')
      this.tooltipEl.style.cssText = 'position:fixed;z-index:999999;background:#1a1a2e;color:#eaeaea;border:1px solid #2a2a4a;border-radius:6px;padding:6px 10px;font-size:12px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:none;'
      document.body.appendChild(this.tooltipEl)
    }
  }

  show (element, text, options = {}) {
    this.init()
    clearTimeout(this._hideTimeout)
    this.tooltipEl.textContent = text
    this.tooltipEl.style.display = 'block'

    const rect = element.getBoundingClientRect()
    const tooltipRect = this.tooltipEl.getBoundingClientRect()
    const { offsetX = 0, offsetY = -tooltipRect.height - 8, position = 'top' } = options

    let top, left
    if (position === 'top') {
      top = rect.top + offsetY
      left = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + offsetX
    } else if (position === 'bottom') {
      top = rect.bottom + 8
      left = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + offsetX
    } else if (position === 'left') {
      top = rect.top + (rect.height / 2) - (tooltipRect.height / 2)
      left = rect.left - tooltipRect.width - 8
    } else {
      top = rect.top + (rect.height / 2) - (tooltipRect.height / 2)
      left = rect.right + 8
    }

    this.tooltipEl.style.top = `${Math.max(4, top)}px`
    this.tooltipEl.style.left = `${Math.max(4, left)}px`
  }

  hide (delay = 0) {
    if (delay > 0) {
      this._hideTimeout = setTimeout(() => { if (this.tooltipEl) this.tooltipEl.style.display = 'none' }, delay)
    } else {
      if (this.tooltipEl) this.tooltipEl.style.display = 'none'
    }
  }

  destroy () { if (this.tooltipEl) { this.tooltipEl.remove(); this.tooltipEl = null } }
}

window.__biliExt.Tooltip = Tooltip
window.__biliExt.tooltip = new Tooltip()
