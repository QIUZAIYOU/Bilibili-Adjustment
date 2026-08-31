import test from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { progressMemoryFeatures } from '../src/modules/video/progress-memory.js'
const makeVideo = overrides => ({
    readyState: 1,
    currentTime: 0,
    duration: 300,
    ...overrides
})
const makeCtx = (options = {}) => {
    let store = options.store || {}
    return {
        userConfigs: { playback_memory: true, ...(options.userConfigs || {}) },
        _getPlaybackStore: () => store,
        _setPlaybackStore: next => { store = next }
    }
}
test('_getPlaybackKey 生成规范播放 key', () => {
    window.location.href = 'https://www.bilibili.com/video/BV1xx411c7mD?p=2'
    assert.equal(progressMemoryFeatures._getPlaybackKey(), '/video/BV1xx411c7mD?p=2')
    // 尾部斜杠归一化（B站 replaceState 会在两种形态间切换）
    window.location.href = 'https://www.bilibili.com/video/BV1xx411c7mD/?p=2'
    assert.equal(progressMemoryFeatures._getPlaybackKey(), '/video/BV1xx411c7mD?p=2')
    // 无分P参数默认 p=1
    window.location.href = 'https://www.bilibili.com/video/BV1xx411c7mD'
    assert.equal(progressMemoryFeatures._getPlaybackKey(), '/video/BV1xx411c7mD?p=1')
    // 番剧页
    window.location.href = 'https://www.bilibili.com/bangumi/play/ep123456'
    assert.equal(progressMemoryFeatures._getPlaybackKey(), '/bangumi/play/ep123456?p=1')
})
test('_writePlaybackPosition 写入播放位置', () => {
    const ctx = makeCtx()
    const video = makeVideo({ currentTime: 120.6 })
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video, key: '/v?p=1' }, '/v?p=1')
    const record = ctx._getPlaybackStore()['/v?p=1']
    assert.ok(record)
    assert.equal(record.position, 120)
    assert.ok(Number.isFinite(record.timestamp))
})
test('_writePlaybackPosition 不写入非当前 key 的条目', () => {
    const ctx = makeCtx()
    const video = makeVideo({ currentTime: 60 })
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video, key: '/old?p=1' }, '/new?p=1')
    assert.deepEqual(ctx._getPlaybackStore(), {})
})
test('_writePlaybackPosition 观看完毕清除记录', () => {
    const ctx = makeCtx({ store: { '/v?p=1': { position: 100, timestamp: Date.now() }}})
    const video = makeVideo({ currentTime: 298 })
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video, key: '/v?p=1' }, '/v?p=1')
    assert.deepEqual(ctx._getPlaybackStore(), {})
})
test('_writePlaybackPosition 忽略未就绪或过短的进度', () => {
    const ctx = makeCtx()
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video: makeVideo({ readyState: 0, currentTime: 100 }), key: '/v?p=1' }, '/v?p=1')
    assert.deepEqual(ctx._getPlaybackStore(), {})
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video: makeVideo({ currentTime: 0.5 }), key: '/v?p=1' }, '/v?p=1')
    assert.deepEqual(ctx._getPlaybackStore(), {})
})
test('_writePlaybackPosition LRU 超限时淘汰最旧记录', () => {
    const store = {}
    // 预置记录时间戳需明显早于新写入（同一毫秒内时间戳并列会干扰排序判定）
    const now = Date.now() - 1000
    for (let i = 0; i < 50; i++) {
        store[`/k${i}?p=1`] = { position: 10, timestamp: now + i }
    }
    const ctx = makeCtx({ store })
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video: makeVideo({ currentTime: 10 }), key: '/new?p=1' }, '/new?p=1')
    const result = ctx._getPlaybackStore()
    assert.equal(Object.keys(result).length, 50)
    assert.equal(result['/k0?p=1'], undefined)
    assert.ok(result['/new?p=1'])
})
test('_writePlaybackPosition 关闭记忆功能时不写入', () => {
    const ctx = makeCtx({ userConfigs: { playback_memory: false }})
    progressMemoryFeatures._writePlaybackPosition.call(ctx, { video: makeVideo({ currentTime: 60 }), key: '/v?p=1' }, '/v?p=1')
    assert.deepEqual(ctx._getPlaybackStore(), {})
})
test('restorePlaybackPosition 跳过无效记录', async () => {
    // 用户已交互过播放器
    const ctx1 = { ...makeCtx(), _playbackKey: '/v?p=1', _playbackRestoredKey: null, _playbackUserInteracted: true }
    const video1 = makeVideo({ currentTime: 0 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx1, video1)
    assert.equal(video1.currentTime, 0)
    // 官方进度记忆已生效（currentTime > 2）
    const ctx2 = { ...makeCtx(), _playbackKey: '/v?p=1', _playbackRestoredKey: null, _playbackUserInteracted: false }
    const video2 = makeVideo({ currentTime: 10 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx2, video2)
    assert.equal(video2.currentTime, 10)
    // 记录位置过短（<5s）
    const ctx3 = { ...makeCtx({ store: { '/v?p=1': { position: 3, timestamp: Date.now() }}}), _playbackKey: '/v?p=1', _playbackRestoredKey: null, _playbackUserInteracted: false }
    const video3 = makeVideo({ currentTime: 0 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx3, video3)
    assert.equal(video3.currentTime, 0)
    // 记录过期（超过 7 天）
    const ctx4 = { ...makeCtx({ store: { '/v?p=1': { position: 60, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 }}}), _playbackKey: '/v?p=1', _playbackRestoredKey: null, _playbackUserInteracted: false }
    const video4 = makeVideo({ currentTime: 0 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx4, video4)
    assert.equal(video4.currentTime, 0)
    // 同 key 已恢复过但进度被外部覆盖（官方恢复把进度拉回浅位置）：重新恢复
    const ctx5 = { ...makeCtx({ store: { '/v?p=1': { position: 60, timestamp: Date.now() }}}), _playbackKey: '/v?p=1', _playbackRestoredKey: '/v?p=1', _playbackUserInteracted: false }
    const video5 = makeVideo({ currentTime: 0 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx5, video5)
    assert.equal(video5.currentTime, 60)
    // 同 key 已恢复过且进度未被覆盖：跳过重复恢复
    const ctx6 = { ...makeCtx({ store: { '/v?p=1': { position: 60, timestamp: Date.now() }}}), _playbackKey: '/v?p=1', _playbackRestoredKey: '/v?p=1', _playbackUserInteracted: false }
    const video6 = makeVideo({ currentTime: 58 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx6, video6)
    assert.equal(video6.currentTime, 58)
})
test('restorePlaybackPosition 恢复有效记录', async () => {
    const ctx = { ...makeCtx({ store: { '/v?p=1': { position: 65, timestamp: Date.now() }}}), _playbackKey: '/v?p=1', _playbackRestoredKey: null, _playbackUserInteracted: false }
    const video = makeVideo({ currentTime: 0 })
    await progressMemoryFeatures.restorePlaybackPosition.call(ctx, video)
    assert.equal(video.currentTime, 65)
    assert.equal(ctx._playbackRestoredKey, '/v?p=1')
})
