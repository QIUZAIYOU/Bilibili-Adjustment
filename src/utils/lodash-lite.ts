/**
 * lodash 精简替代（P1-4.5 依赖治理）
 *
 * 项目此前通过 `window._ = lodash` 暴露全局并以 `_.xxx` 使用，整包 lodash 进入用户脚本
 * 体积且污染页面全局。这里只实现实际用到的 6 个函数，语义对齐 lodash 4 对应 API。
 */
/** 按 size 切分数组（lodash chunk 语义：size < 1 时视为 1） */
export const chunk = <T>(array: ArrayLike<T> | null | undefined, size = 1): T[][] => {
    const input: T[] = Array.isArray(array) ? (array as T[]) : Array.from(array || [])
    const step = Math.max(1, Math.floor(size) || 1)
    const result: T[][] = []
    for (let i = 0; i < input.length; i += step) {
        result.push(input.slice(i, i + step))
    }
    return result
}
/** debounce 的选项（对齐 lodash 同名选项） */
export interface DebounceOptions {
    leading?: boolean
    trailing?: boolean
}
/** 带 cancel/flush 的防抖函数（lodash debounce 返回值形状） */
export interface DebouncedFn<A extends unknown[]> {
    (...args: A): unknown
    cancel: () => void
    flush: () => unknown
}
/** 带 cancel 的节流函数（lodash throttle 返回值形状） */
export interface ThrottledFn<A extends unknown[]> {
    (...args: A): unknown
    cancel: () => void
}
/**
 * 防抖（对齐 lodash debounce 的 leading/trailing 选项）
 * - leading: true, trailing: false：首次立即执行，等待期内重复调用被忽略（本项目主要用法）
 */
export const debounce = <A extends unknown[]>(func: (...args: A) => unknown, wait = 0, options: DebounceOptions = {}): DebouncedFn<A> => {
    const { leading = false, trailing = true } = options
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastArgs: A | null = null
    let lastThis: unknown = null
    const invoke = () => {
        const args = lastArgs
        const context = lastThis
        lastArgs = null
        lastThis = null
        return Reflect.apply(func, context, args as A)
    }
    const debounced = function (this: unknown, ...args: A) {
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
export const throttle = <A extends unknown[]>(func: (...args: A) => unknown, wait = 0): ThrottledFn<A> => {
    let lastCallAt = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastArgs: A | null = null
    let lastThis: unknown = null
    const invoke = () => {
        lastCallAt = Date.now()
        const args = lastArgs
        const context = lastThis
        lastArgs = null
        lastThis = null
        return Reflect.apply(func, context, args as A)
    }
    const throttled = function (this: unknown, ...args: A) {
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
export const pick = (object: unknown, keys: readonly string[] | null | undefined): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    if (!object) return result
    for (const key of keys || []) {
        if (key in Object(object)) result[key] = (object as Record<string, unknown>)[key]
    }
    return result
}
/** 遍历归并（替代 lodash reduce 对 CSSStyleDeclaration 等集合的迭代） */
export const reduce = <A>(
    collection: object | null | undefined,
    iteratee: (accumulator: A, value: unknown, key: string | number) => A,
    accumulator: A
): A => {
    if (!collection) return accumulator
    const keys: Array<string | number> = Array.isArray(collection)
        ? collection.map((_, index) => index)
        : Object.keys(collection)
    let result = accumulator
    const source = collection as Record<string | number, unknown>
    for (const key of keys) {
        result = iteratee(result, source[key], key)
    }
    return result
}
/** 拆词（lodash words 的常用子集：驼峰、数字边界、分隔符） */
const splitWords = (value: unknown): string[] => String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
/** snake_case（lodash snakeCase 语义，用于由元素 id 推导配置键） */
export const snakeCase = (value: unknown): string => splitWords(value).map(word => word.toLowerCase()).join('_')
/** camelCase（与 snakeCase 同一拆词规则，供设置项与配置键互转） */
export const camelCase = (value: unknown): string => splitWords(value)
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('')
