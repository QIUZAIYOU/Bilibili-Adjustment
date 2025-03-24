/* global getComputedStyle */
import axios from 'axios'
import { getTemplates } from '@/shared/templates'
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const delay = (func, delay, ...args) => {
    setTimeout(func(...args), delay)
}
export const debounce = (func, delay = 300, immediate = false) => {
    let timer = null
    let lastArgs = null
    let abortController = new AbortController()
    const debounced = function (...args) {
        lastArgs = args
        abortController.abort()
        abortController = new AbortController()
        if (immediate && !timer) {
            func.apply(this, args)
        }
        timer = setTimeout(() => {
            if (!immediate) {
                func.apply(this, lastArgs)
            }
            timer = null
        }, delay)
        abortController.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            timer = null
        })
    }
    debounced.cancel = () => abortController.abort()
    return debounced
}
export const throttle = (func, limit = 300, trailing = true) => {
    let lastFunc
    let lastRan
    const abortController = new AbortController()
    const throttled = function (...args) {
        abortController.signal.addEventListener('abort', () => {
            clearTimeout(lastFunc)
            lastRan = null
        })
        if (!lastRan) {
            func.apply(this, args)
            lastRan = Date.now()
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
    throttled.cancel = () => abortController.abort()
    return throttled
}
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/')) return 'video'
    // if (pathname.startsWith('/bangumi/')) return 'bangumi'
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
                // const contentBoxSize = Array.isArray(entry.contentBoxSize)
                //     ? entry.contentBoxSize[0]
                //     : entry.contentBoxSize
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
        tolerance = 2
    } = options
    return new Promise((resolve, reject) => {
        let attempts = 0
        const attemptScroll = async () => {
            try {
                window.scrollTo({
                    top: offset,
                    behavior: 'instant'
                })
                await new Promise(r => setTimeout(r, 200))
                const currentY = window.scrollY
                const targetY = offset
                // console.log(currentY, targetY, Math.abs(currentY - targetY))
                // 滚动成功：文档已滚动值等于目标值或在容差范围内或当前播放器模式为网页全屏(目标值为-5)
                const success = currentY === targetY || Math.abs(currentY - targetY) <= tolerance || offset === -5
                if (success) {
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
export const getElementOffsetToDocumentTop = element => {
    const rect = element.getBoundingClientRect()
    return rect.top + window.scrollY - parseFloat(getComputedStyle(element).marginTop)
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
    // 统一处理单元素和多元素情况
    const elements = Array.isArray(targets) ? targets : [targets]
    if (typeof options !== 'object') {
        throw new Error('Options must be an object or undefined')
    }
    elements.forEach(element => {
        element.addEventListener(type, callback, options)
    })
    return () => {
        elements.forEach(element => {
            element.removeEventListener(type, callback, options)
        })
    }
}
export const isAsyncFunction = targetFunction => targetFunction.constructor.name === 'AsyncFunction'
export const executeFunctionsSequentially = functionsArray => {
    if (functionsArray.length > 0) {
        const currentFunction = functionsArray.shift()
        if (isAsyncFunction(currentFunction)) {
            currentFunction().then(result => {
                if (result) {
                    const { callback } = result
                    if (callback && Array.isArray(callback)) executeFunctionsSequentially(callback)
                }
                executeFunctionsSequentially(functionsArray)
            }).catch(error => {
                console.log(error)
            })
        } else {
            currentFunction()
        }
    }
}
export const isTabActive = () => {
    let active = true
    const visibilityInfo = (() => {
        const prefixes = [
            '',
            'webkit',
            'ms',
            'moz'
        ]
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
    if (visibilityInfo) {
        const handleVisibilityChange = () => {
            active = document[visibilityInfo.state] === 'visible'
        }
        document.addEventListener(visibilityInfo.event, handleVisibilityChange, { passive: true })
        return () => {
            document.removeEventListener(visibilityInfo.event, handleVisibilityChange, { passive: true })
            return active
        }
    } else {
        const handleFocus = () => {
            active = true
        }
        const handleBlur = () => {
            active = false
        }
        window.addEventListener('focus', handleFocus, { passive: true })
        window.addEventListener('blur', handleBlur, { passive: true })
        active = document.hasFocus()
        return () => {
            window.removeEventListener('focus', handleFocus, { passive: true })
            window.removeEventListener('blur', handleBlur, { passive: true })
            return active
        }
    }
}
export const monitorHrefChange = callback => {
    const getFinalHref = url => {
        const u = new URL(url)
        const pParam = u.searchParams.get('p')
        return `${u.href.split('?')[0].trim()}${pParam ? `?p=${pParam}` : ''}`.replace(/\/+$/, '')
    }
    let lastHref = location.href
    let lastHrefKey = getFinalHref(lastHref)
    const checkAndTrigger = () => {
        const currentHref = location.href
        const currentHrefKey = getFinalHref(currentHref)
        // console.log(`lastHref: ${lastHref} \n lastHrefKey: ${lastHrefKey} \n currentHref: ${currentHref} \n currentHrefKey: ${currentHrefKey}`)
        if (currentHrefKey !== lastHrefKey) {
            // console.log('Href change:', lastHref, currentHref)
            lastHref = currentHref
            lastHrefKey = getFinalHref(lastHref)
            try {
                callback()
            } catch (e) {
                console.error('Href change callback error:', e)
            }
        }
    }
    const listenerOptions = { passive: true }
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    const bindEvents = () => {
        window.addEventListener('hashchange', checkAndTrigger, listenerOptions)
        window.addEventListener('popstate', checkAndTrigger, listenerOptions)
        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args)
            checkAndTrigger()
            return result
        }
        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args)
            checkAndTrigger()
            return result
        }
    }
    const unbindEvents = () => {
        window.removeEventListener('hashchange', checkAndTrigger, listenerOptions)
        window.removeEventListener('popstate', checkAndTrigger, listenerOptions)
        history.pushState = originalPushState
        history.replaceState = originalReplaceState
    }
    bindEvents()
    return unbindEvents
}
export const createElementAndInsert = (HtmlString, target, method) => {
    const template = document.createElement('template')
    template.innerHTML = HtmlString.trim()
    const fragment = template.content
    const clonedFragment = fragment.cloneNode(true)
    const insertedNodes = [...clonedFragment.children]
    target[method](clonedFragment)
    return insertedNodes.length > 1 ? insertedNodes : insertedNodes[0]
}
export const getTotalSecondsFromTimeString = timeString => {
    // 移除原有长度判断，改为智能分段处理
    const parts = timeString.split(':')
    // 处理不同分段情况
    if (parts.length === 1) {
        // 纯秒数格式（如"59"）
        return parseInt(parts[0], 10)
    } else if (parts.length === 2) {
        // 分钟:秒 格式
        const [minutes, seconds] = parts.map(Number)
        return minutes * 60 + seconds
    } else if (parts.length === 3) {
        // 完整的时间格式
        const [hours, minutes, seconds] = parts.map(Number)
        return hours * 3600 + minutes * 60 + seconds
    }
    return 0 // 无效格式返回0
}
export const insertStyleToDocument = styles => {
    if (typeof styles === 'object' && !Array.isArray(styles)) {
        // 支持对象参数
        for (const [id, cssString] of Object.entries(styles)) {
            let styleElement = document.getElementById(id)
            if (!cssString) {
                if (styleElement) {
                    styleElement.remove()
                    // console.log(`Removed style: ${id}`)
                }
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
// ... 已有代码 ...
export const updateVideoSizeStyle = (mode = 'normal') => {
    const baseWidth = 1920 // 设计稿基准宽度
    const baseHeight = 1080 // 设计稿基准高度
    const currentWidth = window.screen.width
    const currentHeight = window.screen.height
    // 计算缩放比例（横向缩放为主）
    const scaleX = currentWidth / baseWidth
    const scaleY = currentHeight / baseHeight
    const scale = Math.min(scaleX, scaleY)
    // 尺寸计算规则
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
    // 获取当前模式配置
    const {
        containerWidth,
        playerWidth,
        playerHeight,
        discoverMargin,
        followTop = playerHeight + 10, // 默认相对位置
        danmukuMargin = playerHeight + 20 // 默认相对位置
    } = sizeRules[mode]
    // 构建样式规则
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
    // 写入样式
    let styleElement = document.getElementById('setSizeStyle')
    if (!styleElement) {
        styleElement = document.createElement('style')
        styleElement.id = 'setSizeStyle'
        document.head.append(styleElement)
    }
    styleElement.textContent = css
}
export const fetchLatestScript = async () => {
    try {
        console.log('开始请求最新的脚本')
        const response = await axios.get('https://cors-anywhere.herokuapp.com/https://www.asifadeaway.com/bilibili/bilibili-adjustment.user.js', {
            responseType: 'text',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        console.log('成功获取最新的脚本')
        return response.data
    } catch (error) {
        // 处理代理服务器不可用的情况
        console.log('Failed to fetch the latest script:', error)
        if (error.response) {
            console.log('服务器响应:', error.response.data)
            console.log('状态码:', error.response.status)
            console.log('请求头:', error.response.headers)
        } else if (error.request) {
            console.log('请求信息:', error.request)
        } else {
            console.log('错误信息:', error.message)
        }
        console.log('配置信息:', error.config)
        return null
    }
}
export const extractVersionFromScript = scriptContent => {
    const versionMatch = scriptContent.match(/\/\/\s*@version\s*([\d.]+)/)
    if (versionMatch && versionMatch[1]) {
        return versionMatch[1]
    }
    return null
}
export const compareVersions = (currentVersion, latestVersion) => {
    const currentParts = currentVersion.split('.').map(Number)
    const latestParts = latestVersion.split('.').map(Number)
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const currentPart = currentParts[i] || 0
        const latestPart = latestParts[i] || 0
        if (latestPart > currentPart) {
            return true
        } else if (latestPart < currentPart) {
            return false
        }
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
            window.open('//www.asifadeaway.com/bilibili/bilibili-adjustment.user.js')
        })
    }
}
