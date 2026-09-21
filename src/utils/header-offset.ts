/**
 * 头部占位判据（纯函数，零依赖 → 便于单测）
 *
 * 用途：视频页「自动定位播放器」需要知道顶部头部**是否压在内容上方**：
 * 是的话，滚动目标要把头部高度扣掉，否则播放器顶部会被吸顶头部盖住。
 *
 * 口径（2026-09-21 按实际改版确定）：**position 非 static，或值里含 `fixed` 字样**都算。
 * - B 站当前真正吸顶的是 `.bili-header__bar`（`position: fixed`，高 64px，始终存在）；
 * - 容器 `.bili-header.bili-header--mini` 只是态类，`position` 为 `relative` 且会随页面滚走，
 *   所以判据不能写死 `=== 'fixed'`（那样换元素或 B 站改用 sticky 就会失灵）；
 * - 读不到样式（元素不存在 / 空串）→ false，保持「没有头部就不扣高度」的行为。
 */
export const isHeaderOverlaying = (position: string | undefined): boolean =>
    typeof position === 'string' && position !== '' && (position !== 'static' || position.includes('fixed'))
