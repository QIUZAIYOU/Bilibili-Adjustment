import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCache, commitCache, detectSubtitles, loadEpisodesCache, commitBatch } from '@/modules/video/skip-manager/skip-manager-service'
const mem = map => ({
    adCacheGet: async id => (map.has(id) ? map.get(id) : null),
    adCacheSet: async (id, entry) => map.set(id, entry)
})
const okJson = body => ({ ok: true, json: async () => body })
const env = (over = {}) => ({
    storage: mem(new Map()),
    fetchImpl: async () => okJson({ ok: false }),
    apiUrl: 'https://api.test/skip',
    uidProvider: () => 7,
    log: { info: () => {}, debug: () => {}, error: () => {} },
    ...over
})
test('loadCache：本地命中不回退远程', async () => {
    const map = new Map([['BV1', { segments: [{ start: 1, end: 5 }], version: 3 }]])
    let remoteCalled = 0
    const e = env({ storage: mem(map), fetchImpl: async () => { remoteCalled++; return okJson({ ok: false }) } })
    const r = await loadCache(e, 'BV1')
    assert.equal(r.fromRemote, false)
    assert.deepEqual(r.segments, [{ start: 1, end: 5 }])
    assert.equal(remoteCalled, 0)
})
test('loadCache：本地缺失回退远程并写本地', async () => {
    const map = new Map()
    const e = env({
        storage: mem(map),
        fetchImpl: async () => okJson({ ok: true, data: { segments: [{ start: 2, end: 8 }], version: 1 }})
    })
    const r = await loadCache(e, 'BV2')
    assert.equal(r.fromRemote, true)
    assert.equal(map.has('BV2'), true)
    assert.deepEqual(r.segments, [{ start: 2, end: 8 }])
})
test('loadCache：无缓存返回空', async () => {
    const r = await loadCache(env(), 'BV3')
    assert.equal(r.cached, null)
    assert.deepEqual(r.segments, [])
})
test('commitCache：版本递增、保留锁定、写本地与远程', async () => {
    const map = new Map()
    let posted = null
    const e = env({
        storage: mem(map),
        fetchImpl: async (url, opt) => { posted = { url, body: JSON.parse(opt.body) }; return { ok: true } }
    })
    const prev = { segments: [{ start: 1, end: 2 }], version: 2, locked: true, verified_by: [1]}
    const r = await commitCache(e, 'BV4', prev, [{ start: 5, end: 6 }])
    assert.equal(r.cached.version, 3)
    assert.equal(r.cached.locked, true)
    assert.deepEqual(r.cached.segments, [{ start: 5, end: 6 }])
    assert.deepEqual(r.cached.verified_by, [1, 7])
    assert.equal(map.get('BV4').version, 3)
    assert.equal(posted.url, 'https://api.test/skip')
    assert.deepEqual(posted.body.segments, [{ start: 5, end: 6 }])
})
test('commitCache：无前缓存版本为 1', async () => {
    const r = await commitCache(env(), 'BV5', null, [])
    assert.equal(r.cached.version, 1)
    assert.deepEqual(r.cached.segments, [])
})
test('detectSubtitles：无字幕返回 false', async () => {
    const e = env({
        biliApis: {
            getVideoInformation: async () => ({ cid: 1 }),
            getVideoSubtitles: async () => []
        }
    })
    assert.equal(await detectSubtitles(e, 'BV6'), false)
})
test('detectSubtitles：有字幕返回 true', async () => {
    const e = env({
        biliApis: {
            getVideoInformation: async () => ({ cid: 1 }),
            getVideoSubtitles: async () => [{ lan: 'ai-zh' }]
        }
    })
    assert.equal(await detectSubtitles(e, 'BV6'), true)
})
test('loadEpisodesCache：并行读取并按 id 返回', async () => {
    const map = new Map([['E1', { segments: [{ start: 1, end: 2 }]}]])
    const r = await loadEpisodesCache(env({ storage: mem(map) }), ['E1', 'E2'])
    assert.equal(r.get('E1').segments.length, 1)
    assert.equal(r.get('E2'), null)
})
test('commitBatch：追加模式合并已有与新增', async () => {
    const map = new Map([['E1', { segments: [{ start: 1, end: 5 }], version: 1 }]])
    const n = await commitBatch(env({ storage: mem(map) }), [
        { episodeId: 'E1', cached: map.get('E1'), addSegments: [{ start: 9, end: 12 }]}
    ])
    assert.equal(n, 1)
    assert.deepEqual(map.get('E1').segments.map(s => s.start), [1, 9])
})
test('commitBatch：replace 模式整体替换（清空传空数组）', async () => {
    const map = new Map([['E1', { segments: [{ start: 1, end: 5 }], version: 1 }]])
    await commitBatch(env({ storage: mem(map) }), [
        { episodeId: 'E1', cached: map.get('E1'), replaceSegments: []}
    ])
    assert.deepEqual(map.get('E1').segments, [])
})
test('commitBatch：追加模式且双方均无数据时跳过', async () => {
    const map = new Map()
    const n = await commitBatch(env({ storage: mem(map) }), [
        { episodeId: 'E9', cached: null, addSegments: []}
    ])
    assert.equal(n, 0)
    assert.equal(map.has('E9'), false)
})
