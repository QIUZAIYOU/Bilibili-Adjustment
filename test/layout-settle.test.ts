import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAtScrollEnd, isDocumentGrowing, isPlausibleNaturalOffset, isPositionedAtPlayer } from '@/utils/layout-settle'
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
