/* global getComputedStyle,localStorage,HTMLInputElement,requestAnimationFrame,Event */
import axios from 'axios'
import { getTemplates } from '@/shared/templates'
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const delay = (func, timeout, ...args) => new Promise(resolve => {
    setTimeout(() => {
        resolve(func(...args))
    }, timeout)
})
export const debounce = (func, delay = 300, immediate = false) => {
    let timer = null
    let lastArgs = null
    let lastThis = null
    const debounced = function (...args) {
        lastArgs = args
        lastThis = this
        if (timer && immediate) {
            clearTimeout(timer)
            timer = null
        }
        if (!timer && immediate) {
            func.apply(lastThis, lastArgs)
        }
        timer = setTimeout(() => {
            if (!immediate) {
                func.apply(lastThis, lastArgs)
            }
            timer = null
        }, delay)
    }
    debounced.cancel = () => {
        clearTimeout(timer)
        timer = null
    }
    return debounced
}
export const throttle = (func, limit = 300, trailing = true) => {
    let lastFunc
    let lastRan
    let inThrottle = false // 新增节流状态标志
    const throttled = function (...args) {
        if (!inThrottle) {
            func.apply(this, args)
            lastRan = Date.now()
            inThrottle = true
        } else if (trailing) {
            clearTimeout(lastFunc)
            lastFunc = setTimeout(() => {
                if (Date.now() - lastRan >= limit) {
                    func.apply(this, args)
                    lastRan = Date.now()
                }
            }, limit - (Date.now() - lastRan))
        }
    }
    throttled.cancel = () => {
        clearTimeout(lastFunc)
        inThrottle = false
    }
    return throttled
}
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/')) return 'video'
    if (host === 'www.bilibili.com' && pathname === '/') return 'home'
    if (origin === 'https://t.bilibili.com') return 'dynamic'
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
        return propertyName.reduce((obj, prop) => {
            obj[prop] = style.getPropertyValue(prop)
            return obj
        }, {})
    }
    if (typeof propertyName === 'string') {
        return style.getPropertyValue(propertyName)
    }
    return Array.from(style).reduce((obj, property) => {
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
        console.warn('No valid elements found for event listener')
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
            console.error('Failed to add event listener to element:', error)
        }
    })
    return () => {
        elements.forEach(element => {
            try {
                element.removeEventListener(type, callback, finalOptions)
            } catch (error) {
                console.error('Failed to remove event listener from element:', error)
            }
        })
    }
}
export const isAsyncFunction = targetFunction => targetFunction.constructor.name === 'AsyncFunction'
export const executeFunctionsSequentially = async (
    functionsArray,
    options = { concurrency: 1, continueOnError: false }
) => {
    const { concurrency, continueOnError } = options
    const queue = [...functionsArray]
    const results = []
    let activeCount = 0
    let hasError = false
    const processQueue = async () => {
        if (queue.length === 0 || activeCount >= concurrency || hasError) return
        activeCount++
        const func = queue.shift()
        try {
            const result = isAsyncFunction(func)
                ? await func()
                : func()
            results.push(result)
            if (result?.callback) {
                await executeFunctionsSequentially(result.callback, options)
            }
        } catch (error) {
            console.error('函数执行失败:', error)
            if (!continueOnError) hasError = true
        } finally {
            activeCount--
            await processQueue()
        }
    }
    const workers = Array(Math.min(concurrency, functionsArray.length))
        .fill()
        .map(processQueue)
    await Promise.all(workers)
    return results
}
export const isTabActive = (options = {}) => {
    const {
        onActiveChange = null,
        passive = true,
        checkInterval = 300,
        immediate = false
    } = options
    let active = true
    let lastState = true
    let intervalId = null
    const visibilityInfo = (() => {
        const prefixes = ['', 'webkit', 'ms', 'moz']
        for (const prefix of prefixes) {
            const key = prefix ? `${prefix}Hidden` : 'hidden'
            if (key in document) {
                return {
                    event: prefix ? `${prefix}visibilitychange` : 'visibilitychange',
                    state: prefix ? `${prefix}VisibilityState` : 'visibilityState'
                }
            }
        }
        return null
    })()
    const updateState = newState => {
        if (newState !== lastState) {
            active = newState
            lastState = newState
            onActiveChange?.(newState)
        }
    }
    // 主监听函数
    const setupListeners = () => {
        if (visibilityInfo) {
            const handleVisibilityChange = () => {
                updateState(document[visibilityInfo.state] === 'visible')
            }
            document.addEventListener(visibilityInfo.event, handleVisibilityChange, { passive })
            // 新增立即执行逻辑
            if (immediate && document[visibilityInfo.state] === 'visible') {
                onActiveChange?.(true)
            }
            return () => {
                document.removeEventListener(visibilityInfo.event, handleVisibilityChange, { passive })
            }
        } else {
            const handleFocus = () => updateState(true)
            const handleBlur = () => updateState(false)
            window.addEventListener('focus', handleFocus, { passive })
            window.addEventListener('blur', handleBlur, { passive })
            updateState(document.hasFocus())
            if (immediate && document.hasFocus()) {
                onActiveChange?.(true)
            }
            return () => {
                window.removeEventListener('focus', handleFocus, { passive })
                window.removeEventListener('blur', handleBlur, { passive })
            }
        }
    }
    if (checkInterval > 0) {
        intervalId = setInterval(() => {
            const currentState = visibilityInfo
                ? document[visibilityInfo.state] === 'visible'
                : document.hasFocus()
            updateState(currentState)
        }, checkInterval)
    }
    const cleanup = setupListeners()
    return {
        getCurrentState: () => active,
        unsubscribe: () => {
            cleanup?.()
            if (intervalId) clearInterval(intervalId)
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
                console.error('Href change callback error:', e)
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
        console.error('Failed to create and insert elements:', error)
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
export const camelToSnake = str => str.replace(/(?:^|\.?)([A-Z])/g, (x, y) => '_' + y.toLowerCase())
    .replace(/^_/, '')
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
export const fetchLatestScript = async () => {
    const cacheKey = 'latestScriptCache'
    const cacheDuration = 24 * 60 * 60 * 1000
    const validateCache = () => {
        const cachedContent = localStorage.getItem(cacheKey)
        if (!cachedContent) return null
        try {
            const { data, time } = JSON.parse(cachedContent)
            return Date.now() - time < cacheDuration ? data : null
        } catch {
            return null
        }
    }
    const cachedData = validateCache()
    if (cachedData) {
        console.log('使用缓存的脚本')
        return cachedData
    }
    const CORSProxyList = [
        'https://qian.npkn.net/cors/?url=',
        'https://cors.aiideai-hq.workers.dev/?destination=',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cloudflare-cors-anywhere.aiideai-hq.workers.dev?url='
    ]
    const targetURL = 'https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js'
    const tryFetch = async (proxy, retries = 3) => {
        for (let i = 0; i < retries; i++) {
            try {
                const client = axios.create({
                    baseURL: `${proxy}${encodeURIComponent(targetURL)}`,
                    timeout: 20000,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                const response = await client.get()
                return response.data
            } catch (error) {
                if (i === retries - 1) throw error
                await sleep(1000 * (i + 1)) // 指数退避
            }
        }
    }
    const shuffledProxyList = [...CORSProxyList].sort(() => Math.random() - 0.5)
    for (const proxy of shuffledProxyList) {
        try {
            const data = await tryFetch(proxy)
            localStorage.setItem(cacheKey, JSON.stringify({
                data,
                time: Date.now()
            }))
            return data
        } catch (error) {
            console.warn(`代理 ${proxy} 请求失败:`, error.message)
        }
    }
    throw new Error('所有CORS代理均不可用')
}
export const extractVersionFromScript = scriptContent => {
    const versionMatch = scriptContent.match(/\/\/\s*@version\s*([\d.]+)/)
    if (versionMatch && versionMatch[1]) {
        return versionMatch[1]
    }
    return null
}
export const compareVersions = (current, latest) => {
    const parsePart = part => {
        const num = parseInt(part, 10)
        return isNaN(num) ? part.toLowerCase() : num
    }
    const currentParts = current.split('.').map(parsePart)
    const latestParts = latest.split('.').map(parsePart)
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] || 0
        const last = latestParts[i] || 0
        if (typeof curr !== typeof last) {
            return String(last) > String(curr)
        }
        if (last > curr) return true
        if (last < curr) return false
    }
    return false
}
export const promptForUpdate = async currentVersion => {
    const scriptContent = await fetchLatestScript()
    if (!scriptContent) {
        return
    }
    const latestVersion = extractVersionFromScript(scriptContent)
    if (!latestVersion) {
        console.error('Failed to extract version from the latest script')
        return
    }
    if (compareVersions(currentVersion, latestVersion)) {
        const updatePopover = createElementAndInsert(getTemplates.replace('update', {
            current: currentVersion,
            latest: latestVersion
        }), document.body, 'append')
        updatePopover.showPopover()
        const updateButton = updatePopover.querySelector('.adjustment-button-update')
        updateButton.addEventListener('click', () => {
            updatePopover.hidePopover()
            window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js')
        })
    }
}
export const initializeCheckbox = (elements, userConfigs, configKey) => {
    const elementList = Array.isArray(elements) ? elements : [elements]
    elementList.forEach(element => {
        if (!(element instanceof HTMLInputElement)) return
        const key = configKey || camelToSnake(element.id)
        if (!(key in userConfigs)) {
            console.warn(`配置键 "${key}" 不存在于用户配置中`)
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
export const getCaller = (targetFunctionName = null) => {
    try {
        throw new Error()
    } catch (e) {
        const stackLines = e.stack.split('\n').slice(2) // 跳过前两行
        if (!targetFunctionName) {
            const match = stackLines[0]?.match(/at (\S+)/)
            return match?.[1] || 'anonymous'
        }
        // 查找目标函数在调用栈中的位置
        const targetIndex = stackLines.findIndex(line =>
            line.includes(`at ${targetFunctionName}`))
        if (targetIndex === -1 || targetIndex >= stackLines.length - 1) {
            return null // 未找到目标函数或目标函数是最后一级
        }
        // 返回目标函数的调用者
        const callerMatch = stackLines[targetIndex + 1]?.match(/at (\S+)/)
        return callerMatch?.[1] || 'anonymous'
    }
}
