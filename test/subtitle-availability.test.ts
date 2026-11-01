import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SubtitleAvailabilityCache } from '../src/shared/subtitle-availability'
test('resolve 命中缓存后不再调 probe', async () => {
    let calls = 0
    const cache = new SubtitleAvailabilityCache(async () => {
        calls += 1
        return true
    })
    assert.equal(await cache.resolve('BV1xx411c7mD'), true)
    assert.equal(await cache.resolve('BV1xx411c7mD'), true)
    assert.equal(calls, 1)
})
test('并发调用共享同一个 Promise（只发一次请求）', async () => {
    let calls = 0
    let release: ((value: boolean) => void) | null = null
    const cache = new SubtitleAvailabilityCache(async () => {
        calls += 1
        return await new Promise<boolean>(resolve => { release = resolve })
    })
    const first = cache.resolve('BV1xx411c7mD')
    const second = cache.resolve('BV1xx411c7mD')
    assert.equal(calls, 1)
    release?.(true)
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(calls, 1)
})
test('「没有字幕」也是有效答案，会被缓存', async () => {
    let calls = 0
    const cache = new SubtitleAvailabilityCache(async () => {
        calls += 1
        return false
    })
    assert.equal(await cache.resolve('BV1xx411c7mD'), false)
    assert.equal(await cache.resolve('BV1xx411c7mD'), false)
    assert.equal(calls, 1)
    assert.equal(cache.peek('BV1xx411c7mD'), false)
})
test('probe 抛错不落缓存，下次仍会重试', async () => {
    let calls = 0
    const cache = new SubtitleAvailabilityCache(async () => {
        calls += 1
        if (calls === 1) throw new Error('network')
        return true
    })
    await assert.rejects(() => cache.resolve('BV1xx411c7mD'))
    assert.equal(cache.peek('BV1xx411c7mD'), undefined)
    assert.equal(await cache.resolve('BV1xx411c7mD'), true)
    assert.equal(calls, 2)
})
test('forget 可清单条或全部', async () => {
    let calls = 0
    const cache = new SubtitleAvailabilityCache(async (bvid: string) => {
        calls += 1
        return bvid !== 'BV1no411c7mD'
    })
    await cache.resolve('BV1xx411c7mD')
    await cache.resolve('BV1no411c7mD')
    assert.equal(calls, 2)
    cache.forget('BV1xx411c7mD')
    await cache.resolve('BV1xx411c7mD')
    assert.equal(calls, 3)
    cache.forget()
    assert.equal(cache.peek('BV1no411c7mD'), undefined)
})
