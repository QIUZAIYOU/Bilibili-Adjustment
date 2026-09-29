import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { elementSelectors } from '@/shared/element-selectors'
import { isScrollToTopEntry } from '@/utils/scroll-top-entry'
/**
 * 「会触发 B 站回到顶部」的入口判定回归（2026-09-25 扩展）
 *
 * 背景：点击播完后播放器上的推荐视频卡片（`.bpx-player-ending-related a.bpx-player-ending-related-item`）
 * 和点击选集一样，B 站自己的 `switchVideo` 会先 `window.scrollTo(0, 0)`，页面会可见地滑回顶部；
 * 因此它必须被同一套位置守卫覆盖（guardEpisodeSwitchClicks 用本函数判定）。
 */
/** 造一个 closest 只对指定选择器生效的假元素（模拟真实 DOM 的命中语义） */
const fakeElement = (matchSelector: string): Element => {
    const element = {
        closest: (selector: string) => (selector === matchSelector ? element : null),
        getAttribute: () => null,
        textContent: ''
    }
    return element as unknown as Element
}
test('播完推荐视频卡片算「回到顶部入口」', () => {
    const selector = elementSelectors.CSS('playerEndingRelatedLink')
    assert.equal(selector, '.bpx-player-ending-related a.bpx-player-ending-related-item', '选择器应指向播完后的推荐视频链接')
    assert.equal(isScrollToTopEntry(fakeElement(selector as string)), true)
})
test('原生选集入口同样算，无关元素不算', () => {
    const episodeSelector = elementSelectors.CSS('episodeSwitchEntry')
    assert.ok(episodeSelector, '选集入口选择器应存在')
    assert.equal(isScrollToTopEntry(fakeElement(episodeSelector as string)), true)
    assert.equal(isScrollToTopEntry(fakeElement('.some-unrelated-class')), false)
    assert.equal(isScrollToTopEntry(null), false)
})
