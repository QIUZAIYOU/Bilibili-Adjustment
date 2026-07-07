// ===== scripts/components/settings-renderer.js =====
window.__biliExt = window.__biliExt || {}

class SettingsRenderer {
  constructor () {
    this.settingsConfig = window.__biliExt.settingsConfig
  }

  render (configs, container) {
    container.innerHTML = ''
    const groups = this.settingsConfig.videoSettingsGroups || []
    for (const group of groups) {
      const items = this.settingsConfig.videoSettingsConfig.filter(s => s.category === group.id)
      if (!items.length) continue
      const groupEl = document.createElement('div')
      groupEl.style.cssText = 'margin-bottom:16px;'
      const title = document.createElement('h3')
      title.style.cssText = 'font-size:13px;color:#8899aa;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;'
      title.textContent = group.label
      groupEl.appendChild(title)
      for (const item of items) {
        const row = this._renderItem(item, configs)
        if (row) groupEl.appendChild(row)
      }
      container.appendChild(groupEl)
    }
  }

  _renderItem(item, configs) {
    if (item.visible && typeof item.visible === 'function' && !item.visible(configs)) return null
    if (item.type === 'section') {
      const section = document.createElement('div')
      section.style.cssText = 'margin-bottom:16px;padding:12px;background:#0d1117;border-radius:8px;'
      const label = document.createElement('div')
      label.style.cssText = 'font-size:14px;font-weight:500;color:#eaeaea;margin-bottom:8px;'
      label.textContent = item.label
      section.appendChild(label)
      if (item.items) {
        for (const child of item.items) {
          const r = this._renderItem(child, configs)
          if (r) section.appendChild(r)
        }
      }
      return section
    }
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;'
    if (item.type === 'checkbox') {
      const label = document.createElement('label')
      label.style.cssText = 'font-size:13px;color:#eaeaea;cursor:pointer;'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = !!configs[item.id]
      checkbox.style.cssText = 'margin-right:8px;accent-color:#e94560;'
      checkbox.dataset.configKey = item.id
      label.prepend(checkbox)
      label.append(item.label)
      row.appendChild(label)
      if (item.tips) {
        const tips = document.createElement('div')
        tips.style.cssText = 'font-size:11px;color:#8899aa;margin-top:2px;'
        tips.textContent = typeof item.tips === 'function' ? item.tips(configs) : item.tips
        row.appendChild(tips)
      }
    } else if (item.type === 'input') {
      const label = document.createElement('span')
      label.style.cssText = 'font-size:13px;color:#eaeaea;'
      label.textContent = item.label
      row.appendChild(label)
      const input = document.createElement('input')
      input.type = item.inputType || 'text'
      input.value = configs[item.id] || ''
      input.placeholder = item.placeholder || ''
      input.style.cssText = 'width:120px;padding:4px 8px;background:#0d1117;border:1px solid #2a2a4a;border-radius:4px;color:#eaeaea;font-size:12px;'
      input.dataset.configKey = item.id
      row.appendChild(input)
    } else if (item.type === 'select' || item.type === 'radio') {
      const label = document.createElement('span')
      label.style.cssText = 'font-size:13px;color:#eaeaea;'
      label.textContent = item.label
      row.appendChild(label)
      const select = document.createElement('select')
      select.style.cssText = 'padding:4px 8px;background:#0d1117;border:1px solid #2a2a4a;border-radius:4px;color:#eaeaea;font-size:12px;'
      select.dataset.configKey = item.id
      const options = item.options || []
      for (const opt of options) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label
        if (String(opt.value) === String(configs[item.id])) o.selected = true
        select.appendChild(o)
      }
      row.appendChild(select)
    }
    return row
  }
}

window.__biliExt.SettingsRenderer = SettingsRenderer
