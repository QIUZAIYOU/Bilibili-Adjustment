/**
 * Bilibili-Adjustment 浏览器插件 — Content Script
 *
 * ISOLATED world → chrome.* API 全部可用。
 * 通过 <script src="chrome-extension://..."> 注入脚本到 MAIN world，
 * 避免 CSP 阻断内联脚本。
 *
 * 架构：
 *   ISOLATED (此文件) → <script src> → MAIN world (bridge + 36 个模块)
 *   MAIN world (模块) → postMessage → ISOLATED → chrome.runtime.sendMessage → Background
 */

'use strict'

// ==================== 扩展 URL 基础 ====================
const EXT_ID = chrome.runtime.id
const EXT_URL = (path) => `chrome-extension://${EXT_ID}/${path}`

// ==================== 跨世界消息桥接（ISOLATED 端） ====================
// 监听 MAIN world 通过 postMessage 发来的请求，转发到 background
window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== '__biliExt' || event.data.type !== 'request') return

  const { requestId, messageType, payload } = event.data
  console.log('[BiliAdjust][Bridge] ISOLATED 收到请求: ' + messageType, payload)
  chrome.runtime.sendMessage({ type: messageType, ...payload }, (response) => {
    console.log('[BiliAdjust][Bridge] ISOLATED 收到响应: ' + messageType, response)
    window.postMessage({
      source: '__biliExt',
      type: 'response',
      requestId: requestId,
      response: response
    }, '*')
  })
})

// ==================== 脚本加载器 ====================
// 全部通过 <script src="chrome-extension://..."> 注入，避免 CSP 阻断

const SCRIPTS = [
  // 桥接 API（必须在所有模块之前加载）
  'scripts/bridge-inject.js',

  // Phase 1: 零依赖基础
  'scripts/utils/common.js',
  'scripts/utils/shadowDOMHelper.js',
  'scripts/shared/theme.js',
  'scripts/shared/selector-registry.js',
  'scripts/shared/template-registry.js',
  'scripts/config/settings-config.js',

  // Phase 2: 核心框架
  'scripts/core/event-bus.js',
  'scripts/services/logger.service.js',
  'scripts/services/storage.service.js',
  'scripts/services/config.service.js',
  'scripts/core/module-system.js',

  // Phase 3: 共享层
  'scripts/shared/regexps.js',
  'scripts/shared/style-utils.js',
  'scripts/shared/element-selectors.js',
  'scripts/shared/biliApis.js',
  'scripts/shared/adDetectionPrompt.js',
  'scripts/shared/templates.js',
  'scripts/shared/styles/common.js',
  'scripts/shared/styles/video-page.js',
  'scripts/shared/styles/home-page.js',
  'scripts/shared/styles/dynamic-page.js',
  'scripts/shared/styles/popover.js',
  'scripts/shared/styles/index.js',

  // Phase 4: 服务层扩展
  'scripts/services/ai.service.js',
  'scripts/services/update.service.js',

  // Phase 5: 组件
  'scripts/components/tooltip.component.js',
  'scripts/components/settings-renderer.js',
  'scripts/components/settings.component.v2.js',

  // Phase 6: 模块
  'scripts/modules/video.module.js',
  'scripts/modules/home.module.js',
  'scripts/modules/dynamic.module.js',

  // Phase 7: 应用初始化
  'scripts/init.js',
]

/** 注入单个 script 标签，返回加载完成的 Promise */
function loadScript (url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-bili-ext-src="${url}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.setAttribute('data-bili-ext-src', url)
    script.src = EXT_URL(url)
    script.onload = resolve
    script.onerror = () => reject(new Error(`加载失败: ${url}`))
    document.documentElement.appendChild(script)
  })
}

// 按序加载所有脚本
;(async () => {
  let loaded = 0; let failed = 0
  console.log('[BilibiliAdjustment] 开始加载 ' + SCRIPTS.length + ' 个脚本')
  for (const src of SCRIPTS) {
    try {
      await loadScript(src)
      loaded++
    } catch (e) {
      console.error('[BilibiliAdjustment] ' + e.message)
      failed++
    }
  }
  console.log(`[BilibiliAdjustment] 脚本加载完成: ${loaded} OK, ${failed} FAIL`)
  if (failed > 0) console.warn('[BilibiliAdjustment] ' + failed + ' 个脚本加载失败')
})()
