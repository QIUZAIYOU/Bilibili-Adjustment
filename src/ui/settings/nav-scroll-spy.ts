/**
 * 设置弹窗悬浮导航的「当前分组」判定。
 *
 * 为什么抽成纯函数：判定基准必须与点击跳转完全一致（跳转量补偿了 sticky 头部的高度）。
 * 历史上这里以弹窗顶边 + 固定阈值判定，而跳转把分组标题顶到了头部下边框下方，
 * 头部高度正好把判定整体下压一格，于是「点『评论区』右侧停在评论区，导航却亮『画质、音质与字幕』」。
 * 该错位依赖真实滚动位置才能复现，抽出来后可用几何模型直接断言。
 */
/** 分组在判定中需要的几何信息（按文档顺序传入） */
export interface NavSectionPosition {
    id: string
    /** 分组顶边的视口坐标（隐藏分组可传 0，不会被使用） */
    top: number
    /** 分组当前不可见（如开关未开启导致整块 display: none） */
    hidden: boolean
}
/** 点击跳转会在头部下边框下方留 12px 空白，容差需略大于它，且远小于相邻分组的间距 */
export const NAV_ACTIVE_EDGE = 16
/** 点击跳转的视觉留白（弹窗像素） */
export const NAV_SCROLL_GAP = 12
/**
 * 计算点击导航要滚动的距离（**布局像素**）。
 *
 * 弹窗根带 zoom（4K 下为 2），`getBoundingClientRect` 给的是视觉像素，而 `scrollTop` 是
 * 布局像素；直接相加会把滚动量放大 zoom 倍，落点越过目标分组（2026-11 用户反馈）。
 */
export const computeNavScrollDelta = (options: {
    targetTop: number
    headerBottom: number
    zoom?: number
    gap?: number
}): number => {
    const zoom = Number.isFinite(options.zoom) && (options.zoom as number) > 0 ? options.zoom as number : 1
    const gap = Number.isFinite(options.gap) ? options.gap as number : NAV_SCROLL_GAP
    // gap 是布局像素，先减后除会让留白缩水（zoom=2 时只剩 12 视觉像素）；
    // 正确做法是先在视觉坐标里对齐顶边，再减去布局留白。
    return (options.targetTop - options.headerBottom) / zoom - gap
}
/**
 * @param positions 按文档顺序排列的分组
 * @param headerBottom 头部下边框的视口坐标（弹窗关闭时为 0）
 * @param atBottom 滚动容器已滚到底（调用方需先确认内容确实溢出）
 * @param edge 判定容差
 * @returns 应高亮的分组 id；没有可见分组时返回空串
 */
export const pickActiveSection = (
    positions: NavSectionPosition[],
    headerBottom: number,
    atBottom: boolean,
    edge: number = NAV_ACTIVE_EDGE
): string => {
    let current = ''
    let firstVisible = ''
    let lastVisible = ''
    for (const position of positions) {
        if (position.hidden) continue
        if (!firstVisible) firstVisible = position.id
        lastVisible = position.id
        // 按文档顺序遍历：最后一个「顶边已越过头部下边框」的可见分组即当前分组
        if (position.top - headerBottom <= edge) current = position.id
    }
    // 内容高度不足时末尾分组再也顶不到头部下缘（点击它高亮只会停在上一格），滚到底按边界兜底
    if (atBottom) return lastVisible
    return current || firstVisible
}
