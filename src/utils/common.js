/* global _ */
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('Common')
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    // 过滤临时URL路径
    const temporaryPaths = ['/correspond/', '/api/', '/ajax/', '/pgc/', '/live/', '/h5/', '/game/']
    const isTemporaryPath = temporaryPaths.some(path => pathname.startsWith(path))
    if (isTemporaryPath) {
        logger.debug(`检测到临时URL路径: ${pathname}，跳过页面类型检测`)
        return 'other'
    }
    logger.debug(`检测页面类型: host=${host}, pathname=${pathname}, origin=${origin}`)
    // 视频播放页（包括普通视频、番剧、列表）
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/') || pathname.startsWith('/list/')) {
        logger.debug('匹配到 video 类型页面')
        return 'video'
    }
    // 首页
    if (host === 'www.bilibili.com' && (pathname === '/' || pathname === '/index.html')) {
        logger.debug('匹配到 home 类型页面')
        return 'home'
    }
    // 动态页
    if (origin === 'https://t.bilibili.com') {
        logger.debug('匹配到 dynamic 类型页面')
        return 'dynamic'
    }
    logger.debug('未匹配到已知页面类型，返回 other')
    return 'other'
}
export const isElementSizeChange = (el, callback) => {
    let lastWidth = el.offsetWidth
    let lastHeight = el.offsetHeight
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.contentBoxSize) {
                const newWidth = entry.target.offsetWidth
                const newHeight = entry.target.offsetHeight
                if (newWidth !== lastWidth || newHeight !== lastHeight) {
                    lastWidth = newWidth
                    lastHeight = newHeight
                    callback?.(true, { width: newWidth, height: newHeight })
                } else {
                    callback?.(false)
                }
            }
        }
    })
    resizeObserver.observe(el)
    return resizeObserver
}
export const documentScrollTo = (offset, options = {}) => {
    const {
        maxRetries = 3,
        retryDelay = 300,
        tolerance = 2,
        behavior = 'auto',
        duration = 0
    } = options
    return new Promise((resolve, reject) => {
        let attempts = 0
        const checkPosition = () => {
            const currentY = window.scrollY
            return currentY === offset ||
                   Math.abs(currentY - offset) <= tolerance ||
                   offset === -5
        }
        // duration > 0 时用 rAF 逐帧驱动滚动以精确控制时长；每帧强制 instant，
        // 避免页面 CSS 的 scroll-behavior:smooth 叠加出缓慢的浏览器平滑滚动
        const animateScroll = (targetY, durationMs) => {
            if (durationMs <= 0) {
                window.scrollTo({ top: targetY, behavior })
                return Promise.resolve()
            }
            const startY = window.scrollY
            const distance = targetY - startY
            if (Math.abs(distance) <= tolerance) return Promise.resolve()
            const startTime = performance.now()
            return new Promise(resolveAnimation => {
                const ease = progress => 1 - Math.pow(1 - progress, 3)
                const step = now => {
                    const progress = Math.min(1, (now - startTime) / durationMs)
                    window.scrollTo({ top: startY + distance * ease(progress), behavior: 'instant' })
                    if (progress < 1) {
                        requestAnimationFrame(step)
                    } else {
                        resolveAnimation()
                    }
                }
                requestAnimationFrame(step)
            })
        }
        const attemptScroll = async () => {
            try {
                await animateScroll(offset, duration)
                await new Promise(r => requestAnimationFrame(r))
                if (checkPosition()) {
                    resolve()
                } else if (attempts < maxRetries) {
                    attempts++
                    setTimeout(attemptScroll, retryDelay * (2 ** (attempts - 1)))
                } else {
                    reject(new Error(`Failed to scroll after ${maxRetries} attempts`))
                }
            } catch (error) {
                reject(error)
            }
        }
        attemptScroll()
    })
}
export const getElementOffsetToDocument = element => {
    const rect = element.getBoundingClientRect()
    return {
        top: rect.top + window.scrollY - parseFloat(getComputedStyle(element).marginTop),
        left: rect.left + window.scrollX - parseFloat(getComputedStyle(element).marginLeft)
    }
}
export const getElementComputedStyle = (element, propertyName) => {
    const style = window.getComputedStyle(element)
    if (Array.isArray(propertyName)) {
        return _.pick(style, propertyName)
    }
    if (typeof propertyName === 'string') {
        return style.getPropertyValue(propertyName)
    }
    return _.reduce(style, (obj, property) => {
        obj[property] = style.getPropertyValue(property)
        return obj
    }, {})
}
export const addEventListenerToElement = (targets, type, callback, options = {}) => {
    if (!targets || (typeof targets !== 'object' && typeof targets !== 'string')) {
        throw new Error('Targets must be a DOM element, selector string, or array of elements')
    }
    if (typeof type !== 'string' || !type.trim()) {
        throw new Error('Event type must be a non-empty string')
    }
    if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
    }
    if (options && typeof options !== 'object') {
        throw new Error('Options must be an object or undefined')
    }
    const elements = typeof targets === 'string'
        ? [...document.querySelectorAll(targets)]
        : Array.isArray(targets)
            ? targets.filter(el => el instanceof Element)
            : [targets].filter(el => el instanceof Element)
    if (elements.length === 0) {
        const describeTarget = target => {
            if (typeof target === 'string') return `选择器 "${target}"`
            if (target instanceof Element) return `<${target.tagName.toLowerCase()}>#${target.id}`
            return '空值'
        }
        const targetInfo = Array.isArray(targets) ? targets.map(describeTarget).join(' | ') : describeTarget(targets)
        logger.debug(`未找到有效的元素用于添加事件监听器（目标: ${targetInfo}）`)
        return () => {}
    }
    const finalOptions = {
        passive: true,
        capture: false,
        ...options
    }
    elements.forEach(element => {
        try {
            element.addEventListener(type, callback, finalOptions)
        } catch (error) {
            logger.error('添加元素事件监听器失败:', error)
        }
    })
    return () => {
        elements.forEach(element => {
            try {
                element.removeEventListener(type, callback, finalOptions)
            } catch (error) {
                logger.error('移除元素事件监听器失败:', error)
            }
        })
    }
}
export const executeFunctionsSequentially = async (
    functionsArray,
    options = { concurrency: 1, continueOnError: false }
) => {
    const { concurrency, continueOnError } = options
    const chunks = _.chunk(functionsArray, concurrency)
    const results = []
    for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
            chunk.map(async item => { // 处理单个项（可能是数组或函数）
                // 判断是否为数组，非数组则包装为 [func, true]
                const [func, execute = true] = Array.isArray(item) ? item : [item, true]
                if (!execute) return null // 跳过不执行的函数
                try {
                    const result = await func()
                    if (result?.callback) {
                        await executeFunctionsSequentially(result.callback, options)
                    }
                    return result
                } catch (error) {
                    logger.error('函数执行失败:', error)
                    if (!continueOnError) throw error
                    return null
                }
            })
        )
        results.push(...chunkResults)
    }
    return results
}
export const isTabActive = (options = {}) => {
    const {
        onActiveChange,
        immediate = false,
        once = false,
        checkInterval = 1000
    } = options
    const checkVisibility = () => {
        const currentState = document.visibilityState
        if (currentState === 'visible') {
            // logger.debug('页面已激活')
            onActiveChange?.(true)
            if (once) {
                clearInterval(intervalId)
                intervalId = null
            }
        } else {
            logger.debug('页面未激活')
            onActiveChange?.(false)
        }
    }
    let intervalId = null
    if (immediate) checkVisibility()
    if (!once || document.visibilityState !== 'visible') {
        intervalId = setInterval(checkVisibility, checkInterval)
    }
    return () => {
        if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
        }
    }
}
const hrefChangeListeners = new Set()
let hrefMonitorInitialized = false
let hrefMonitorLastHref = location.href
let originalPushState
let originalReplaceState
const hrefListenerOptions = { passive: true, capture: true }
const getFinalHref = url => {
    const pParam = url.searchParams.get('p')
    return `${url.href.split('?')[0].trim()}${pParam ? `?p=${pParam}` : ''}`.replace(/\/+$/, '')
}
const notifyHrefChange = () => {
    const currentHref = location.href
    const previousUrl = new URL(hrefMonitorLastHref)
    const currentUrl = new URL(currentHref)
    if (getFinalHref(previousUrl) === getFinalHref(currentUrl)) return
    hrefMonitorLastHref = currentHref
    hrefChangeListeners.forEach(callback => {
        try {
            Promise.resolve(callback()).catch(error => logger.error('URL变更回调错误:', error))
        } catch (error) {
            logger.error('URL变更回调错误:', error)
        }
    })
}
const initializeHrefMonitor = () => {
    if (hrefMonitorInitialized) return
    hrefMonitorInitialized = true
    originalPushState = history.pushState
    originalReplaceState = history.replaceState
    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args)
        notifyHrefChange()
        return result
    }
    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args)
        notifyHrefChange()
        return result
    }
    window.addEventListener('hashchange', notifyHrefChange, hrefListenerOptions)
    window.addEventListener('popstate', notifyHrefChange, hrefListenerOptions)
}
export const monitorHrefChange = callback => {
    if (typeof callback !== 'function') {
        throw new TypeError('URL变更回调必须是函数')
    }
    initializeHrefMonitor()
    hrefChangeListeners.add(callback)
    return () => {
        hrefChangeListeners.delete(callback)
        if (hrefChangeListeners.size > 0) return
        window.removeEventListener('hashchange', notifyHrefChange, hrefListenerOptions)
        window.removeEventListener('popstate', notifyHrefChange, hrefListenerOptions)
        history.pushState = originalPushState
        history.replaceState = originalReplaceState
        hrefMonitorInitialized = false
        hrefMonitorLastHref = location.href
    }
}
// 自定义"点击外部关闭"：原生 popover 的 light dismiss 在"弹窗内按下、弹窗外松开"
// （如拖选文字）时也会关闭弹窗（Chromium 行为），改为仅当按下与松开都在弹窗外才关闭
export const enablePopoverLightDismiss = popover => {
    let pending = false
    let dismissing = false
    const isInside = target => target instanceof Node && popover.contains(target)
    // 遮罩拦截：popover 的 ::backdrop 不接收指针事件，点击会穿透到背后页面元素，
    // 这里在捕获阶段拦截弹窗外的交互（点击、拖选、hover），使遮罩区域不可操作
    const blocked = e => popover.matches(':popover-open') && !isInside(e.target)
    const onPointerDown = e => {
        if (!blocked(e)) return
        e.preventDefault()
        e.stopPropagation()
        pending = true
    }
    const onPointerMove = e => {
        if (blocked(e)) {
            e.stopPropagation()
        }
    }
    const onPointerUp = e => {
        if (!pending) return
        pending = false
        if (!isInside(e.target)) {
            // click 在 pointerup 之后同步派发：弹窗关闭后 click 的目标是背后元素，
            // 标记本次序列的 click 一并拦截，防止穿透误触
            dismissing = true
            popover.hidePopover()
        }
    }
    const onClick = e => {
        // click 由浏览器独立合成，pointerdown 拦截无法阻止其派发，需单独拦截
        if (dismissing || blocked(e)) {
            e.preventDefault()
            e.stopPropagation()
            dismissing = false
        }
    }
    const onKeyDown = e => {
        if (e.key === 'Escape' && popover.matches(':popover-open')) {
            popover.hidePopover()
        }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('pointermove', onPointerMove, true)
        document.removeEventListener('pointerup', onPointerUp, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
    }
}
export const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
export const sanitizeHttpUrl = value => {
    const rawValue = String(value ?? '').trim()
    if (!rawValue) return ''
    try {
        const url = new URL(rawValue, location.origin)
        return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
    } catch {
        return ''
    }
}
export const createElementAndInsert = (HtmlString, target, method = 'append') => {
    if (typeof HtmlString !== 'string' || !HtmlString.trim()) {
        throw new Error('Invalid HTML string provided')
    }
    if (!target || !(target instanceof Node)) {
        throw new Error('Target must be a valid DOM node')
    }
    const supportedMethods = ['append', 'prepend', 'before', 'after', 'replaceWith']
    if (!supportedMethods.includes(method)) {
        throw new Error(`Unsupported insertion method: ${method}`)
    }
    try {
        const template = document.createElement('template')
        template.innerHTML = HtmlString.trim()
        const fragment = template.content
        const clonedFragment = fragment.cloneNode(true)
        const insertedNodes = [...clonedFragment.children]
        if (method === 'replaceWith') {
            target.replaceWith(clonedFragment)
        } else {
            target[method](clonedFragment)
        }
        return insertedNodes.length > 1 ? insertedNodes : insertedNodes[0]
    } catch (error) {
        logger.error('创建并插入元素失败:', error)
        throw error
    }
}
export const getTotalSecondsFromTimeString = timeString => {
    if (!timeString) return 0
    const parts = timeString.split(':')
    if (parts.length === 1) {
        return parseInt(parts[0], 10)
    } else if (parts.length === 2) {
        const [minutes, seconds] = parts.map(Number)
        return minutes * 60 + seconds
    } else if (parts.length === 3) {
        const [hours, minutes, seconds] = parts.map(Number)
        return hours * 3600 + minutes * 60 + seconds
    }
    return 0
}
export const insertStyleToDocument = styles => {
    if (typeof styles === 'object' && !Array.isArray(styles)) {
        for (const [id, cssString] of Object.entries(styles)) {
            let styleElement = document.getElementById(id)
            if (!cssString) {
                styleElement?.remove()
                continue
            }
            if (!styleElement) {
                styleElement = document.createElement('style')
                styleElement.id = id
                document.head.append(styleElement)
            }
            styleElement.textContent = cssString
        }
    } else {
        throw new Error('Invalid argument type. Expected an object.')
    }
}
export const getBodyHeight = () => {
    const bodyHeight = document.body?.clientHeight || 0
    const docHeight = document.documentElement?.clientHeight || 0
    return bodyHeight < docHeight ? bodyHeight : docHeight
}
// 更新相关功能已移至 update.service.js
export const initializeCheckbox = (elements, userConfigs, configKey) => {
    const elementList = Array.isArray(elements) ? elements : [elements]
    elementList.forEach(element => {
        if (!(element instanceof HTMLInputElement)) return
        const key = configKey || _.snakeCase(element.id).replace(/_(\d)_k/g, '$1k')
        if (!(key in userConfigs)) {
            logger.warn(`配置键 "${key}" 不存在于用户配置中`)
            return
        }
        const value = Boolean(userConfigs[key])
        // 使用 requestAnimationFrame 确保 DOM 更新
        requestAnimationFrame(() => {
            element.checked = value
            element.toggleAttribute('checked', value)
            element.dispatchEvent(new Event('change', { bubbles: true }))
        })
    })
}
export const showPlayerTooltip = (triggerElement, tooltipElement) => {
    requestAnimationFrame(() => {
        const rect = triggerElement.getBoundingClientRect()
        tooltipElement.style.cssText = `
            top: ${rect.top - tooltipElement.clientHeight - 12}px;
            left: ${rect.left + (rect.width / 2) - (tooltipElement.clientWidth / 2)}px;
            opacity: 1;
            visibility: visible;
            transition: opacity .3s;
        `
    })
}
export const hidePlayerTooltip = tooltipElement => {
    requestAnimationFrame(() => {
        tooltipElement.style.cssText = `
            opacity: 0;
            visibility: hidden;
        `
    })
}
export const generateMentionUserLinks = (username, desc_v2) => {
    const matchedItem = desc_v2.find(item => item.raw_text === username)
    return matchedItem
        ? `<a target="_blank" href="//space.bilibili.com/${matchedItem.biz_id}" class="mention-user" data-v-8ced1e78="">@${matchedItem.raw_text} </a>`
        : `@${username}`
}
