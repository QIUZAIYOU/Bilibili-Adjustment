/**
 * 头部是否「压在内容上方」（纯函数，零依赖 → 便于单测）
 *
 * 用途：视频页「自动定位播放器」要判断顶部头部**是否固定悬浮在视口上**：
 * 是的话滚动目标要把头部高度扣掉，否则播放器顶部会被头部盖住；不是则不能扣（会多滚 64px）。
 *
 * 口径（2026-09-21 实测确定）：**只有 `fixed` / `sticky`（以及取值里含 `fixed` 字样）才算**。
 * 为什么不能用「非 static 一律算」（上一版踩过的坑）：
 * - 开启「夜间哔哩」样式时，用户刻意给 `.bili-header--fixed .bili-header__bar` 加了
 *   `position: relative !important`，让导航栏**不吸顶**、随页面滚走（实测滚动 1500 时 rect.top = -1500）；
 *   若按「非 static」判为固定，自动定位会多扣 64px、位置偏上。
 * - 关闭该样式时同一元素计算值是 `fixed`（实测各滚动位置 rect.top 恒为 0），此时必须扣掉 64px。
 * - `relative`/`absolute`/`static` 都随文档流滚动，一律不算；`sticky` 会钉在视口顶部，算。
 * - 读不到样式（元素不存在 / 空串）→ false，保持「没有头部就不扣高度」的行为。
 */
export const isHeaderOverlaying = (position: string | undefined): boolean => {
    if (typeof position !== 'string' || position === '') return false
    const value = position.toLowerCase()
    return value === 'fixed' || value === 'sticky' || value.includes('fixed')
}
