import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortAndDedupeHistoryRecords } from '@/modules/home/history-records'
const raw = (key, value) => ({ key, value })
test('历史记录：先按批次时间倒序，批次内按页面顺序升序', () => {
    const list = [
        raw('c::2', { title: 'C', url: 'https://www.bilibili.com/video/BV3', order: 1, sessionTimestamp: 2 }),
        raw('a::2', { title: 'A', url: 'https://www.bilibili.com/video/BV1', order: 0, sessionTimestamp: 2 }),
        raw('b::1', { title: 'B', url: 'https://www.bilibili.com/video/BV2', order: 0, sessionTimestamp: 1 })
    ]
    assert.deepEqual(sortAndDedupeHistoryRecords(list).map(i => i.title), ['A', 'C', 'B'])
})
test('历史记录：同一视频只保留最新批次的一条（去重）', () => {
    const list = [
        raw('BV1::10', { title: '旧标题', url: 'https://www.bilibili.com/video/BV1', order: 0, sessionTimestamp: 10 }),
        raw('BV2::10', { title: '视频2', url: 'https://www.bilibili.com/video/BV2', order: 1, sessionTimestamp: 10 }),
        raw('BV1::20', { title: '新标题', url: 'https://www.bilibili.com/video/BV1', order: 2, sessionTimestamp: 20 })
    ]
    const result = sortAndDedupeHistoryRecords(list)
    assert.equal(result.length, 2)
    // 最新批次（sessionTimestamp 最大）的那条被保留
    assert.equal(result[0].title, '新标题')
})
test('历史记录：url 缺失时按 key 去重，缺字段不抛错', () => {
    const result = sortAndDedupeHistoryRecords([
        raw('k1', { title: '无 url' }),
        raw('k1', { title: '无 url 重复', sessionTimestamp: 5 }),
        raw('k2', {})
    ])
    assert.equal(result.length, 2)
    assert.deepEqual(sortAndDedupeHistoryRecords(null), [])
    assert.deepEqual(sortAndDedupeHistoryRecords(undefined), [])
})
