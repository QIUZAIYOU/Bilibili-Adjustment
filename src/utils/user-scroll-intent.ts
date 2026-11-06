/**
 * 用户滚动意图仲裁（纯判定 + 浏览器胶水）
 *
 * 背景（2026-11-06 用户报「功能都加载完了，定位还在跟用户抢滚动，日志也没有」）：
 * 播放器自动定位有 5 条会主动滚页面的路径 —— 定位重试、文档长高后补定位、点播放器定位、
 * 选集切换的位置守卫、以及底层的 `documentScrollTo`（落不到位就在 3s 预算内反复重写滚动）。
 * 这些路径全都只看「目标位置到没到」，从不问「用户现在是不是在自己滚」，
 * 于是页面刚加载、用户在往评论区滚的时候，脚本会连续把页面拽回播放器。
 *
 * 这里把「用户想自己滚」沉淀成一个全局时间戳：任何自动滚动在动手前问一句
 * `shouldYieldNow()`，命中就让位并**停止本轮**（不是延后再抢）。日志口径见调用点。
 *
 * ⚠️ 为什么只认 wheel / touch / pointer / 方向键，**不认裸 `scroll` 事件**：
 * B 站自己的 `switchVideo` 会 `window.scrollTo(0, 0)`，而视频页滚动容器带
 * `scroll-behavior: smooth` —— 那串 `scroll` 事件是**页面**滚的，认成「用户意图」会让
 * 3.43.1 修好的「选集不闪回顶部」重新坏掉。拖滚动条会先有 pointerdown、键盘滚动有 keydown，
 * 用户真实操作都不会漏。
 */
/** 用户操作后，多久内自动滚动要让位（毫秒） */
export const USER_INTENT_WINDOW_MS = 1200
/** 我们自己写滚动后，多久内的 scroll 事件不算用户操作（毫秒） */
export const PROGRAMMATIC_SCROLL_WINDOW_MS = 120
/**
 * 脚本自己注入的界面：点这些元素不算「用户想滚页面」
 * （否则点一下侧栏「设置」就会让当次自动定位失效）
 */
export const OWN_UI_SELECTOR = '[bilibili-adjustment-element], .adjustment-popover, .adjustment-dialog, .adj-update-card, .adjustment-settings-nav'
/** 会让页面滚动的用户操作类型 */
export type UserIntentKind = 'wheel' | 'touch' | 'pointer' | 'key'
/**
 * 距上次用户操作是否还在让位窗口内（纯函数，便于单测）
 *
 * `sinceTs <= 0` 表示「从没操作过」，`now < sinceTs`（时钟回拨/未来时间戳）也按不拦截处理。
 */
export const shouldYieldToUser = (now: number, sinceTs: number, windowMs: number = USER_INTENT_WINDOW_MS): boolean => {
    if (!Number.isFinite(now) || !Number.isFinite(sinceTs) || !Number.isFinite(windowMs)) return false
    if (sinceTs <= 0 || windowMs <= 0) return false
    const elapsed = now - sinceTs
    return elapsed >= 0 && elapsed < windowMs
}
/** 事件目标是否落在脚本自己的界面里（拿不到 closest 时按「不是」处理，宁可不拦截也不误判） */
export const isOwnUiInteraction = (target: unknown): boolean => {
    const element = target as { closest?: (selector: string) => Element | null } | null
    if (!element || typeof element.closest !== 'function') return false
    try {
        return element.closest(OWN_UI_SELECTOR) !== null
    } catch {
        return false
    }
}
/** 该事件是否要忽略（点自己界面的 pointerdown、在输入框里敲空格/方向键都不算想滚页面） */
export const shouldIgnoreIntentEvent = (kind: UserIntentKind, target: unknown): boolean => {
    if (kind === 'pointer' && isOwnUiInteraction(target)) return true
    if (kind === 'key') {
        const element = target as { tagName?: string, isContentEditable?: boolean } | null
        const tag = String(element?.tagName ?? '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || element?.isContentEditable) return true
    }
    return false
}
/** 会让页面滚动的按键（其余按键与滚动无关，避免打字时误判） */
export const SCROLL_INTENT_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'] as const
export const isScrollIntentKey = (key: string): boolean => (SCROLL_INTENT_KEYS as readonly string[]).includes(key)
let lastIntentAt = 0
let programmaticUntil = 0
const intentSubscribers = new Set<() => void>()
/** 记一次用户滚动意图（自动滚动看到后必须让位） */
export const noteUserIntent = (): void => {
    lastIntentAt = Date.now()
    for (const notify of intentSubscribers) {
        try {
            notify()
        } catch {
            // 订阅者报错不能影响页面事件流
        }
    }
}
/** 最近一次用户滚动意图的时间戳（0 = 从未） */
export const lastUserIntentAt = (): number => lastIntentAt
/** 清空意图：用户显式要求定位时调用，表示「这次是我要的」 */
export const clearUserIntent = (): void => {
    lastIntentAt = 0
}
/** 标记「接下来这段时间的滚动是我们自己写的」 */
export const markProgrammaticScroll = (ms: number = PROGRAMMATIC_SCROLL_WINDOW_MS): void => {
    programmaticUntil = Date.now() + Math.max(0, ms)
}
/** 当前是否处于「自己刚滚过」的窗口内 */
export const isInsideProgrammaticScroll = (now: number = Date.now()): boolean => now < programmaticUntil
/** 现在是否该让位给用户（自动滚动在动手前统一问这个） */
export const shouldYieldNow = (windowMs: number = USER_INTENT_WINDOW_MS): boolean => shouldYieldToUser(Date.now(), lastIntentAt, windowMs)
/** 订阅用户滚动意图（返回取消订阅；滚动动画靠它立即停手） */
export const subscribeUserIntent = (callback: () => void): (() => void) => {
    intentSubscribers.add(callback)
    return () => intentSubscribers.delete(callback)
}
/** 测试用：重置全局状态 */
export const resetUserScrollIntent = (): void => {
    lastIntentAt = 0
    programmaticUntil = 0
    intentSubscribers.clear()
}
let installed = false
/**
 * 装上全局监听（幂等）
 *
 * 只装一次：模块卸载/SPA 换页都不需要拆 —— 监听是 `passive` + 只写一个时间戳，
 * 拆了反而会让「先装后卸」的模块在重载后收不到意图。
 */
export const installUserScrollIntent = (): void => {
    if (installed || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
    installed = true
    const options: AddEventListenerOptions = { passive: true, capture: true }
    window.addEventListener('wheel', () => noteUserIntent(), options)
    window.addEventListener('touchstart', () => noteUserIntent(), options)
    window.addEventListener('pointerdown', event => {
        if (shouldIgnoreIntentEvent('pointer', event.target)) return
        noteUserIntent()
    }, options)
    window.addEventListener('keydown', event => {
        const keyboard = event as KeyboardEvent
        if (!isScrollIntentKey(keyboard.key)) return
        if (shouldIgnoreIntentEvent('key', keyboard.target)) return
        noteUserIntent()
    }, options)
}
