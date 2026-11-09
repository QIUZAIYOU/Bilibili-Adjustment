import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDispatchPlayerReady } from '@/utils/player-ready-dispatch'
const video = {}
test('shouldDispatchPlayerReady：首次派发照常', () => {
    assert.equal(shouldDispatchPlayerReady(null, { video, src: 'a.mp4', at: 1000 }, 1000), true)
})
test('shouldDispatchPlayerReady：同元素同 src 在窗口内重复派发被跳过', () => {
    const previous = { video, src: 'a.mp4', at: 1000 }
    assert.equal(shouldDispatchPlayerReady(previous, { video, src: 'a.mp4', at: 5999 }, 5999), false)
    assert.equal(shouldDispatchPlayerReady(previous, { video, src: 'a.mp4', at: 6000 }, 6000), true)
})
test('shouldDispatchPlayerReady：元素或 src 变了立即允许', () => {
    const previous = { video, src: 'a.mp4', at: 1000 }
    assert.equal(shouldDispatchPlayerReady(previous, { video: {}, src: 'a.mp4', at: 1200 }, 1200), true)
    assert.equal(shouldDispatchPlayerReady(previous, { video, src: 'b.mp4', at: 1200 }, 1200), true)
})
test('shouldDispatchPlayerReady：缺元素或时间非法时不拦截', () => {
    const previous = { video, src: 'a.mp4', at: 1000 }
    assert.equal(shouldDispatchPlayerReady(previous, { video: null, src: 'a.mp4', at: 1200 }, 1200), true)
    assert.equal(shouldDispatchPlayerReady(previous, { video, src: 'a.mp4', at: 1200 }, Number.NaN), true)
})
