/**
 * 元素条件等待（P1-4.4）
 *
 * 动态页等 SPA 页面元素出现时机不稳定，此前用「立即一次 → wait → 6 次 sleep(1000)」粗放轮询。
 * 这里统一为：立即探测 → MutationObserver 监听出现 → 轻量兜底轮询 → 超时放弃。
 * 命中即断开观察并回调，返回停止函数（可推入模块 _cleanup，uninstall 时释放）。
 */
const DEFAULT_TIMEOUT = 10000
const DEFAULT_INTERVAL = 400
/** waitForCondition 的选项 */
export interface WaitForConditionOptions {
    /** 探测函数：返回真值表示条件满足 */
    probe: () => unknown
    /** 条件满足时回调（只调用一次） */
    onFound: (value: unknown) => void
    /** 最长等待时间（默认 10s） */
    timeout?: number
    /** 兜底轮询间隔（默认 400ms） */
    interval?: number
    /** MutationObserver 触发后的防抖间隔（默认 120ms） */
    observeLimit?: number
}
/**
 * 等待条件满足；返回停止函数（幂等，可用于模块 uninstall 清理）。
 */
export const waitForCondition = (options: WaitForConditionOptions): (() => void) => {
    const {
        probe,
        onFound,
        timeout = DEFAULT_TIMEOUT,
        interval = DEFAULT_INTERVAL,
        observeLimit = 120
    } = options
    let stopped = false
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let intervalTimer: ReturnType<typeof setInterval> | null = null
    let observeTimer: ReturnType<typeof setTimeout> | null = null
    let observer: MutationObserver | null = null
    const stop = () => {
        if (stopped) return
        stopped = true
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (intervalTimer) clearInterval(intervalTimer)
        if (observeTimer) clearTimeout(observeTimer)
        observer?.disconnect()
        timeoutTimer = null
        intervalTimer = null
        observeTimer = null
    }
    const tryNow = (): boolean => {
        if (stopped) return true
        let value: unknown = null
        try {
            value = probe()
        } catch {
            value = null
        }
        if (!value) return false
        stop()
        onFound(value)
        return true
    }
    if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(() => {
            // 子树变化可能非常频繁，做短防抖避免高频 probe
            if (observeTimer) return
            observeTimer = setTimeout(() => {
                observeTimer = null
                tryNow()
            }, observeLimit)
        })
    }
    if (tryNow()) return stop
    observer?.observe(document.documentElement, { childList: true, subtree: true })
    intervalTimer = setInterval(tryNow, interval)
    timeoutTimer = setTimeout(() => {
        if (!tryNow()) stop()
    }, timeout)
    return stop
}
