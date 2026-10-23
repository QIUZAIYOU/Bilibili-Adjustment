import { test } from 'node:test'
import assert from 'node:assert/strict'
/**
 * 页型缓存的回归点：`_currentPageType` 是模块级变量，写入后**没有失效入口**，
 * 于是 SPA 换页后页型仍停在「首次访问时的页型」，选择器的页型门控（PAGE_TYPE_EXCLUSIVE）
 * 会按旧页型放行/拦截 —— 在活动视频页按 home 页型取选择器就是这种表现。
 * 这里用极简 DOM 桩锁住「resetPageType 后页型重新判定、且页型门控随之放行」这条不变量。
 */
const registry = new Map()
const makeElement = id => ({
    id,
    isConnected: true,
    parentElement: null,
    matches: () => true
})
const installDomStub = () => {
    const dom = {
        createElement: () => ({ querySelector: () => null }),
        querySelector: selector => registry.get(selector) || null,
        querySelectorAll: () => [],
        body: { appendChild: () => {} }
    }
    Object.assign(globalThis, {
        document: dom,
        location: { host: '', pathname: '/', origin: '' },
        window: { location: { host: '', pathname: '/', origin: '' }, addEventListener: () => {} },
        MutationObserver: class {
            observe () {}
            disconnect () {}
        }
    })
}
installDomStub()
test('页型缓存：resetPageType 后按新页型重新放行选择器', async () => {
    const { elementSelectors } = await import('@/shared/element-selectors')
    const title = makeElement('viewbox-report')
    registry.set('#viewbox_report h1', title)
    try {
        // 首页：video 独占选择器被页型门控直接跳过
        assert.equal(await elementSelectors.wait('videoTitle', 50), null)
        // 换到视频页但**没有**重置页型缓存 → 仍按 home 页型判定，选择器继续被跳过
        globalThis.location.pathname = '/video/BV1xx411c7mD'
        assert.equal(await elementSelectors.wait('videoTitle', 50), null)
        // 重置页型缓存后 → 页型重新判定为 video，选择器正常命中
        elementSelectors.resetPageType()
        assert.equal(await elementSelectors.wait('videoTitle', 50), title)
    } finally {
        registry.clear()
        elementSelectors.resetPageType()
    }
})
