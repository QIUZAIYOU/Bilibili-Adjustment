import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAtScrollEnd, isDocumentGrowing, isPlausibleNaturalOffset, isPositionedAtPlayer, resolveLocateDuration, resolveScrollOffset } from '@/utils/layout-settle'
/**
 * 「定位到位」判定回归（issue #39「播放器定位固定上限变成57」）
 *
 * 用户实测：刷新视频页后自动定位停在 57px 处不动，切换分P 就恢复正常。
 * 根因是刷新初期评论/推荐还没渲染完，文档只比视口高一点点（可滚动范围 57px），
 * 旧实现把「已经滚到底」直接当成定位成功就收工了，文档之后长高也没人重新定位。
 * 因此「到底」必须叠加「文档高度已稳定」才算到位。
 */
test('isAtScrollEnd：滚动到底部（含 1px 容差）', () => {
    assert.equal(isAtScrollEnd(0, 900, 900), true)
    assert.equal(isAtScrollEnd(57, 957, 900), true)
    assert.equal(isAtScrollEnd(56, 957, 900), true)
    assert.equal(isAtScrollEnd(55, 957, 900), false)
    assert.equal(isAtScrollEnd(2269, 3169, 900), true)
    assert.equal(isAtScrollEnd(2000, 3169, 900), false)
})
test('isDocumentGrowing：高度变化超过 1px 才算仍在增长', () => {
    assert.equal(isDocumentGrowing(957, 957), false)
    assert.equal(isDocumentGrowing(957, 958), false)
    assert.equal(isDocumentGrowing(957, 3182), true)
    assert.equal(isDocumentGrowing(3182, 957), true)
})
test('isPositionedAtPlayer：播放器落在目标位置即到位（吸顶同样成立）', () => {
    assert.equal(isPositionedAtPlayer({
        playerViewportTop: 69,
        targetViewportTop: 69,
        scrollY: 99,
        scrollHeight: 3169,
        clientHeight: 900,
        documentGrowing: false
    }), true)
    assert.equal(isPositionedAtPlayer({
        playerViewportTop: 69,
        targetViewportTop: 72,
        scrollY: 99,
        scrollHeight: 3169,
        clientHeight: 900,
        documentGrowing: true
    }), true)
})
test('isPositionedAtPlayer：到底但文档仍在长高时不算到位（会固定在临时上限）', () => {
    assert.equal(isPositionedAtPlayer({
        playerViewportTop: 0,
        targetViewportTop: 69,
        scrollY: 57,
        scrollHeight: 957,
        clientHeight: 900,
        documentGrowing: true
    }), false)
})
test('isPositionedAtPlayer：到底且文档高度已稳定才算到位（如无评论的短页面）', () => {
    assert.equal(isPositionedAtPlayer({
        playerViewportTop: 0,
        targetViewportTop: 69,
        scrollY: 57,
        scrollHeight: 957,
        clientHeight: 900,
        documentGrowing: false
    }), true)
})
test('isPositionedAtPlayer：既没到目标位置也没到底 → 未到位', () => {
    assert.equal(isPositionedAtPlayer({
        playerViewportTop: 168,
        targetViewportTop: 69,
        scrollY: 0,
        scrollHeight: 3169,
        clientHeight: 900,
        documentGrowing: false
    }), false)
})
/**
 * 「播放器自然位置」合理性校验（issue #39 用户回复：设置说明里显示的数字被记成了 57）
 *
 * 这个值会写进 `player_offset_top` 并直接显示在设置项说明里，所以全屏/小窗/布局中间态
 * 读到的贴边小值必须挡住；实测各分辨率下的合理值在 168~172 区间。
 */
test('isPlausibleNaturalOffset：挡住贴边小值与离谱大值', () => {
    assert.equal(isPlausibleNaturalOffset(168), true)
    assert.equal(isPlausibleNaturalOffset(172), true)
    assert.equal(isPlausibleNaturalOffset(104), true)
    assert.equal(isPlausibleNaturalOffset(0), false)
    assert.equal(isPlausibleNaturalOffset(39), false)
    assert.equal(isPlausibleNaturalOffset(-1), false)
    assert.equal(isPlausibleNaturalOffset(900), false)
    assert.equal(isPlausibleNaturalOffset(Number.NaN), false)
})
/**
 * 目标滚动位置换算（issue #39 后续反馈：小窗模式下点「定位」位置偏了一截）
 *
 * 实测（1440×900，播放器自然位置 168、吸顶头部 64、用户偏移 80）：
 * 正确目标 168 − (64 + 80) = 24；旧的小窗分支直接滚到 168，播放器上沿落到 0 被头部挡住。
 */
test('resolveScrollOffset：让开头部并叠加偏移', () => {
    assert.deepEqual(resolveScrollOffset(168, 144, 2874), { offset: 24, desiredOffset: 24 })
})
test('resolveScrollOffset：文档太矮时 clamp，但仍保留理想值', () => {
    assert.deepEqual(resolveScrollOffset(168, 144, 10), { offset: 10, desiredOffset: 24 })
})
test('resolveScrollOffset：播放器本身在目标位置上方 → 不滚动', () => {
    assert.deepEqual(resolveScrollOffset(100, 144, 2874), { offset: 0, desiredOffset: 0 })
})
test('resolveScrollOffset：负值不产生负滚动位置', () => {
    assert.deepEqual(resolveScrollOffset(-5, 0, 100), { offset: 0, desiredOffset: 0 })
})
/**
 * 「定位滚动动画」设置 → 动画时长（用户要求把滚动动画做成可配置项）
 *
 * 设置只有两种取值：smooth（默认，平滑滚动 300ms）与 instant（直接跳到位，时长 0）。
 * 未设置或存着历史脏值时必须退回平滑滚动，不能变成「永远瞬移」。
 */
test('resolveLocateDuration：instant 为 0，其余退回平滑滚动', () => {
    assert.equal(resolveLocateDuration('instant'), 0)
    assert.equal(resolveLocateDuration('smooth'), 300)
    assert.equal(resolveLocateDuration(undefined), 300)
    assert.equal(resolveLocateDuration(null), 300)
    assert.equal(resolveLocateDuration(''), 300)
    assert.equal(resolveLocateDuration('INSTANT'), 300)
})
