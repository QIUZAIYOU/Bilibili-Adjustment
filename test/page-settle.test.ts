import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_SETTLE_FRAMES, isPageSettled, waitForPageSettled } from '@/utils/page-settle'
const base = {
    headerReady: true,
    documentComplete: true,
    stableFrames: PAGE_SETTLE_FRAMES
}
test('isPageSettled：头部就绪 + 文档 complete + 连续稳定帧数才算完成', () => {
    assert.equal(isPageSettled(base), true)
})
test('isPageSettled：帧数差一帧不算', () => {
    assert.equal(isPageSettled({ ...base, stableFrames: PAGE_SETTLE_FRAMES - 1 }), false)
})
test('isPageSettled：头部空白（水合前）一律不算完成，帧数再多也不行', () => {
    assert.equal(isPageSettled({ ...base, headerReady: false, stableFrames: 99 }), false)
})
test('isPageSettled：文档还在 loading 不算完成', () => {
    assert.equal(isPageSettled({ ...base, documentComplete: false }), false)
})
test('isPageSettled：可自定义所需帧数', () => {
    assert.equal(isPageSettled({ ...base, stableFrames: 0, requiredFrames: 0 }), true)
})
test('waitForPageSettled：非浏览器环境（无 window）直接视为就绪', async () => {
    assert.equal(await waitForPageSettled(() => false, 10), true)
})
