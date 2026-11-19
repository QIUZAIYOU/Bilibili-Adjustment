/**
 * tooltip 定位几何（纯函数，便于单测）
 *
 * 设置弹窗根带 `zoom`（1920 宽 = 1，4K = 2），说明框挂在弹窗内部：
 * `getBoundingClientRect()` 给的是**视觉像素**，而写回 `left/top` 的是**布局像素**。
 * 直接把视觉坐标写回去会被祖先 zoom 再放大一次，表现就是 4K 下说明框越飘越远
 * （2026-11 用户反馈）。
 */
export interface TooltipIconRect {
    top: number
    bottom: number
    left: number
    width: number
}
export interface TooltipSize {
    width: number
    height: number
}
export interface TooltipViewport {
    width: number
    height: number
}
export interface TooltipPosition {
    /** 布局像素（直接赋给 style.left） */
    left: number
    /** 布局像素（直接赋给 style.top） */
    top: number
    placement: 'below' | 'above'
}
/** 说明框与图标之间的视觉间距（布局像素，随 zoom 同比放大） */
export const TOOLTIP_GAP = 8
/** 说明框与视口边缘的最小视觉留白 */
export const TOOLTIP_EDGE = 8
/**
 * 计算说明框位置：默认图标下方居中，越界时先水平夹取、再垂直翻转到上方。
 * @param icon 图标视觉矩形（getBoundingClientRect）
 * @param tooltip 说明框显示后的视觉尺寸
 * @param viewport 视口尺寸（window.innerWidth/innerHeight，布局像素）
 * @param zoom 弹窗当前 zoom（非正数或 NaN 按 1 处理）
 */
export const computeTooltipPosition = (
    icon: TooltipIconRect,
    tooltip: TooltipSize,
    viewport: TooltipViewport,
    zoom = 1
): TooltipPosition => {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    const iconCenterX = (icon.left + icon.width / 2) / scale
    const width = tooltip.width / scale
    const height = tooltip.height / scale
    const viewportWidth = viewport.width / scale
    const viewportHeight = viewport.height / scale
    let left = iconCenterX - width / 2
    const maxLeft = Math.max(TOOLTIP_EDGE, viewportWidth - width - TOOLTIP_EDGE)
    left = Math.min(Math.max(left, TOOLTIP_EDGE), maxLeft)
    let top = icon.bottom / scale + TOOLTIP_GAP
    let placement: TooltipPosition['placement'] = 'below'
    if (top + height > viewportHeight - TOOLTIP_EDGE) {
        top = icon.top / scale - height - TOOLTIP_GAP
        placement = 'above'
    }
    if (top < TOOLTIP_EDGE) top = TOOLTIP_EDGE
    return {
        left: Math.round(left * 100) / 100,
        top: Math.round(top * 100) / 100,
        placement
    }
}
