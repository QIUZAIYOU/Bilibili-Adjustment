/**
 * Bilibili-Adjustment 浏览器插件 — Popup 弹出面板
 *
 * 提供快速开关常用功能、打开完整设置页、检查更新。
 */

'use strict'

// ==================== 常量 ====================
const TOGGLE_KEYS = [
  // 播放页
  'auto_locate',
  'auto_select_video_highest_quality',
  'webfull_unlock',
  'auto_subtitle',
  'auto_skip',
  // 首页
  'show_comment_location',
  'remove_comment_tags',
  // 系统
  'auto_check_update',
]

const SELECT_KEYS = [
  'selected_player_mode',
]

const VERSION = chrome.runtime.getManifest().version

// ==================== DOM 引用 ====================
const $ = (id) => document.getElementById(id)

// ==================== 初始化 ====================
async function init() {
  $('version').textContent = `v${VERSION}`

  // 1. 加载配置到开关
  await loadToggleStates()

  // 2. 绑定开关事件
  bindToggleEvents()

  // 3. 绑定按钮事件
  $('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })

  $('checkUpdate').addEventListener('click', handleCheckUpdate)

  // 4. 检查是否有待处理的更新通知
  await checkPendingUpdate()
}

// ==================== 加载配置 ====================
async function loadToggleStates() {
  try {
    const allKeys = [...TOGGLE_KEYS, ...SELECT_KEYS]
    const prefixedKeys = allKeys.map(k => `config_${k}`)
    const result = await chrome.storage.sync.get(prefixedKeys)

    for (const key of TOGGLE_KEYS) {
      const el = $(key)
      if (!el) continue
      const storedValue = result[`config_${key}`]
      if (storedValue !== undefined) el.checked = !!storedValue
    }

    for (const key of SELECT_KEYS) {
      const el = $(key)
      if (!el) continue
      const storedValue = result[`config_${key}`]
      if (storedValue !== undefined) el.value = storedValue
    }
  } catch (error) {
    console.error('[BilibiliAdjustment] 加载配置失败:', error)
  }
}

// ==================== 绑定开关 ====================
function bindToggleEvents() {
  for (const key of TOGGLE_KEYS) {
    const el = $(key)
    if (!el) continue
    el.addEventListener('change', async () => {
      try {
        await chrome.storage.sync.set({ [`config_${key}`]: el.checked })
        notifyTab(key, el.checked)
      } catch (error) {
        console.error('[BilibiliAdjustment] 保存配置失败:', error)
      }
    })
  }

  for (const key of SELECT_KEYS) {
    const el = $(key)
    if (!el) continue
    el.addEventListener('change', async () => {
      try {
        await chrome.storage.sync.set({ [`config_${key}`]: el.value })
        notifyTab(key, el.value)
      } catch (error) {
        console.error('[BilibiliAdjustment] 保存配置失败:', error)
      }
    })
  }
}

async function notifyTab(key, value) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'config:changed', key, value })
      .catch(() => {})
  }
}

// ==================== 更新检查 ====================
async function handleCheckUpdate() {
  const btn = $('checkUpdate')
  const info = $('updateInfo')

  btn.disabled = true
  btn.textContent = '⏳ 正在检查...'

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'update:check',
      currentVersion: VERSION,
    })

    if (response.error) {
      showUpdateInfo('检查更新失败: ' + response.error, 'error')
      return
    }

    if (response.hasUpdate) {
      showUpdateInfo(
        `🎉 发现新版本 v${response.latestVersion}！` +
        `<br><a href="${response.url}" target="_blank" style="color:#e94560;">前往下载 →</a>`,
        'success'
      )
    } else {
      showUpdateInfo('✅ 已是最新版本 v' + VERSION, 'success')
    }
  } catch (error) {
    showUpdateInfo('检查更新失败: ' + error.message, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = '🔄 检查更新'
  }
}

async function checkPendingUpdate() {
  try {
    const result = await chrome.storage.local.get('cache_pendingUpdate')
    const pending = result.cache_pendingUpdate
    if (pending) {
      showUpdateInfo(
        `🎉 新版本 v${pending.latestVersion} 可用！` +
        `<br><a href="${pending.url}" target="_blank" style="color:#e94560;">查看详情 →</a>`,
        'success'
      )
      await chrome.storage.local.remove('cache_pendingUpdate')
    }
  } catch (e) {
    // ignore
  }
}

function showUpdateInfo(message, type) {
  const info = $('updateInfo')
  info.innerHTML = message
  info.style.display = 'block'
  info.style.borderColor = type === 'success' ? 'var(--success)' : 'var(--warning)'
  info.style.color = type === 'success' ? 'var(--success)' : 'var(--warning)'

  // 5秒后自动隐藏
  setTimeout(() => {
    info.style.display = 'none'
  }, 8000)
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', init)
