/**
 * Bilibili-Adjustment 浏览器插件 — Options 设置页
 *
 * 完整设置管理：读取/写入 chrome.storage.sync，提供所有配置项的 UI。
 */

'use strict'

// ==================== 配置项映射 ====================
// 所有支持在设置页中编辑的配置项
const CONFIG_KEYS = {
  // 播放页
  auto_locate: { type: 'checkbox', default: true },
  offset_top: { type: 'number', default: 5 },
  click_player_auto_locate: { type: 'checkbox', default: true },
  selected_player_mode: { type: 'select', default: 'wide' },
  auto_select_video_highest_quality: { type: 'checkbox', default: true },
  contain_quality4k: { type: 'checkbox', default: false },
  contain_quality8k: { type: 'checkbox', default: false },
  auto_hi_res: { type: 'checkbox', default: true },
  auto_subtitle: { type: 'checkbox', default: false },
  webfull_unlock: { type: 'checkbox', default: false },
  insert_video_description_to_comment: { type: 'checkbox', default: true },
  show_comment_location: { type: 'checkbox', default: true },
  remove_comment_tags: { type: 'checkbox', default: true },
  pause_video: { type: 'checkbox', default: false },
  continue_play: { type: 'checkbox', default: false },
  auto_reload: { type: 'checkbox', default: false },
  auto_cancel_mute: { type: 'checkbox', default: true },
  // 首页
  home_history_enabled: { type: 'checkbox', default: true },
  // 动态页
  dynamic_video_link: { type: 'text', default: 'https://t.bilibili.com/?tab=video' },
  // 广告跳过
  auto_skip: { type: 'checkbox', default: false },
  skip_start: { type: 'number', default: 0 },
  skip_end: { type: 'number', default: 0 },
  // AI 服务
  ai_provider: { type: 'select', default: 'siliconflow' },
  ai_apikey: { type: 'text', default: '' },
  ai_model: { type: 'select', default: 'deepseek-ai/DeepSeek-V3' },
  custom_base_url: { type: 'text', default: '' },
  // 更新
  auto_check_update: { type: 'checkbox', default: true },
  update_check_frequency: { type: 'number', default: 24 },
}

// ==================== DOM 工具 ====================
const $ = (id) => document.getElementById(id)
const $$ = (sel) => document.querySelectorAll(sel)

// ==================== 初始化 ====================
async function init() {
  const manifest = chrome.runtime.getManifest()

  // 版本信息
  const versionEls = $$('#version, #aboutVersion')
  versionEls.forEach(el => { el.textContent = `v${manifest.version}` })

  // 1. 加载配置
  await loadAllConfigs()

  // 2. 绑定导航切换
  bindNavigation()

  // 3. 绑定配置变更事件
  bindConfigChanges()

  // 4. 绑定 AI 提供商切换联动
  bindAIProviderToggle()

  // 5. 绑定操作按钮
  bindActions()
}

// ==================== 加载配置 ====================
async function loadAllConfigs() {
  const storageKeys = Object.keys(CONFIG_KEYS).map(k => `config_${k}`)

  let stored
  try {
    stored = await chrome.storage.sync.get(storageKeys)
  } catch (error) {
    console.error('[BilibiliAdjustment] 读取配置失败:', error)
    return
  }

  for (const [key, meta] of Object.entries(CONFIG_KEYS)) {
    const el = $(key)
    if (!el) continue

    const storedValue = stored[`config_${key}`]
    const value = storedValue !== undefined ? storedValue : meta.default

    switch (meta.type) {
      case 'checkbox':
        el.checked = !!value
        break
      case 'number':
        el.value = value
        break
      case 'text':
      case 'select':
        el.value = value
        break
    }
  }
}

// ==================== 保存配置 ====================
async function saveConfig(key) {
  const meta = CONFIG_KEYS[key]
  if (!meta) return

  const el = $(key)
  if (!el) return

  let value
  switch (meta.type) {
    case 'checkbox':
      value = el.checked
      break
    case 'number':
      value = parseInt(el.value, 10) || 0
      break
    case 'text':
    case 'select':
      value = el.value
      break
    default:
      return
  }

  try {
    await chrome.storage.sync.set({ [`config_${key}`]: value })
  } catch (error) {
    console.error(`[BilibiliAdjustment] 保存配置 ${key} 失败:`, error)
    showToast(`保存失败: ${key}`, 'error')
  }
}

// ==================== 导航切换 ====================
function bindNavigation() {
  const navItems = $$('.nav-item')

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault()

      // 高亮导航
      navItems.forEach(n => n.classList.remove('active'))
      item.classList.add('active')

      // 切换区块
      const section = item.dataset.section
      $$('.settings-section').forEach(s => s.classList.remove('active'))
      $(`section-${section}`)?.classList.add('active')

      // 更新 URL hash
      history.replaceState(null, '', `#${section}`)
    })
  })

  // 从 URL hash 恢复导航
  const hash = location.hash.slice(1) || 'player'
  const targetNav = document.querySelector(`.nav-item[data-section="${hash}"]`)
  if (targetNav) targetNav.click()
}

// ==================== 配置变更绑定 ====================
function bindConfigChanges() {
  for (const key of Object.keys(CONFIG_KEYS)) {
    const el = $(key)
    if (!el) continue

    const meta = CONFIG_KEYS[key]
    const eventType = meta.type === 'checkbox' ? 'change' : 'input'

    el.addEventListener(eventType, () => {
      saveConfig(key)
    })
  }
}

// ==================== AI 提供商联动 ====================
function bindAIProviderToggle() {
  const providerEl = $('ai_provider')
  const customGroup = $('customModelGroup')

  const toggleCustom = () => {
    if (providerEl) {
      customGroup.style.display = providerEl.value === 'custom' ? 'flex' : 'none'
    }
  }

  providerEl?.addEventListener('change', toggleCustom)
  toggleCustom()
}

// ==================== 操作按钮 ====================
function bindActions() {
  // 导出配置
  $('exportConfig')?.addEventListener('click', handleExportConfig)

  // 导入配置
  $('importConfig')?.addEventListener('click', () => {
    $('importFileInput')?.click()
  })
  $('importFileInput')?.addEventListener('change', handleImportConfig)

  // 重置配置
  $('resetConfig')?.addEventListener('click', handleResetConfig)
}

// ==================== 导出配置 ====================
async function handleExportConfig() {
  try {
    const result = await chrome.storage.sync.get(null)
    const configs = {}
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('config_')) {
        configs[key.slice(7)] = value
      }
    }

    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bilibili-adjustment-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast('配置已导出', 'success')
  } catch (error) {
    showToast('导出失败: ' + error.message, 'error')
  }
}

// ==================== 导入配置 ====================
async function handleImportConfig(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const configs = JSON.parse(text)

    // 验证格式
    if (typeof configs !== 'object' || Array.isArray(configs)) {
      throw new Error('无效的配置文件格式')
    }

    // 写入存储
    const entries = {}
    let importCount = 0
    for (const [key, value] of Object.entries(configs)) {
      if (CONFIG_KEYS[key]) {
        entries[`config_${key}`] = value
        importCount++
      }
    }

    if (importCount === 0) {
      showToast('未找到可导入的配置项', 'error')
      return
    }

    await chrome.storage.sync.set(entries)

    // 重新加载页面配置
    await loadAllConfigs()

    showToast(`成功导入 ${importCount} 项配置`, 'success')
  } catch (error) {
    showToast('导入失败: ' + error.message, 'error')
  }

  // 重置 file input 以便重复导入
  event.target.value = ''
}

// ==================== 重置配置 ====================
async function handleResetConfig() {
  if (!confirm('确定要重置所有配置吗？此操作不可撤销。')) return
  if (!confirm('再次确认：这将清除所有自定义设置！')) return

  try {
    await chrome.storage.sync.clear()

    // 恢复默认值
    const defaults = {}
    for (const [key, meta] of Object.entries(CONFIG_KEYS)) {
      defaults[`config_${key}`] = meta.default
    }
    await chrome.storage.sync.set(defaults)

    await loadAllConfigs()
    showToast('配置已重置为默认值', 'success')
  } catch (error) {
    showToast('重置失败: ' + error.message, 'error')
  }
}

// ==================== Toast 通知 ====================
function showToast(message, type = '') {
  const toast = $('toast')
  if (!toast) return

  toast.textContent = message
  toast.className = 'toast ' + type
  toast.classList.add('show')

  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', init)
