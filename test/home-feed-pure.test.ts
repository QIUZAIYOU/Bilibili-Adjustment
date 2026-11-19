import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import {
    clampMaxPages,
    dedupeFeedItems,
    filterBlockedItems,
    formatCount,
    formatDuration,
    groupByCategory,
    isRiskControlCode,
    normalizeFeedItems,
    parseBlockedUids,
    toHttps
} from '../src/modules/home/feed/pure'
const rawItem = (overrides = {}) => ({
    goto: 'av',
    bvid: 'BV1xx411c7mD',
    id: 1001,
    cid: 2002,
    title: '测试视频',
    pic: 'http://i0.hdslb.com/cover.jpg',
    duration: 125,
    pubdate: 1700000000,
    owner: { mid: 12345, name: 'UP主', face: 'http://i0.hdslb.com/face.jpg' },
    stat: { view: 123456, danmaku: 10, like: 20 },
    tid: 21,
    rcmd_reason: '因为你喜欢',
    ...overrides
})
test('normalizeFeedItems：只留 goto=av、bvid 合法且有标题的条目', () => {
    const items = normalizeFeedItems([
        rawItem(),
        rawItem({ goto: 'live' }),
        rawItem({ bvid: 'bad-id' }),
        rawItem({ title: '' }),
        rawItem({ bvid: 'BV1yy411c7mD', title: '第二条' })
    ])
    assert.equal(items.length, 2)
    assert.equal(items[0].owner.mid, '12345')
    assert.equal(items[0].pic, 'https://i0.hdslb.com/cover.jpg')
    assert.equal(items[1].title, '第二条')
})
test('normalizeFeedItems：非数组与脏字段不抛错', () => {
    assert.deepEqual(normalizeFeedItems(null), [])
    const [item] = normalizeFeedItems([rawItem({ stat: null, owner: null, duration: 'abc' })])
    assert.equal(item.stat.view, 0)
    assert.equal(item.owner.mid, '')
    assert.equal(item.owner.name, '未知 UP')
    assert.equal(item.duration, 0)
})
test('parseBlockedUids：逗号/空白/中文逗号都吃，只留数字并去重', () => {
    assert.deepEqual(parseBlockedUids('123, 456，789 123 abc -1'), ['123', '456', '789'])
    assert.deepEqual(parseBlockedUids(''), [])
    assert.deepEqual(parseBlockedUids(undefined), [])
    assert.equal(parseBlockedUids(Array.from({ length: 600 }, (_, i) => String(i + 1)).join(',')).length, 500)
})
test('filterBlockedItems + dedupeFeedItems：屏蔽与去重', () => {
    const items = normalizeFeedItems([rawItem(), rawItem({ bvid: 'BV1yy411c7mD', owner: { mid: 999, name: '别人' } })])
    assert.equal(filterBlockedItems(items, new Set(['12345'])).length, 1)
    const seen = new Set<string>()
    assert.equal(dedupeFeedItems(seen, items).length, 2)
    assert.equal(dedupeFeedItems(seen, items).length, 0)
})
test('groupByCategory：条数降序、每道至少 3 条、其余归 rest', () => {
    const make = (category: string, count: number, prefix: string) => Array.from({ length: count }, (_, i) => ({
        ...rawItem({ bvid: `BV1${prefix}${String(i).padStart(9, '0')}` }), category
    }))
    const items = [...make('游戏', 5, 'a'), ...make('知识', 3, 'b'), ...make('鬼畜', 2, 'c'), ...make('音乐', 2, 'd')]
    const { rails, rest } = groupByCategory(items, 8, 3)
    assert.deepEqual(rails.map(rail => rail.name), ['游戏', '知识'])
    assert.equal(rest.length, 4)
})
test('groupByCategory：分区很散时至少凑出 2 条泳道', () => {
    const items = ['游戏', '知识', '鬼畜', '音乐', '生活'].map((category, i) => ({
        ...rawItem({ bvid: `BV1z${String(i).padStart(9, '0')}` }), category
    }))
    const { rails } = groupByCategory(items)
    assert.ok(rails.length >= 2, `rails=${rails.length}`)
    assert.equal(rails.flatMap(rail => rail.items).length + groupByCategory(items).rest.length, items.length)
})
test('clampMaxPages / isRiskControlCode / 格式化', () => {
    assert.equal(clampMaxPages('8'), 8)
    assert.equal(clampMaxPages(1), 2)
    assert.equal(clampMaxPages(99), 20)
    assert.equal(clampMaxPages('abc'), 8)
    assert.equal(isRiskControlCode(-352), true)
    assert.equal(isRiskControlCode(-412), true)
    assert.equal(isRiskControlCode(0), false)
    assert.equal(toHttps('http://x.com/a'), 'https://x.com/a')
    assert.equal(toHttps('https://x.com/a'), 'https://x.com/a')
    assert.equal(formatCount(12345), '1.2万')
    assert.equal(formatCount(0), '0')
    assert.equal(formatDuration(125), '2:05')
    assert.equal(formatDuration(3725), '1:02:05')
})
