/**
 * lodash 精简替代（P1-4.5 依赖治理）
 *
 * 项目此前通过 `window._ = lodash` 暴露全局并以 `_.xxx` 使用，整包 lodash 进入用户脚本
 * 体积且污染页面全局。这里只实现实际用到的 6 个函数，语义对齐 lodash 4 对应 API。
 */
/** 按 size 切分数组（lodash chunk 语义：size < 1 时视为 1） */
export const chunk = (array, size = 1) => {
    const input = Array.isArray(array) ? array : Array.from(array || [])
    const step = Math.max(1, Math.floor(size) || 1)
    const result = []
    for (let i = 0; i < input.length; i += step) {
        result.push(input.slice(i, i + step))
    }
    return result
}
/**
 * 防抖（对齐 lodash debounce 的 leading/trailing 选项）
 * - leading: true, trailing: false：首次立即执行，等待期内重复调用被忽略（本项目主要用法）
 */
export const debounce = (func, wait = 0, options = {}) => {
    const { leading = false, trailing = true } = options
    let timer = null
    let lastArgs = null
    let lastThis = null
    const invoke = () => {
        const args = lastArgs
        const context = lastThis
        lastArgs = null
        lastThis = null
        return func.apply(context, args)
    }
    const debounced = function (...args) {
        lastArgs = args
        lastThis = this
        const callNow = leading && timer === null
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            if (trailing && lastArgs) invoke()
        }, wait)
        if (callNow) return invoke()
        return undefined
    }
    debounced.cancel = () => {
        if (timer) clearTimeout(timer)
        timer = null
        lastArgs = null
        lastThis = null
    }
    debounced.flush = () => {
        if (!timer || !lastArgs) return undefined
        clearTimeout(timer)
        timer = null
        return invoke()
    }
    return debounced
}
/** 节流（lodash throttle 默认语义：leading + trailing） */
export const throttle = (func, wait = 0) => {
    let lastCallAt = 0
    let timer = null
    let lastArgs = null
    let lastThis = null
    const invoke = () => {
        lastCallAt = Date.now()
        const args = lastArgs
        const context = lastThis
        lastArgs = null
        lastThis = null
        return func.apply(context, args)
    }
    const throttled = function (...args) {
        lastArgs = args
        lastThis = this
        const remaining = wait - (Date.now() - lastCallAt)
        if (remaining <= 0) {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
            return invoke()
        }
        if (!timer) {
            timer = setTimeout(() => {
                timer = null
                if (lastArgs) invoke()
            }, remaining)
        }
        return undefined
    }
    throttled.cancel = () => {
        if (timer) clearTimeout(timer)
        timer = null
        lastArgs = null
        lastThis = null
    }
    return throttled
}
/** 取对象子集（支持 CSSStyleDeclaration 等非普通对象，键存在性用 in 判断，与 lodash pick 一致） */
export const pick = (object, keys) => {
    const result = {}
    if (!object) return result
    for (const key of keys || []) {
        if (key in Object(object)) result[key] = object[key]
    }
    return result
}
/** 遍历归并（替代 lodash reduce 对 CSSStyleDeclaration 等集合的迭代） */
export const reduce = (collection, iteratee, accumulator) => {
    if (!collection) return accumulator
    const keys = Array.isArray(collection) ? collection.map((_, index) => index) : Object.keys(collection)
    let result = accumulator
    for (const key of keys) {
        result = iteratee(result, collection[key], key)
    }
    return result
}
/** 拆词（lodash words 的常用子集：驼峰、数字边界、分隔符） */
const splitWords = value => String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
/** snake_case（lodash snakeCase 语义，用于由元素 id 推导配置键） */
export const snakeCase = value => splitWords(value).map(word => word.toLowerCase()).join('_')
/** camelCase（与 snakeCase 同一拆词规则，供设置项与配置键互转） */
export const camelCase = value => splitWords(value)
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('')
