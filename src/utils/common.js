export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    if (pathname.startsWith('/video/')) return 'video'
    if (pathname.startsWith('/bangumi/')) return 'bangumi'
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
                    behavior: 'smooth'
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
