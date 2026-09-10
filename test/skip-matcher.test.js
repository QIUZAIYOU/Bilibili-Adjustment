import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSkipMatcher, SKIP_EPSILON } from '@/modules/video/skip-manager/pure'
// ============ 小数起点边界（P0-2 核心回归） ============
test('匹配器：小数起点在段内命中并跳到 end', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(12.4)?.skipTo, 18.7)
})
test('匹配器：容差内（12.1，距 start 0.2s）命中', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(12.1)?.skipTo, 18.7)
})
test('匹配器：容差外（12.0，距 start 0.3s > epsilon）不命中', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(12.0), null)
})
test('匹配器：容差外（11.9）不命中', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(11.9), null)
})
test('匹配器：段内任意时刻（17.9）命中', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(17.9)?.skipTo, 18.7)
})
test('匹配器：段结束后（19.0）不命中', () => {
    const matcher = createSkipMatcher([{ start: 12.3, end: 18.7 }])
    assert.equal(matcher.match(19.0), null)
})
// ============ 单调状态：同一片段不重复跳 ============
test('匹配器：同一片段连续命中只跳一次', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }])
    assert.ok(matcher.match(10.1))
    assert.equal(matcher.match(10.2), null)
    assert.equal(matcher.match(11), null)
})
test('匹配器：多片段按时间轴顺序各自跳一次', () => {
    const matcher = createSkipMatcher([{ start: 5, end: 8 }, { start: 30, end: 35 }])
    assert.equal(matcher.match(5.1)?.skipTo, 8)
    assert.equal(matcher.match(8.5), null)
    assert.equal(matcher.match(30.2)?.skipTo, 35)
})
// ============ 回跳重置：拖回广告前允许重新触发 ============
test('匹配器：拖回已跳片段之前可重新触发', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }])
    assert.ok(matcher.match(10.1))
    // 拖回段外（< end - 1）→ 重置
    assert.equal(matcher.match(2), null)
    assert.equal(matcher.match(10.1)?.skipTo, 20)
})
test('匹配器：仅在段内小幅回退（不触发重置）时不重复跳，避免死循环', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }])
    assert.ok(matcher.match(10.1))
    assert.equal(matcher.match(19.5), null)
})
test('匹配器：seek 回退到另一个更早的片段可触发该片段', () => {
    const matcher = createSkipMatcher([{ start: 5, end: 8 }, { start: 30, end: 35 }])
    assert.equal(matcher.match(30.2)?.skipTo, 35)
    assert.equal(matcher.match(5.1)?.skipTo, 8)
})
// ============ 结束判定 ============
test('匹配器：越过最后片段 end 判定为结束', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }, { start: 30, end: 35 }])
    assert.equal(matcher.isFinishedAt(34.9), false)
    assert.equal(matcher.isFinishedAt(35.1), true)
    assert.equal(matcher.lastEnd, 35)
})
test('匹配器：空片段集合不命中且不判结束', () => {
    const matcher = createSkipMatcher([])
    assert.equal(matcher.match(10), null)
    assert.equal(matcher.isFinishedAt(100), false)
})
test('匹配器：输入片段先合并重叠再匹配', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }, { start: 15, end: 25 }])
    assert.deepEqual(matcher.sortedSegments, [{ start: 10, end: 25 }])
    assert.equal(matcher.match(10.1)?.skipTo, 25)
})
test('匹配器：可自定义容差', () => {
    const matcher = createSkipMatcher([{ start: 10, end: 20 }], { epsilon: 0 })
    assert.equal(matcher.match(9.9), null)
    assert.equal(matcher.match(10)?.skipTo, 20)
})
test('SKIP_EPSILON 常量与文档一致', () => {
    assert.equal(SKIP_EPSILON, 0.25)
})
