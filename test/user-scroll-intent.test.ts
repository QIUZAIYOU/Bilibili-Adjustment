import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    isInsideProgrammaticScroll,
    isOwnUiInteraction,
    isScrollIntentKey,
    markProgrammaticScroll,
    noteUserIntent,
    lastUserIntentAt,
    clearUserIntent,
    resetUserScrollIntent,
    shouldIgnoreIntentEvent,
    shouldYieldNow,
    shouldYieldToUser,
    subscribeUserIntent,
    USER_INTENT_WINDOW_MS
} from '@/utils/user-scroll-intent'
/**
 * 用户滚动意图回归（2026-11-06「定位还在跟用户抢滚动」）
 *
 * 修复前的问题是「只看目标到没到，不问用户在不在滚」：页面刚加载、用户往评论区滚，
 * 定位重试/补定位/位置守卫会连续把页面拽回播放器，且一行日志都不打。
 * 这里锁住三件事：窗口边界、哪些事件算意图、让位状态机。
 */
test('shouldYieldToUser：窗口内让位，窗口外放开', () => {
    assert.equal(shouldYieldToUser(1000, 500), true)
    assert.equal(shouldYieldToUser(500 + USER_INTENT_WINDOW_MS - 1, 500), true)
    assert.equal(shouldYieldToUser(500 + USER_INTENT_WINDOW_MS, 500), false)
    assert.equal(shouldYieldToUser(5000, 500), false)
})
test('shouldYieldToUser：没有意图记录 / 非法输入一律不拦截', () => {
    assert.equal(shouldYieldToUser(1000, 0), false)
    assert.equal(shouldYieldToUser(1000, -1), false)
    // 时钟回拨（记的时间戳在未来）：不冒进
    assert.equal(shouldYieldToUser(1000, 1200), false)
    assert.equal(shouldYieldToUser(Number.NaN, 500), false)
    assert.equal(shouldYieldToUser(1000, 500, 0), false)
})
test('isOwnUiInteraction：脚本自己的界面不算用户想滚页面', () => {
    const ownUi = { closest: () => ({}) }
    const pageUi = { closest: () => null }
    assert.equal(isOwnUiInteraction(ownUi), true)
    assert.equal(isOwnUiInteraction(pageUi), false)
    assert.equal(isOwnUiInteraction(null), false)
    assert.equal(isOwnUiInteraction({}), false)
    // closest 抛错（target 是文本节点等）：按「不是自己界面」处理
    assert.equal(isOwnUiInteraction({ closest: () => { throw new Error('boom') } }), false)
})
test('shouldIgnoreIntentEvent：点侧栏、在输入框敲空格都不算意图', () => {
    const ownUi = { tagName: 'DIV', closest: () => ({}) }
    assert.equal(shouldIgnoreIntentEvent('pointer', ownUi), true)
    // 滚轮在侧栏上仍然是滚轮
    assert.equal(shouldIgnoreIntentEvent('wheel', ownUi), false)
    assert.equal(shouldIgnoreIntentEvent('key', { tagName: 'INPUT' }), true)
    assert.equal(shouldIgnoreIntentEvent('key', { tagName: 'TEXTAREA' }), true)
    assert.equal(shouldIgnoreIntentEvent('key', { tagName: 'DIV', isContentEditable: true }), true)
    assert.equal(shouldIgnoreIntentEvent('key', { tagName: 'DIV' }), false)
    assert.equal(shouldIgnoreIntentEvent('pointer', { tagName: 'DIV', closest: () => null }), false)
})
test('isScrollIntentKey：只认会让页面滚动的键', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']) {
        assert.equal(isScrollIntentKey(key), true, key)
    }
    for (const key of ['a', 'Enter', 'Escape', 'Shift']) {
        assert.equal(isScrollIntentKey(key), false, key)
    }
})
test('意图状态机：记录 → 让位 → 显式定位清空', () => {
    resetUserScrollIntent()
    assert.equal(shouldYieldNow(), false)
    noteUserIntent()
    assert.ok(lastUserIntentAt() > 0)
    assert.equal(shouldYieldNow(), true)
    clearUserIntent()
    assert.equal(shouldYieldNow(), false)
    assert.equal(lastUserIntentAt(), 0)
    resetUserScrollIntent()
})
test('意图订阅：滚动动画靠它立刻停手，取消订阅后不再回调', () => {
    resetUserScrollIntent()
    let calls = 0
    const unsubscribe = subscribeUserIntent(() => {
        calls++
    })
    noteUserIntent()
    assert.equal(calls, 1)
    unsubscribe()
    noteUserIntent()
    assert.equal(calls, 1)
    resetUserScrollIntent()
})
test('markProgrammaticScroll：自己写的滚动窗口不认成用户操作', async () => {
    resetUserScrollIntent()
    assert.equal(isInsideProgrammaticScroll(), false)
    markProgrammaticScroll(30)
    assert.equal(isInsideProgrammaticScroll(), true)
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(isInsideProgrammaticScroll(), false)
    // 负数/0 立即过期，不能卡住后面的判定
    markProgrammaticScroll(-100)
    assert.equal(isInsideProgrammaticScroll(), false)
    resetUserScrollIntent()
})
