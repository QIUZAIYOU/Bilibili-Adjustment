import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHeaderOverlaying } from '@/utils/header-offset'
/**
 * 头部「是否压在内容上方」的判据（决定自动定位要不要扣掉头部高度）
 *
 * 背景（2026-09-21 实测）：
 * - 关闭「夜间哔哩」样式时 `.bili-header--fixed .bili-header__bar` 计算值为 `fixed`（各滚动位置 rect.top 恒为 0）→ 要扣 64px；
 * - 开启该样式时用户刻意加了 `position: relative !important`，导航栏随页面滚走（滚动 1500 时 rect.top = -1500）→ **不能扣**。
 * 因此口径收紧为「只认 fixed / sticky」。
 */
test('isHeaderOverlaying：只有 fixed / sticky 才算固定在视口上方', () => {
    assert.equal(isHeaderOverlaying('fixed'), true, '关闭夜间哔哩样式时的实际取值')
    assert.equal(isHeaderOverlaying('sticky'), true, 'sticky 同样钉在视口顶部')
    // 开启夜间哔哩样式时的实际取值：随文档流滚动，不能扣高度（上一版按「非 static」判成 true，导致多扣 64px）
    assert.equal(isHeaderOverlaying('relative'), false)
    assert.equal(isHeaderOverlaying('absolute'), false)
    assert.equal(isHeaderOverlaying('static'), false)
})
test('isHeaderOverlaying：含 fixed 字样也算；读不到样式时不算', () => {
    // 口径里明确保留的防御性子句：万一出现复合取值也能判为固定
    assert.equal(isHeaderOverlaying('fixed-sticky'), true)
    assert.equal(isHeaderOverlaying('FIXED'), true, '大小写不敏感')
    // 元素不存在 / 取不到样式：保持「没有头部就不扣高度」的原行为
    assert.equal(isHeaderOverlaying(undefined), false)
    assert.equal(isHeaderOverlaying(''), false)
})
