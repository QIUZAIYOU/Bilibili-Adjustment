import { regexps } from '@/shared/regexps'
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

    // 处理浏览器前缀并选择最优检测方案
    const visibilityInfo = (() => {
        const prefixes = ['',
                          'webkit',
                          'ms',
                          'moz']
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
        // 现代浏览器使用原生API
        document.addEventListener(visibilityInfo.event, () => {
            active = document[visibilityInfo.state] === 'visible'
        }, { passive: true })
    } else {
        // 兼容旧版浏览器方案
        window.addEventListener('focus', () => active = true)
        window.addEventListener('blur', () => active = false)
        active = document.hasFocus()
    }

    return () => active
}
export const monitorHrefChange = callback => {
    let lastHref = location.href

    const checkAndTrigger = () => {
        const currentHref = location.href
        if (currentHref !== lastHref) {
            lastHref = currentHref
            callback(currentHref)
        }
    }

    // 监听 hashchange 和 popstate 事件
    window.addEventListener('hashchange', checkAndTrigger)
    window.addEventListener('popstate', checkAndTrigger)

    // 重写 history API 方法
    const { pushState, replaceState } = history
    history.pushState = function (...args) {
        pushState.apply(this, args)
        checkAndTrigger()
    }
    history.replaceState = function (...args) {
        replaceState.apply(this, args)
        checkAndTrigger()
    }

    // 返回清理函数，用于移除监听和恢复原生方法
    return () => {
        window.removeEventListener('hashchange', checkAndTrigger)
        window.removeEventListener('popstate', checkAndTrigger)
        history.pushState = pushState
        history.replaceState = replaceState
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
    if (timeString.length === 5) timeString = timeString.padStart(8, '00:')
    const [hours,
           minutes,
           seconds] = timeString.split(':').map(Number)
    return hours * 3600 + minutes * 60 + seconds
}
export const processVideoCommentDescriptionHtml = html => html
    .replace(regexps.specialBlank, '%20')
    .replace(regexps.nbspToBlank, ' ')
    .replace(regexps.timeString, match => `<a data-type="seek" data-video-part="-1" 
               data-video-time="${getTotalSecondsFromTimeString(match)}">${match}</a>`)
    .replace(regexps.url, match => `<a href="${match}" target="_blank">${match}</a>`)
    .replace(regexps.videoId, match => `<a href="https://www.bilibili.com/video/${match}" target="_blank">${match}</a>`)
    .replace(regexps.readId, match =>
        `<a href="https://www.bilibili.com/read/${match}" target="_blank">${match}</a>`)
    .replace(regexps.blankLine, '')
