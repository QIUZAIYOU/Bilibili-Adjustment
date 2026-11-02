/**
 * 弹窗等比缩放
 *
 * 问题：弹窗宽度写死 550px、字号写死 14px，在 1920 宽的屏上占 28.6% 看着正好，
 * 到 4K（3840 CSS px）就只有 14.3%，显得又窄又空。
 *
 * 做法：把「1920 宽」当作 1.0 基准，按 `视口宽 / 1920` 算出一个缩放系数写进
 * `--adj-ui-zoom`，弹窗根节点用 `zoom: var(--adj-ui-zoom)` 整体缩放。
 * 选 zoom 而不是逐个改 vw/rem：弹窗内部有一整套写死的 px 尺寸（字号/内距/图标/圆角），
 * zoom 一次性把它们连同布局一起等比放大，视觉比例与 1920 下完全一致，也不必触碰
 * 几百条既有规则。上限 2.0（3840 正好，超宽屏再多也没意义），下限 1.0（窄屏保持原样，
 * 避免小屏把弹窗压得更挤）。
 */
export const UI_SCALE_BASE_WIDTH = 1920
export const UI_SCALE_MIN = 1
export const UI_SCALE_MAX = 2
export const UI_SCALE_VAR = '--adj-ui-zoom'
/** 缩放系数的倒数：弹窗还要按视口百分比限制宽高（92vw / 88vh），缩放后必须乘回去才不会溢出 */
export const UI_SCALE_INV_VAR = '--adj-ui-zoom-inv'
/** 视口宽度 → 缩放系数（纯函数，便于单测） */
export const computeUiZoom = (viewportWidth: number, baseWidth = UI_SCALE_BASE_WIDTH): number => {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(baseWidth) || baseWidth <= 0 || viewportWidth <= 0) {
        return UI_SCALE_MIN
    }
    const ratio = viewportWidth / baseWidth
    const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, ratio))
    // 保留 3 位小数：zoom 取整会让 2560 这类常见宽度落在 1.3 而不是 1.333，比例偏差肉眼可辨
    return Math.round(clamped * 1000) / 1000
}
const readViewportWidth = (): number => (typeof window === 'undefined' ? 0 : window.innerWidth)
/** 把当前缩放系数写进根节点变量（同步、极轻，弹窗打开前即可用） */
export const applyUiZoom = (width = readViewportWidth()): number => {
    const zoom = computeUiZoom(width)
    if (typeof document === 'undefined' || !document.documentElement) return zoom
    document.documentElement.style.setProperty(UI_SCALE_VAR, String(zoom))
    document.documentElement.style.setProperty(UI_SCALE_INV_VAR, String(Math.round((1 / zoom) * 1000) / 1000))
    return zoom
}
/** 跟随窗口尺寸变化持续更新（去抖 150ms；resize 只在窗口/缩放比例变化时触发，开销可忽略） */
export const installUiZoom = (): void => {
    applyUiZoom()
    if (typeof window === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    window.addEventListener('resize', () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            applyUiZoom()
        }, 150)
    })
}
