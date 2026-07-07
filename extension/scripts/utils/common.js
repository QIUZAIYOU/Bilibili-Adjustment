// ===== scripts/utils/common.js =====
// 通用工具函数 (零依赖)
window.__biliExt = window.__biliExt || {}
window.__biliExt.logger = window.__biliExt.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const common = {}

common.sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

common.delay = (func, timeout, ...args) => new Promise(resolve => {
  setTimeout(() => resolve(func(...args)), timeout)
})

common.detectivePageType = () => {
  const { host, pathname, origin } = window.location
  const temporaryPaths = ['/correspond/', '/api/', '/ajax/', '/pgc/', '/live/', '/h5/', '/game/']
  if (temporaryPaths.some(p => pathname.startsWith(p))) return 'other'
  if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/') || pathname.startsWith('/list/')) return 'video'
  if (host === 'www.bilibili.com' && pathname === '/') return 'home'
  if (origin === 'https://t.bilibili.com') return 'dynamic'
  if (pathname.startsWith('/space/')) return 'space'
  if (pathname.startsWith('/search/')) return 'search'
  if (pathname.startsWith('/anime/')) return 'anime'
  if (pathname.startsWith('/gamecenter/')) return 'gamecenter'
  return 'other'
}

common.isElementSizeChange = (el, callback) => {
  let lastW = el.offsetWidth, lastH = el.offsetHeight
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const nw = e.target.offsetWidth, nh = e.target.offsetHeight
      if (nw !== lastW || nh !== lastH) { lastW = nw; lastH = nh; callback?.(true, { width: nw, height: nh }) }
      else callback?.(false)
    }
  })
  ro.observe(el)
  return ro
}

common.documentScrollTo = (offset, options = {}) => {
  const { maxRetries = 3, retryDelay = 300, tolerance = 2, behavior = 'instant' } = options
  return new Promise((resolve, reject) => {
    let attempts = 0
    const attempt = async () => {
      window.scrollTo({ top: offset, behavior })
      await new Promise(r => requestAnimationFrame(r))
      const ok = Math.abs(window.scrollY - offset) <= tolerance || offset === -5
      if (ok) resolve()
      else if (++attempts <= maxRetries) setTimeout(attempt, retryDelay * (2 ** (attempts - 1)))
      else reject(new Error('scroll failed'))
    }
    attempt()
  })
}

common.getElementOffsetToDocument = el => {
  const r = el.getBoundingClientRect()
  return { top: r.top + window.scrollY - parseFloat(getComputedStyle(el).marginTop), left: r.left + window.scrollX - parseFloat(getComputedStyle(el).marginLeft) }
}

common.addEventListenerToElement = (targets, type, callback, options = {}) => {
  const elements = typeof targets === 'string' ? [...document.querySelectorAll(targets)]
    : Array.isArray(targets) ? targets.filter(el => el instanceof Element) : [targets].filter(el => el instanceof Element)
  if (!elements.length) return () => {}
  const opts = { passive: true, capture: false, ...options }
  elements.forEach(el => el.addEventListener(type, callback, opts))
  return () => elements.forEach(el => el.removeEventListener(type, callback, opts))
}

common.executeFunctionsSequentially = async (arr, opts = {}) => {
  const { concurrency = 1, continueOnError = false } = opts
  const chunks = []
  for (let i = 0; i < arr.length; i += concurrency) chunks.push(arr.slice(i, i + concurrency))
  const results = []
  for (const chunk of chunks) {
    const r = await Promise.allSettled(chunk.map(async item => {
      const [func, execute = true] = Array.isArray(item) ? item : [item, true]
      if (!execute) return null
      try { return await (func()) } catch (e) { if (!continueOnError) throw e; return null }
    }))
    results.push(...r)
  }
  return results
}

common.isTabActive = (options = {}) => {
  const { onActiveChange, immediate = false, once = false, checkInterval = 1000 } = options
  const check = () => { const v = document.visibilityState === 'visible'; onActiveChange?.(v); if (v && once) { clearInterval(id); id = null } }
  if (immediate) check()
  let id = setInterval(check, checkInterval)
  return () => { if (id) { clearInterval(id); id = null } }
}

common.monitorHrefChange = callback => {
  let lastHref = location.href
  const handler = () => { const cur = location.href; if (cur !== lastHref) { lastHref = cur; callback() } }
  window.addEventListener('hashchange', handler, { passive: true })
  window.addEventListener('popstate', handler, { passive: true })
  const { pushState, replaceState } = history
  history.pushState = function (...args) { const r = pushState.apply(this, args); handler(); return r }
  history.replaceState = function (...args) { const r = replaceState.apply(this, args); handler(); return r }
  return () => {
    window.removeEventListener('hashchange', handler)
    window.removeEventListener('popstate', handler)
    history.pushState = pushState; history.replaceState = replaceState
  }
}

common.createElementAndInsert = (html, target, method = 'append') => {
  const t = document.createElement('template'); t.innerHTML = html.trim()
  const f = t.content.cloneNode(true); const nodes = [...f.children]
  if (method === 'replaceWith') target.replaceWith(f); else target[method](f)
  return nodes.length > 1 ? nodes : nodes[0]
}

common.getTotalSecondsFromTimeString = str => {
  const p = str.split(':')
  if (p.length === 1) return parseInt(p[0]) || 0
  if (p.length === 2) return parseInt(p[0]) * 60 + (parseInt(p[1]) || 0)
  if (p.length === 3) return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + (parseInt(p[2]) || 0)
  return 0
}

common.insertStyleToDocument = styles => {
  if (typeof styles !== 'object' || Array.isArray(styles)) throw new Error('Expected object')
  for (const [id, css] of Object.entries(styles)) {
    let el = document.getElementById(id)
    if (!css) { el?.remove(); continue }
    if (!el) { el = document.createElement('style'); el.id = id; document.head.append(el) }
    el.textContent = css
  }
}

common.getBodyHeight = () => Math.max(document.body.clientHeight || 0, document.documentElement.clientHeight || 0)

common.initializeCheckbox = (elements, configs, configKey) => {
  ;[].concat(elements).forEach(el => {
    if (!(el instanceof HTMLInputElement)) return
    const key = configKey || el.id
    if (!(key in configs)) return
    requestAnimationFrame(() => { el.checked = !!configs[key]; el.dispatchEvent(new Event('change', { bubbles: true })) })
  })
}

window.__biliExt.common = common
