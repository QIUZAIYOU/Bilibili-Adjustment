import { LoggerService } from '@/services/logger.service'
import { insertStyleToDocument } from '@/utils/common'
const logger = new LoggerService('VideoModule', { notify: false })
/** 判定「偏离目标位置」的容差：小于它的漂移不纠正，避免与定位流程互相拉扯 */
const DRIFT_TOLERANCE_PX = 24
/** 守卫最长存活时间：兜底释放，任何异常情况下都不会长期接管页面滚动 */
const MAX_HOLD_MS = 4000
/** 用户主动滚动/操作的事件：一出现就释放守卫（绝不和用户抢滚动条） */
const USER_INTENT_EVENTS = ['wheel', 'touchstart', 'keydown'] as const
/** 守卫句柄 */
export interface ScrollGuardHandle {
    /** 更新锚定位置（定位流程算出最终目标后调用） */
    setTarget: (y: number) => void
    /** 释放守卫并还原页面滚动 */
    release: () => void
}
/** 当前生效的守卫（同一时刻只允许一个，重复触发时刷新而不是叠加） */
let activeGuard: ScrollGuardHandle | null = null
/** 取用户脚本可见的「真实页面 window」（沙箱里 window 不是页面对象，必须用 unsafeWindow） */
const getPageWindow = (): (Window & typeof globalThis) | null => {
    try {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
        return pageWindow && typeof pageWindow.scrollTo === 'function' ? pageWindow : null
    } catch {
        return null
    }
}
/** 从 scrollTo 参数里解析目标位置；解析不出返回 null（原样放行） */
const readRequestedTop = (args: unknown[]): number | null => {
    const first = args[0]
    if (first !== null && typeof first === 'object') {
        const top = Number((first as ScrollToOptions).top)
        return Number.isFinite(top) ? top : null
    }
    if (typeof first === 'number' && typeof args[1] === 'number') return args[1]
    if (typeof first === 'number') return null
    return null
}
/**
 * 选集切换期间的「位置守卫」：把页面发起的滚动请求钉在播放器位置。
 *
 * ⚠️ 为什么需要它（2026-09-24 用户报「切换选集后还是会先滚动到顶部」）：
 * 「先滚到顶部」**不是我们滚的，而是 B 站自己滚的** —— 实测（真实页面 + 浏览器取证）：
 * 点击选集后约 35ms，B 站 `video.js` 的 `a.switchVideo` 就调用 `window.scrollTo(0, 0)`；
 * 而视频页的滚动容器带 CSS `scroll-behavior: smooth`，于是页面会**可见地滑到顶部**，
 * 之后我们的定位才把位置拉回来（3.36.7 改成瞬时跳转也只能"事后补救"）。
 * 因此在点击选集的那一刻就接管滚动：
 * 1. 拦截页面发起的 `scrollTo`：与锚点位置相差超过容差的请求直接改写到锚点（保持瞬时）；
 * 2. `scroll-behavior: auto !important` 兜底，杜绝 CSS 平滑滚动把 `behavior:'auto'` 也变成动画；
 * 3. rAF 锚定兜底：B 站若用其它方式（`scrollTop = 0`、`scrollIntoView`）移动页面，也在下一帧纠回。
 * 释放时机：用户主动滚动、超时兜底、或定位流程显式 release —— 绝不长期占用滚动条。
 *
 * @param targetY 锚定的滚动位置（应传当前"已定位到播放器"时的 scrollY）
 * @param options.tolerance 漂移容差（px）
 * @param options.maxMs 最长存活时间（ms）
 */
export const holdScrollPosition = (targetY: number, options: { tolerance?: number, maxMs?: number } = {}): ScrollGuardHandle | null => {
    const win = getPageWindow()
    if (!win) return null
    // 重复触发（如连点选集）时刷新已有守卫，避免多层补丁互相打架
    activeGuard?.release()
    const tolerance = options.tolerance ?? DRIFT_TOLERANCE_PX
    const maxMs = options.maxMs ?? MAX_HOLD_MS
    const nativeScrollTo = win.scrollTo.bind(win) as (...args: unknown[]) => void
    let target = targetY
    let released = false
    let rafId = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let intercepted = 0
    let corrected = 0
    const release = (reason: string): void => {
        if (released) return
        released = true
        if (rafId) win.cancelAnimationFrame(rafId)
        if (timer !== null) clearTimeout(timer)
        // 只还原"还是我们装上去的那个"补丁，避免把后来者替换掉
        if (win.scrollTo === patchedScrollTo) win.scrollTo = nativeScrollTo as typeof win.scrollTo
        insertStyleToDocument({ AdjScrollGuardStyle: '' })
        for (const type of USER_INTENT_EVENTS) win.removeEventListener(type, onUserIntent, true)
        if (activeGuard === handle) activeGuard = null
        logger.debug(`选集定位丨位置守卫已释放（${reason}）：拦截页面滚动 ${intercepted} 次、纠正漂移 ${corrected} 次`)
    }
    const onUserIntent = (): void => release('用户主动滚动')
    const patchedScrollTo = function (...args: unknown[]): void {
        const requested = readRequestedTop(args)
        // 解析不出目标、或与锚点相差不大 → 原样放行（B 站的正常微调不拦）
        if (released || requested === null || Math.abs(requested - target) <= tolerance) {
            nativeScrollTo(...args)
            return
        }
        intercepted++
        logger.debug(`选集定位丨已接管页面滚动：${Math.round(requested)} → ${Math.round(target)}（保持在播放器位置）`)
        nativeScrollTo({ top: target, behavior: 'instant' })
    } as typeof win.scrollTo
    const tick = (): void => {
        if (released) return
        if (Math.abs(win.scrollY - target) > tolerance) {
            corrected++
            nativeScrollTo({ top: target, behavior: 'instant' })
        }
        rafId = win.requestAnimationFrame(tick)
    }
    insertStyleToDocument({ AdjScrollGuardStyle: 'html, body { scroll-behavior: auto !important; }' })
    win.scrollTo = patchedScrollTo
    for (const type of USER_INTENT_EVENTS) win.addEventListener(type, onUserIntent, true)
    rafId = win.requestAnimationFrame(tick)
    timer = setTimeout(() => release('超时'), maxMs)
    const handle: ScrollGuardHandle = {
        setTarget: (y: number): void => {
            target = y
        },
        release: (): void => release('定位完成')
    }
    activeGuard = handle
    logger.debug(`选集定位丨已接管页面滚动（锚定 ${Math.round(targetY)}，容差 ${tolerance}px，最长 ${maxMs}ms）`)
    return handle
}
/** 当前是否有生效中的守卫（测试/排查用） */
export const hasActiveScrollGuard = (): boolean => activeGuard !== null
