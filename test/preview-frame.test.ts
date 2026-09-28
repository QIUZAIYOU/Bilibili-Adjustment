import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_FRAME_ATTR, isPreviewFrameElement } from '@/utils/preview-frame'
/**
 * 「预览 iframe」标记判据（2026-09-25）
 *
 * 这个判据决定「视频模块的页面级自动化要不要在预览窗口里跳过」，判错就会让预览刚进的网页全屏被脚本
 * 自己切掉，故单独钉住。
 */
const fakeFrame = (attrs: string[] = []) => ({
    hasAttribute: (name: string) => attrs.includes(name)
})
test('带标记的元素判定为预览 iframe', () => {
    assert.equal(PREVIEW_FRAME_ATTR, 'data-adj-preview')
    assert.equal(isPreviewFrameElement(fakeFrame([PREVIEW_FRAME_ATTR])), true)
    assert.equal(isPreviewFrameElement(fakeFrame(['data-adj-preview', 'id'])), true)
})
test('没有标记/非法输入一律不算预览 iframe（跨源读不到 frameElement 时给的就是 null）', () => {
    assert.equal(isPreviewFrameElement(fakeFrame([])), false)
    assert.equal(isPreviewFrameElement(fakeFrame(['data-adj-something-else'])), false)
    assert.equal(isPreviewFrameElement(null), false)
    assert.equal(isPreviewFrameElement(undefined), false)
    assert.equal(isPreviewFrameElement({}), false)
    assert.equal(isPreviewFrameElement({ hasAttribute: 'not-a-function' }), false)
})
