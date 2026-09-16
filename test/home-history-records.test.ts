import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    sortAndDedupeHistoryRecords,
    findDuplicateHistoryRecords,
    historyIdentity
} from '@/modules/home/history-records'
const raw = (key: string, value: Record<string, unknown> = {}) => ({ key, value })
// 真实链接形态：headless 抓到的首页推荐卡就是这种干净 form，其余变体是同一视频可能出现的差异
const BV = 'BV1TLYU6AEcW'
const VIDEO = `https://www.bilibili.com/video/${BV}`
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
test('历史记录：同一视频的链接形态不同也算同一条（tracking 参数/尾斜杠/分P）—— 用户反馈的重复项根因', () => {
    const list = [
        raw(`${BV}::100`, { title: '同名视频', url: VIDEO, order: 0, sessionTimestamp: 100 }),
        raw(`${BV}::200`, { title: '同名视频', url: `${VIDEO}?spm_id_from=333.1007.tianma.1-1-1.click`, order: 3, sessionTimestamp: 200 }),
        raw(`${BV}::300`, { title: '同名视频', url: `${VIDEO}/?vd_source=a1b2c3`, order: 1, sessionTimestamp: 300 }),
        raw(`${BV}::400`, { title: '同名视频', url: `${VIDEO}?p=2`, order: 2, sessionTimestamp: 400 })
    ]
    const result = sortAndDedupeHistoryRecords(list)
    assert.equal(result.length, 1)
    // 保留最新批次的那条（连同它自己的 url，点击仍能跳到当时那一 P）
    assert.equal(result[0]._sessionTimestamp, 400)
})
test('历史记录：bvid 链接与 av 链接混用时，key 前缀（API 返回的 bvid）优先', () => {
    // 一个是 bvid、一个是 av：数字 aid 与 bvid 属不同 id 空间，不猜测映射，各自保留
    const distinct = [
        raw('av113456789012::100', { title: '同名视频', url: 'https://www.bilibili.com/video/av113456789012', order: 0, sessionTimestamp: 100 }),
        raw(`${BV}::200`, { title: '同名视频', url: VIDEO, order: 0, sessionTimestamp: 200 })
    ]
    assert.equal(sortAndDedupeHistoryRecords(distinct).length, 2)
    // key 已带 bvid 时，即使 url 是 av 形态也能与 bvid 形态合并
    const mixed = [
        raw(`${BV}::100`, { title: '同名视频', url: 'https://www.bilibili.com/video/av113456789012', order: 0, sessionTimestamp: 100 }),
        raw(`${BV}::200`, { title: '同名视频', url: VIDEO, order: 0, sessionTimestamp: 200 })
    ]
    assert.equal(sortAndDedupeHistoryRecords(mixed).length, 1)
})
test('historyIdentity：bvid/aid/番剧/无 id 各形态归一', () => {
    assert.equal(historyIdentity({ _key: `${BV}::1`, url: VIDEO }), `video:${BV.toLowerCase()}`)
    assert.equal(historyIdentity({ url: `${VIDEO}?p=3&spm_id_from=x` }), `video:${BV.toLowerCase()}`)
    assert.equal(historyIdentity({ url: 'https://www.bilibili.com/video/av170001' }), 'aid:170001')
    assert.equal(historyIdentity({ url: 'https://www.bilibili.com/bangumi/play/ep123456?from=search' }), 'bangumi:ep123456')
    assert.equal(historyIdentity({ url: 'https://www.bilibili.com/bangumi/play/ss28747' }), 'bangumi:ss28747')
    assert.equal(historyIdentity({ url: 'https://www.bilibili.com/list/watchlater?bvid=BV1xx411c7mD&oid=1' }), 'video:bv1xx411c7md')
    // 无视频 id 的地址：忽略查询串与尾斜杠
    assert.equal(historyIdentity({ url: 'https://www.bilibili.com/read/cv12345/?from=feed' }), 'url:https://www.bilibili.com/read/cv12345')
    // url 缺失：退回存储 key 前缀
    assert.equal(historyIdentity({ _key: 'k1::999' }), 'key:k1')
})
test('findDuplicateHistoryRecords：返回待删的旧行，保留项与展示去重完全一致', () => {
    const list = [
        raw(`${BV}::300`, { title: '同名视频', url: `${VIDEO}?vd_source=x`, order: 0, sessionTimestamp: 300 }),
        raw(`${BV}::100`, { title: '同名视频', url: VIDEO, order: 1, sessionTimestamp: 100 }),
        raw('BV2xx411c7mD::100', { title: '另一条', url: 'https://www.bilibili.com/video/BV2xx411c7mD', sessionTimestamp: 100 })
    ]
    const duplicates = findDuplicateHistoryRecords(list)
    assert.equal(duplicates.length, 1)
    assert.equal(duplicates[0].key, `${BV}::100`)
    assert.equal(duplicates[0].identity, `video:${BV.toLowerCase()}`)
    assert.equal(duplicates[0].keptKey, `${BV}::300`)
    assert.equal(duplicates[0].keptSessionTimestamp, 300)
    // 无 key 的记录无法删除，必须被忽略（否则会往 batchRemove 里塞空键）
    assert.deepEqual(findDuplicateHistoryRecords([raw('', { url: VIDEO }), raw('', { url: VIDEO })]), [])
    assert.deepEqual(findDuplicateHistoryRecords(null), [])
    // 展示去重后的条数 = 原条数 - 待删条数（两处规则同源）
    assert.equal(sortAndDedupeHistoryRecords(list).length, list.length - duplicates.length)
})
