/* global _ */
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('Common')
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const delay = (func, timeout, ...args) => new Promise(resolve => {
    setTimeout(() => {
        resolve(func(...args))
    }, timeout)
})
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
    if (host === 'www.bilibili.com' && pathname === '/') {
        logger.debug('匹配到 home 类型页面')
        return 'home'
    }
    // 动态页
    if (origin === 'https://t.bilibili.com') {
        logger.debug('匹配到 dynamic 类型页面')
        return 'dynamic'
    }
    // 用户空间
    if (pathname.startsWith('/space/')) {
        logger.debug('匹配到 space 类型页面')
        return 'space'
    }
    // 搜索结果页
    if (pathname.startsWith('/search/')) {
        logger.debug('匹配到 search 类型页面')
        return 'search'
    }
    // 番剧详情页
    if (pathname.startsWith('/anime/')) {
        logger.debug('匹配到 anime 类型页面')
        return 'anime'
    }
    // 游戏中心
    if (pathname.startsWith('/gamecenter/')) {
        logger.debug('匹配到 gamecenter 类型页面')
        return 'gamecenter'
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
        behavior = 'instant'
    } = options
    return new Promise((resolve, reject) => {
        let attempts = 0
        const checkPosition = () => {
            const currentY = window.scrollY
            return currentY === offset ||
                   Math.abs(currentY - offset) <= tolerance ||
                   offset === -5
        }
        const attemptScroll = async () => {
            try {
                window.scrollTo({
                    top: offset,
                    behavior
                })
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
        logger.warn('未找到有效的元素用于添加事件监听器')
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
export const isAsyncFunction = targetFunction => _.isFunction(targetFunction) && targetFunction[Symbol.toStringTag] === 'AsyncFunction'
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
                    const result = isAsyncFunction(func)
                        ? await func()
                        : func()
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
    immediate && checkVisibility()
    let intervalId = setInterval(checkVisibility, checkInterval)
    return () => {
        if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
        }
    }
}
export const monitorHrefChange = callback => {
    let lastHref = location.href
    const listenerOptions = { passive: true, capture: true }
    const getFinalHref = url => {
        const pParam = url.searchParams.get('p')
        return `${url.href.split('?')[0].trim()}${pParam ? `?p=${pParam}` : ''}`.replace(/\/+$/, '')
    }
    // 更精确的URL比较
    const shouldTrigger = newHref => {
        const u1 = new URL(lastHref)
        const u2 = new URL(newHref)
        return getFinalHref(u1) !== getFinalHref(u2)
    }
    const handler = () => {
        const currentHref = location.href
        if (shouldTrigger(currentHref)) {
            lastHref = currentHref
            try {
                callback()
            } catch (e) {
                logger.error('URL变更回调错误:', e)
            }
        }
    }
    // 使用单一事件处理器
    const events = ['hashchange', 'popstate']
    events.forEach(e => window.addEventListener(e, handler, listenerOptions))
    // 更安全的history方法重写
    const { pushState, replaceState } = history
    history.pushState = function (...args) {
        const result = pushState.apply(this, args)
        handler()
        return result
    }
    history.replaceState = function (...args) {
        const result = replaceState.apply(this, args)
        handler()
        return result
    }
    return () => {
        events.forEach(e => window.removeEventListener(e, handler, listenerOptions))
        history.pushState = pushState
        history.replaceState = replaceState
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
    const bodyHeight = document.body.clientHeight || 0
    const docHeight = document.documentElement.clientHeight || 0
    return bodyHeight < docHeight ? bodyHeight : docHeight
}
export const updateVideoSizeStyle = (mode = 'normal') => {
    const baseWidth = 1920
    const baseHeight = 1080
    const currentWidth = window.screen.width
    const currentHeight = window.screen.height
    const scaleX = currentWidth / baseWidth
    const scaleY = currentHeight / baseHeight
    const scale = Math.min(scaleX, scaleY)
    const sizeRules = {
        normal: {
            containerWidth: 1063 * scale,
            playerWidth: 1063 * scale,
            playerHeight: 654 * scale,
            discoverMargin: 531.5 * scale
        },
        wide: {
            containerWidth: 938 * scale,
            playerWidth: 1379 * scale,
            playerHeight: 829 * scale,
            discoverMargin: 469 * scale,
            followTop: 839 * scale,
            danmukuMargin: 857 * scale
        },
        webfull: {
            containerWidth: 751 * scale,
            playerWidth: 1192 * scale,
            playerHeight: 724 * scale,
            discoverMargin: 375.5 * scale,
            followTop: 734 * scale,
            danmukuMargin: 752 * scale
        }
    }
    const {
        containerWidth,
        playerWidth,
        playerHeight,
        discoverMargin,
        followTop = playerHeight + 10,
        danmukuMargin = playerHeight + 20
    } = sizeRules[mode]
    const css = `
        .video-container-v1 { width: auto; padding: 0 ${10 * scale}px; }
        .left-container { width: ${containerWidth}px; }
        #bilibili-player {
            width: ${playerWidth}px;
            height: ${playerHeight}px;
            position: ${mode === 'normal' ? 'static' : 'relative'};
        }
        #oldfanfollowEntry { position: relative; top: ${followTop}px; }
        #danmukuBox { margin-top: ${danmukuMargin}px; }
        #playerWrap { height: ${playerHeight}px; }
        .video-discover { margin-left: ${discoverMargin}px; }
    `
    let styleElement = document.getElementById('setSizeStyle')
    if (!styleElement) {
        styleElement = document.createElement('style')
        styleElement.id = 'setSizeStyle'
        document.head.append(styleElement)
    }
    styleElement.textContent = css
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
