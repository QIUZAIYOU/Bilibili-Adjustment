/**
 * 布局稳定判定（纯函数）
 *
 * 背景（issue #39「播放器定位固定上限变成57」）：视频页刚刷新时，播放器下方的评论/推荐还没渲染完，
 * 文档总高只比视口高一点点，可滚动范围可能只有几十像素。旧实现把「已经滚到底部」直接当成定位成功，
 * 于是定位停在这个**临时上限**（用户实测 57）之后再不动 —— 页面内容加载完、文档长高了也没人重新定位，
 * 只有切换分P（此时文档已渲染完）才恢复正常。
 * 因此「是否到底」不能单独作为成功条件，必须叠加「文档高度已经不再增长」。
 */
/** 是否已滚动到文档底部（留 1px 容差） */
export const isAtScrollEnd = (scrollY: number, scrollHeight: number, clientHeight: number): boolean =>
    scrollY >= scrollHeight - clientHeight - 1
/** 文档高度是否仍在变化（布局还没稳定） */
export const isDocumentGrowing = (previousHeight: number, currentHeight: number, tolerance = 1): boolean =>
    Math.abs(currentHeight - previousHeight) > tolerance
/**
 * 播放器「自然位置」（文档顶到播放器上沿的距离）是否可信
 *
 * 背景（issue #39）：这个值会写进 `player_offset_top`，再显示在设置项「播放器顶部偏移」的说明里
 * （提示里的那个数字）。它在**全屏/网页全屏/小窗**时读到的是贴视口的小值，在布局中间态也能读到
 * 半截值 —— 历史上有用户就是因为说明里的数字变成 57 而以为"定位上限只有 57"。
 * 所以只在合理区间内才采信：下限 40 挡住 0/贴边的瞬时值，上限 800 挡住离谱的中间态。
 * 区间只是粗糙兜底，真正的把关是「同一位置上连续两次采样一致 + 播放器在文档流里」。
 */
export const isPlausibleNaturalOffset = (value: number, min = 40, max = 800): boolean =>
    Number.isFinite(value) && value >= min && value <= max
interface PositionCheck {
    /** 播放器容器当前视口位置（getBoundingClientRect().top） */
    playerViewportTop: number
    /** 播放器顶部应对齐到的视口位置 */
    targetViewportTop: number
    scrollY: number
    scrollHeight: number
    clientHeight: number
    /** 文档高度是否仍在增长（布局未稳定） */
    documentGrowing: boolean
    /** 视口位置容差，默认 8px */
    tolerance?: number
}
/**
 * 是否已经定位到播放器位置：
 * - 播放器顶部落在目标位置 ±tolerance：成功（B站吸顶时视口位置同样成立）；
 * - 已经滚到文档底部：**只有文档高度不再增长时**才算成功 —— 内容还在加载时的「底部」是临时上限，
 *   此时收工就会把定位固定在偏小的位置（issue #39）。
 */
export const isPositionedAtPlayer = (check: PositionCheck): boolean => {
    const tolerance = check.tolerance ?? 8
    if (Math.abs(check.playerViewportTop - check.targetViewportTop) <= tolerance) return true
    const atEnd = isAtScrollEnd(check.scrollY, check.scrollHeight, check.clientHeight)
    return atEnd && !check.documentGrowing
}
