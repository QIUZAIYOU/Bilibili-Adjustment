import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeSegments } from '@/modules/video/skip-manager/pure'
// ============ 报告 §4.6：AI 结果经校验后再缓存/上传 ============
test('sanitizeSegments：丢弃非对象与缺字段项', () => {
    const result = sanitizeSegments([null, undefined, {}, { start: 1 }, { end: 5 }, 42, 'x'])
    assert.deepEqual(result, [])
})
test('sanitizeSegments：丢弃 end <= start 的非法项', () => {
    const result = sanitizeSegments([{ start: 10, end: 10 }, { start: 20, end: 15 }])
    assert.deepEqual(result, [])
})
test('sanitizeSegments：字符串数值被转换为数字', () => {
    const result = sanitizeSegments([{ start: '12.3', end: '18.7' }])
    assert.deepEqual(result, [{ start: 12.3, end: 18.7 }])
})
test('sanitizeSegments：NaN / Infinity 被丢弃', () => {
    const result = sanitizeSegments([{ start: 'abc', end: 10 }, { start: 1, end: Infinity }])
    assert.deepEqual(result, [])
})
test('sanitizeSegments：重叠片段合并、保留附加字段', () => {
    const result = sanitizeSegments([
        { start: 10, end: 20, summary: '片头' },
        { start: 15, end: 30, summary: '广告' }
    ])
    assert.equal(result.length, 1)
    assert.equal(result[0].start, 10)
    assert.equal(result[0].end, 30)
})
test('sanitizeSegments：乱序输入按 start 排序', () => {
    const result = sanitizeSegments([{ start: 30, end: 40 }, { start: 5, end: 10 }])
    assert.deepEqual(result.map(seg => seg.start), [5, 30])
})
test('sanitizeSegments：非数组输入返回空数组', () => {
    assert.deepEqual(sanitizeSegments(null), [])
    assert.deepEqual(sanitizeSegments('nope'), [])
})
