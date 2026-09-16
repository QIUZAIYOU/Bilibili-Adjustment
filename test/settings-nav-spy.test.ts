import test from 'node:test'
import assert from 'node:assert/strict'
import { pickActiveSection, NAV_ACTIVE_EDGE } from '../src/ui/settings/nav-scroll-spy'
// 回归背景（2026-09 用户反馈）：点击导航「评论区」，右侧正确停靠到评论区设置项，
// 但导航高亮却停在上一格「画质、音质与字幕」。根因是判定的基准用了弹窗顶边 + 固定阈值 100，
// 而点击跳转把目标标题顶到了「头部下边框 + 12px」，中间差的整个 sticky 头部高度
// 恰好把判定压低一格。下面用几何模型固化「跳转后高亮 == 被点分组」。
/** 头部高度（sticky，padding 24/20 + 标题行高 ≈ 实测值，取值只要显著大于 100 就能复现原 bug） */
const HEADER_HEIGHT = 150
/** 弹窗可视高度 */
const VIEWPORT = 600
/** 跳转留白（与 setupSettingsNav 的 click 处理保持一致） */
const CLICK_GAP = 12
/** 分组模型：按文档顺序排列，hidden 模拟「开关未开启整块 display:none」 */
const sections = [
    { id: 'player', height: 420 },
    { id: 'quality', height: 260 },
    { id: 'comment', height: 300 },
    { id: 'skip', height: 240 },
    { id: 'ai', height: 200, hidden: true },
    { id: 'ui', height: 380 }
]
const visibleSections = sections.filter(section => !section.hidden)
/** 表单上下留白与分区间距（.adjustment-form: padding 0 28px 28px; gap 20px） */
const FORM_GAP = 20
const FORM_PADDING_BOTTOM = 28
const contentHeight = visibleSections.reduce((sum, section, index) => (
    sum + section.height + (index ? FORM_GAP : 0)
), 0) + FORM_PADDING_BOTTOM
const maxScroll = Math.max(0, contentHeight - VIEWPORT)
/** 各分组顶边相对弹窗顶部的偏移（未滚动时） */
const offsets = new Map<string, number>()
let cursor = HEADER_HEIGHT
for (const section of visibleSections) {
    offsets.set(section.id, cursor)
    cursor += section.height + FORM_GAP
}
/**
 * 构造某一滚动位置下的判定入参：弹窗顶边固定在视口 y=100 处
 * （真实场景弹窗是垂直居中且与视口无关，这里只需保证 top 与 headerBottom 的相对关系正确）
 */
const POPOVER_TOP = 100
const positionsAt = (scrollTop: number) => sections.map(section => ({
    id: section.id,
    top: POPOVER_TOP + (offsets.get(section.id) ?? 0) - scrollTop,
    hidden: section.hidden === true
}))
const headerBottomAt = (): number => POPOVER_TOP + HEADER_HEIGHT
const atBottomAt = (scrollTop: number): boolean => scrollTop >= maxScroll - 0.5
/** 点击导航项后弹窗的滚动位置（与 setupSettingsNav 的 click 处理同公式，并受 maxScroll 夹取） */
const scrollTopOfClick = (id: string): number => Math.min(
    Math.max(0, (offsets.get(id) ?? 0) - HEADER_HEIGHT - CLICK_GAP),
    maxScroll
)
/** 点击某分组后导航实际应高亮的项 */
const activeAfterClick = (id: string): string => {
    const scrollTop = scrollTopOfClick(id)
    return pickActiveSection(positionsAt(scrollTop), headerBottomAt(), atBottomAt(scrollTop))
}
test('点击任意可见分组后，高亮落在被点击的分组上', () => {
    for (const id of ['player', 'quality', 'comment', 'skip']) {
        assert.equal(activeAfterClick(id), id, `点击 ${id} 后应高亮 ${id}（滚动位置 ${scrollTopOfClick(id)}）`)
    }
})
test('末尾分组受滚动到底兜底（内容不足时顶不到头部下缘）', () => {
    const scrollTop = scrollTopOfClick('ui')
    // 该模型下末尾分组确实顶不到头部下缘，只有边界兜底才能正确高亮
    assert.ok((offsets.get('ui') ?? 0) - scrollTop > HEADER_HEIGHT + NAV_ACTIVE_EDGE)
    assert.equal(activeAfterClick('ui'), 'ui')
})
test('未滚动时高亮第一个可见分组', () => {
    assert.equal(pickActiveSection(positionsAt(0), headerBottomAt(), false), 'player')
})
test('手动滚动时高亮随滚动位置推进，不越过尚未到达的分组', () => {
    const commentTop = offsets.get('comment') ?? 0
    // 滚到评论区标题正好越过头部下缘
    const justArrived = commentTop - HEADER_HEIGHT
    assert.equal(pickActiveSection(positionsAt(justArrived), headerBottomAt(), false), 'comment')
    // 还差 1px 才到：仍属于上一格
    assert.equal(pickActiveSection(positionsAt(justArrived - 20), headerBottomAt(), false), 'quality')
})
test('隐藏分组既不参与高亮也不打断推进', () => {
    const qualityTop = offsets.get('quality') ?? 0
    const arrived = positionsAt(qualityTop - HEADER_HEIGHT)
    // 隐藏分组没有布局位置（rect 为 0 或残留旧值），即便给了「已越过头部下缘」的 top 也不能被选中
    const withStaleAi = arrived.map(position => position.id === 'ai'
        ? { ...position, top: headerBottomAt() - 100 }
        : position)
    assert.equal(pickActiveSection(withStaleAi, headerBottomAt(), false), 'quality')
    // 隐藏的「ai」位于 skip 之后，前进到 skip 不受它影响
    assert.equal(pickActiveSection(arrived, headerBottomAt(), false), 'quality')
})
test('没有可见分组时返回空串（导航项全部隐藏）', () => {
    assert.equal(pickActiveSection([], headerBottomAt(), false), '')
    assert.equal(pickActiveSection(
        sections.map(section => ({ id: section.id, top: POPOVER_TOP, hidden: true })),
        headerBottomAt(),
        false
    ), '')
})
test('容差大于跳转留白，避免因亚像素取整把高亮留在上一格', () => {
    assert.ok(NAV_ACTIVE_EDGE > CLICK_GAP)
    // 标题停在头部下缘下方 CLICK_GAP 处（点击跳转的落点）仍算已到达
    const positions = positionsAt(0).map(position => (
        position.id === 'quality' ? { ...position, top: headerBottomAt() + CLICK_GAP } : position
    ))
    assert.equal(pickActiveSection(positions, headerBottomAt(), false), 'quality')
})
