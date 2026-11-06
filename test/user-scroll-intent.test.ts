import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    beginPointerDown,
    endPointerDown,
    isInsideProgrammaticScroll,
    isOwnUiInteraction,
    isPointerDown,
    isScrollIntentKey,
    lastUserIntentKind,
    markProgrammaticScroll,
    noteUserIntent,
    lastUserIntentAt,
    clearUserIntent,
    resetUserScrollIntent,
    shouldIgnoreIntentEvent,
    shouldNoteScrollIntent,
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
/**
 * 单击 ≠ 滚动意图（2026-11-06 「点击播放器定位失效」回归）
 *
 * 点击画面的顺序是 pointerdown → click。旧实现把 pointerdown 直接记成滚动意图，
 * 于是 click 里的定位一查 `shouldYieldNow()` 就为 true、当场 return —— 功能整体失效。
 * 现在 pointerdown 只记「按下中」，真正算意图的是「按下期间发生的 scroll」（拖滚动条）。
 */
test('pointerdown 本身不算滚动意图，单击不会让自动定位短路', () => {
    resetUserScrollIntent()
    beginPointerDown({ tagName: 'DIV', closest: () => null })
    assert.equal(isPointerDown(), true)
    assert.equal(shouldYieldNow(), false)
    assert.equal(lastUserIntentAt(), 0)
    // 单击结束（pointerup）：状态清掉，仍然没有意图
    endPointerDown()
    assert.equal(isPointerDown(), false)
    assert.equal(shouldYieldNow(), false)
    resetUserScrollIntent()
})
test('按住拖动产生的 scroll 才算意图；抬起后的 scroll 不算', () => {
    resetUserScrollIntent()
    // 按下 + 滚动 → 拖动
    beginPointerDown({ tagName: 'DIV', closest: () => null })
    assert.equal(shouldNoteScrollIntent(), true)
    noteUserIntent('drag')
    assert.equal(shouldYieldNow(), true)
    assert.equal(lastUserIntentKind(), 'drag')
    // 抬起后页面自己滚（如 B 站 switchVideo 的 scrollTo(0,0)）不再算意图
    clearUserIntent()
    endPointerDown()
    assert.equal(shouldNoteScrollIntent(), false)
    assert.equal(shouldYieldNow(), false)
    resetUserScrollIntent()
})
test('自己界面上的 pointerdown 不进入按下状态', () => {
    resetUserScrollIntent()
    beginPointerDown({ tagName: 'DIV', closest: () => ({}) })
    assert.equal(isPointerDown(), false)
    assert.equal(shouldNoteScrollIntent(), false)
    resetUserScrollIntent()
})
test('我们自己写滚动的窗口内，拖动产生的 scroll 不记意图', () => {
    resetUserScrollIntent()
    beginPointerDown({ tagName: 'DIV', closest: () => null })
    markProgrammaticScroll(30)
    assert.equal(shouldNoteScrollIntent(), false)
    markProgrammaticScroll(-1)
    assert.equal(shouldNoteScrollIntent(), true)
    endPointerDown()
    resetUserScrollIntent()
})
test('reset 会连同按下状态与意图类型一起清掉', () => {
    beginPointerDown({ tagName: 'DIV', closest: () => null })
    noteUserIntent('wheel')
    resetUserScrollIntent()
    assert.equal(isPointerDown(), false)
    assert.equal(lastUserIntentKind(), '')
    assert.equal(lastUserIntentAt(), 0)
})
