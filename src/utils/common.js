export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
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
export const delay = (func, delay) => {
    setTimeout(func, delay)
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
                if (Math.abs(currentY - targetY) <= tolerance) {
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
export const addEventListenerToElement = (target, type, callback, options = {}) => {
    if (options && typeof options !== 'object') {
        throw new Error('Options must be an object or undefined')
    }
    target.addEventListener(type, callback, options)
    return () => {
        target.removeEventListener(type, callback, options)
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
        document.addEventListener(visibilityInfo.event, () => {
            active = document[visibilityInfo.state] === 'visible'
        }, { passive: true })
    } else {
        window.addEventListener('focus', () => active = true)
        window.addEventListener('blur', () => active = false)
        active = document.hasFocus()
    }
    return () => active
}
export const monitorHrefChange = callback => {
    let lastHref = location.href.split('?')[0]
    const checkAndTrigger = () => {
        const currentHref = location.href
        const currentHrefWithoutParams = currentHref.split('?')[0]
        if (currentHrefWithoutParams !== lastHref) {
            lastHref = currentHrefWithoutParams
            requestAnimationFrame(() => {
                try {
                    callback()
                } catch (e) {
                    console.error('Href change callback error:', e)
                }
            })
        }
    }
    const listenerOptions = { passive: true }
    window.removeEventListener('hashchange', checkAndTrigger)
    window.removeEventListener('popstate', checkAndTrigger)
    window.addEventListener('hashchange', checkAndTrigger, listenerOptions)
    window.addEventListener('popstate', checkAndTrigger, listenerOptions)
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args)
        requestIdleCallback(() => checkAndTrigger(), { timeout: 100 })
        return result
    }
    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args)
        requestIdleCallback(() => checkAndTrigger(), { timeout: 100 })
        return result
    }
    // requestIdleCallback(checkAndTrigger, { timeout: 100 })
    return () => {
        window.removeEventListener('hashchange', checkAndTrigger, listenerOptions)
        window.removeEventListener('popstate', checkAndTrigger, listenerOptions)
        history.pushState = originalPushState
        history.replaceState = originalReplaceState
    }
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
