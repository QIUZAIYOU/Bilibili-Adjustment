/**
 * 页面水合是否完成
 *
 * B 站刷新时视频命中缓存，`canplaythrough` 远早于头部组件渲染；此时抢占滚动会把头部/
 * 评论区钉在水合前的空白态（2026-11-09 用户反馈「刷新后导航栏空白 + 定位失效」，
 * 同一机制在 2026-10-31 因整页锁滚动踩过一次）。
 */
/** 头部就绪后还要连续稳定这么多帧，避免组件刚挂载就抢滚动 */
export const PAGE_SETTLE_FRAMES = 2
/** 页面迟迟不 complete 时的兜底：等不到也不能让定位永远不执行 */
export const PAGE_SETTLE_MAX_WAIT_MS = 3000
export interface PageSettleInput {
    /** 顶部导航条已渲染出内容（B 站水合完成的可见信号） */
    headerReady: boolean
    /** document.readyState === 'complete'（脚本/样式已全部加载） */
    documentComplete: boolean
    /** 头部就绪且文档就绪后连续稳定的帧数 */
    stableFrames: number
    /** 需要多少帧，默认 PAGE_SETTLE_FRAMES */
    requiredFrames?: number
}
/** 纯判定：只做逻辑，时间/帧数/头部状态由调用方喂 */
export const isPageSettled = (input: PageSettleInput): boolean => {
    const requiredFrames = input.requiredFrames ?? PAGE_SETTLE_FRAMES
    return input.headerReady && input.documentComplete && input.stableFrames >= requiredFrames
}
/**
 * 等页面水合完成
 *
 * `isHeaderReady` 由调用方提供（选择器必须走注册表，这里不碰 DOM 结构）。
 * 返回 true = 确认就绪；false = 超时（调用方打一行日志后继续，不能因此不定位）。
 * 非浏览器环境（单测）直接视为就绪。
 */
export const waitForPageSettled = (isHeaderReady: () => boolean, maxWaitMs = PAGE_SETTLE_MAX_WAIT_MS): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(true)
    return new Promise<boolean>(resolve => {
        const startedAt = Date.now()
        let stableFrames = 0
        let done = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const finish = (value: boolean): void => {
            if (done) return
            done = true
            if (timer) clearTimeout(timer)
            resolve(value)
        }
        // 后台标签页的 rAF 会被完全挂起，只靠帧循环会一直等下去；定时器兜底保证定位最终能跑
        timer = setTimeout(() => finish(false), maxWaitMs)
        const step = (): void => {
            if (done) return
            const settled = isPageSettled({
                headerReady: isHeaderReady(),
                documentComplete: document.readyState === 'complete',
                stableFrames
            })
            if (settled) {
                finish(true)
                return
            }
            if (Date.now() - startedAt >= maxWaitMs) {
                finish(false)
                return
            }
            stableFrames += 1
            if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(step)
            else setTimeout(step, 16)
        }
        step()
    })
}
