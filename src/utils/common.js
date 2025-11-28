/* global getComputedStyle,localStorage,HTMLInputElement,requestAnimationFrame,Event,_,fetch */
import { LoggerService } from '@/services/logger.service'
import axios from 'axios'
import { getTemplates } from '@/shared/templates'
const logger = new LoggerService('Common')
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const delay = (func, timeout, ...args) => new Promise(resolve => {
    setTimeout(() => {
        resolve(func(...args))
    }, timeout)
})
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/') || pathname.startsWith('/list/')) return 'video'
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
export const fetchLatestScript = async () => {
    const cacheKey = 'latestScriptCache'
    const cacheDuration = 24 * 60 * 60 * 1000
    // 更严格的缓存验证
    const validateCache = () => {
        try {
            const cachedContent = localStorage.getItem(cacheKey)
            if (!cachedContent) return null
            const parsed = JSON.parse(cachedContent)
            if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.time) {
                localStorage.removeItem(cacheKey) // 清除无效缓存
                return null
            }
            if (Date.now() - parsed.time < cacheDuration) {
                logger.info('使用缓存的脚本数据')
                return parsed.data
            }
            return null
        } catch (error) {
            logger.warn('缓存验证失败，清除无效缓存:', error.message)
            localStorage.removeItem(cacheKey)
            return null
        }
    }
    const cachedData = validateCache()
    if (cachedData) {
        return cachedData
    }
    const CORSProxyList = [
        'https://qian.npkn.net/cors/?url=',
        'https://cors.aiideai-hq.workers.dev/?destination=',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cros2.aiideai-hq.workers.dev/?'
    ]
    const targetURL = encodeURIComponent('https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js')
    // 带超时的fetch函数
    const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            })
            clearTimeout(timeoutId)
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            return await response.text()
        } catch (error) {
            clearTimeout(timeoutId)
            throw error
        }
    }
    const tryFetch = async (proxy, targetURL, retries = 2) => {
        for (let i = 0; i < retries; i++) {
            try {
                const fullUrl = `${proxy}${targetURL}`
                logger.debug(`尝试通过代理 ${proxy} 获取脚本 (尝试 ${i + 1}/${retries})`)
                logger.debug(`完整请求URL: ${fullUrl}`)
                const data = await fetchWithTimeout(fullUrl, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }, 20000)
                if (data && typeof data === 'string' && data.trim()) {
                    logger.debug(`代理 ${proxy} 请求成功`)
                    return data
                } else {
                    throw new Error('返回的数据无效')
                }
            } catch (error) {
                const errorMsg = error.name === 'AbortError' ? '请求超时' : error.message
                logger.warn(`代理 ${proxy}${targetURL} 请求失败 (${i + 1}/${retries}):`, errorMsg)
                if (i === retries - 1) {
                    throw new Error(`代理请求失败: ${errorMsg}`)
                }
                // 指数退避
                await sleep(1000 * Math.pow(2, i))
            }
        }
    }
    // 随机排序代理列表，避免总是从第一个开始
    const shuffledProxyList = [...CORSProxyList].sort(() => Math.random() - 0.5)
    for (const proxy of shuffledProxyList) {
        try {
            const data = await tryFetch(proxy, targetURL)
            // 验证获取的数据是否有效
            if (data && typeof data === 'string' && data.trim()) {
                // 保存到缓存
                localStorage.setItem(cacheKey, JSON.stringify({
                    data,
                    time: Date.now()
                }))
                return data
            }
        } catch (error) {
            logger.warn(`代理 ${proxy}${targetURL} 处理失败 丨`, error.message)
            // 继续尝试下一个代理
        }
    }
    // 如果所有代理都失败，尝试使用缓存（即使过期）作为后备
    const expiredCache = localStorage.getItem(cacheKey)
    if (expiredCache) {
        try {
            const parsed = JSON.parse(expiredCache)
            if (parsed && parsed.data) {
                logger.warn('所有代理请求失败，使用过期缓存数据')
                return parsed.data
            }
        } catch {
            // 忽略过期缓存解析错误
        }
    }
    throw new Error('所有CORS代理均不可用，且无可用缓存')
}
const extractVersionFromScript = scriptContent => {
    const versionMatch = scriptContent.match(/\/\/\s*@version\s*([\d.-]+)/)
    if (versionMatch && versionMatch[1]) {
        return versionMatch[1]
    }
    return null
}
// const extractChangelogFromScript = scriptContent => {
//     // 尝试从 @update 或 @changelog 标签中提取更新内容
//     const updateMatch = scriptContent.match(/\/\/\s*@update\s*([\s\S]*?)(?:\/\/\s*@|$)/)
//     if (updateMatch && updateMatch[1]) {
//         return updateMatch[1].trim()
//     }
//     const changelogMatch = scriptContent.match(/\/\/\s*@changelog\s*([\s\S]*?)(?:\/\/\s*@|$)/)
//     if (changelogMatch && changelogMatch[1]) {
//         return changelogMatch[1].trim()
//     }
//     // 尝试从注释块中提取更新内容
//     const commentBlockMatch = scriptContent.match(/\/\*[\s\S]*?(?:更新日志|changelog)[\s\S]*?\*\//i)
//     if (commentBlockMatch) {
//         return commentBlockMatch[0]
//             .replace(/\/\*|\*\//g, '')
//             .replace(/(?:更新日志|changelog)/i, '')
//             .trim()
//     }
//     return ''
// }
const compareVersions = (current, latest) => {
    const parseVersion = version => {
        const [core, pre] = version.split('-')
        const coreParts = core.split('.').map(part => parseInt(part, 10) || 0)
        const preParts = pre ? pre.split('.').map(part => {
            const num = parseInt(part, 10)
            return isNaN(num) ? part.toLowerCase() : num
        }) : []
        return { coreParts, preParts }
    }
    const curr = parseVersion(current)
    const last = parseVersion(latest)
    // 比较核心版本号
    for (let i = 0; i < Math.max(curr.coreParts.length, last.coreParts.length); i++) {
        const currPart = curr.coreParts[i] || 0
        const lastPart = last.coreParts[i] || 0
        if (lastPart > currPart) return true
        if (lastPart < currPart) return false
    }
    // 核心版本号相同，比较预发布版本
    // 没有预发布版本的版本比有预发布版本的版本更新
    if (curr.preParts.length && !last.preParts.length) return false
    if (!curr.preParts.length && last.preParts.length) return true
    // 比较预发布版本部分
    for (let i = 0; i < Math.max(curr.preParts.length, last.preParts.length); i++) {
        const currPart = curr.preParts[i] || 0
        const lastPart = last.preParts[i] || 0
        if (typeof currPart !== typeof lastPart) {
            // 数字比字符串小
            return typeof lastPart === 'number' ? false : true
        }
        if (lastPart > currPart) return true
        if (lastPart < currPart) return false
    }
    return false
}
const generateUpdateList = changelog => {
    if (!changelog) return ''
    // 如果是字符串，尝试解析为列表
    if (typeof changelog === 'string') {
        // 按分号分割
        const items = changelog
            .split(';')
            .map(item => item.trim())
            .filter(item => item)
        return `
            <ol class="adjustment-update-contents">
                ${_.map(items, item => `<li>${item}</li>`).join('')}
            </ol>
        `.replace(/\n\s+/g, '').trim()
    }
    // 如果是数组，直接生成列表
    if (Array.isArray(changelog)) {
        return `
            <ol class="adjustment-update-contents">
                ${_.map(changelog, item => `<li>${item}</li>`).join('')}
            </ol>
        `.replace(/\n\s+/g, '').trim()
    }
    return ''
}
export const promptForUpdate = async (currentVersion, updates) => {
    logger.info('检查更新')
    try {
        const scriptContent = await fetchLatestScript()
        if (!scriptContent) {
            logger.warn('未获取到最新脚本内容')
            return
        }
        const latestVersion = extractVersionFromScript(scriptContent)
        // const latestVersion = '9.9.9'
        if (!latestVersion) {
            logger.error('从最新脚本中提取版本号失败')
            return
        }
        logger.info(`当前版本: ${currentVersion}, 最新版本: ${latestVersion}`)
        if (compareVersions(currentVersion, latestVersion)) {
            // 使用传入的 updates 内容
            const updateContentsHtml = generateUpdateList(updates)
            const updatePopover = createElementAndInsert(getTemplates.replace('update', {
                current: currentVersion,
                latest: latestVersion,
                contents: updateContentsHtml
            }), document.body, 'append')
            updatePopover.showPopover()
            const updateButton = updatePopover.querySelector('.adjustment-button-update')
            const closeButton = updatePopover.querySelector('.adjustment-button-close')
            updateButton.addEventListener('click', () => {
                updatePopover.hidePopover()
                window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js', '_blank')
            })
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    updatePopover.hidePopover()
                })
            }
            // 30秒后自动关闭弹窗
            setTimeout(() => {
                updatePopover.hidePopover()
            }, 30000)
        } else if (compareVersions(latestVersion, currentVersion)) {
            // 当前版本大于最新版本，清除缓存
            logger.info('当前版本大于最新版本，清除缓存')
            localStorage.removeItem('latestScriptCache')
            // 更新缓存到最新版本
            try {
                const scriptContent = await fetchLatestScript()
                if (scriptContent) {
                    localStorage.setItem('latestScriptCache', JSON.stringify({
                        data: scriptContent,
                        time: Date.now()
                    }))
                    logger.info('缓存已更新')
                }
            } catch (error) {
                logger.error('更新缓存失败:', error)
            }
        } else {
            logger.info('已是最新版本')
        }
    } catch (error) {
        logger.error('检查更新过程中发生错误:', error)
        // 不抛出错误，避免影响应用正常运行
    }
}
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
