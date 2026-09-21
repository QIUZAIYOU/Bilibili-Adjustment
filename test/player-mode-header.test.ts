import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHeaderOverlaying } from '@/utils/header-offset'
/**
 * 头部「是否压在内容上方」的判据（决定自动定位要不要扣掉头部高度）
 *
 * 背景（2026-09-21）：B 站改版后 `.bili-header__bar` 是 position: fixed 的吸顶条，
 * 而容器 `.bili-header.bili-header--mini` 只是态类、position 为 relative 且会随页面滚走。
 * 口径按「position 非 static 或含 fixed 字样」都算占据视口顶部。
 */
test('isHeaderOverlaying：非 static 一律视为压在内容上方', () => {
    // 真实会出现的取值
    assert.equal(isHeaderOverlaying('fixed'), true)
    assert.equal(isHeaderOverlaying('sticky'), true)
    assert.equal(isHeaderOverlaying('relative'), true)
    assert.equal(isHeaderOverlaying('absolute'), true)
    // static 不占据视口顶部（页面顶部未滚动时的头部就是 static）
    assert.equal(isHeaderOverlaying('static'), false)
})
test('isHeaderOverlaying：含 fixed 字样也算（口径要求），读不到样式时不算', () => {
    // `includes('fixed')` 是口径里明确要求保留的防御性子句：真实计算样式里它已被「非 static」覆盖，
    // 但万一将来出现 static + fixed 组合（或自定义取值）也能判为固定，故这里锁住语义。
    assert.equal(isHeaderOverlaying('fixed'), true)
    assert.equal(isHeaderOverlaying('fixed-sticky'), true, '含 fixed 字样 → 视为固定')
    // 元素不存在 / 取不到样式：保持「没有头部就不扣高度」的原行为
    assert.equal(isHeaderOverlaying(undefined), false)
    assert.equal(isHeaderOverlaying(''), false)
})
