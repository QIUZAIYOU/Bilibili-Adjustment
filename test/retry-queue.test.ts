import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { RetryQueue } from '@/utils/retry-queue'
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
/**
 * 重试队列的回归防线
 *
 * 背景（2026-09-21 用户报「提示已加入重试队列但永远不重试」）：
 * 旧实现只暴露 `drain()`，靠外部 pump（`executeFunctionsSequentially` 的 onAfterChunk）驱动；
 * 而播放器模式切换是在那批函数执行完之后才跑的，失败后没有任何"下一批"来 pump → 任务永不重试。
 * 现在 register 即自行安排重试，下面的用例全部**不调用 drain()**，只等队列自己动。
 */
test('注册后无需外部 pump 也会自动重试，成功即出队', async () => {
    const queue = new RetryQueue({ intervalMs: 20 })
    let attempts = 0
    queue.register('probe', async () => {
        attempts++
        if (attempts < 3) throw new Error(`第 ${attempts} 次失败`)
    })
    assert.equal(queue.pending, true)
    await sleep(200)
    assert.equal(attempts, 3, '应自动重试到成功')
    assert.equal(queue.pending, false, '成功后应出队')
})
test('超过最大重试次数后放弃并出队（不会无限重试）', async () => {
    const queue = new RetryQueue({ intervalMs: 15 })
    let attempts = 0
    queue.register('always-fail', async () => {
        attempts++
        throw new Error('始终失败')
    }, 2)
    await sleep(250)
    assert.equal(attempts, 2, `最多重试 2 次，实际 ${attempts} 次`)
    assert.equal(queue.pending, false, '达上限后应出队')
})
test('同一 id 重复注册被忽略（不会重复重试同一件事）', async () => {
    const queue = new RetryQueue({ intervalMs: 15 })
    let attempts = 0
    const fn = async (): Promise<void> => { attempts++ }
    queue.register('dup', fn, 5)
    queue.register('dup', fn, 5)
    await sleep(80)
    assert.equal(attempts, 1)
})
test('并发 drain 保护：同时调用两次也只跑一轮，不重复累加次数', async () => {
    const queue = new RetryQueue({ intervalMs: 50 })
    let attempts = 0
    queue.register('once', async () => { attempts++ }, 5)
    await Promise.all([queue.drain(), queue.drain()])
    assert.equal(attempts, 1, '并发 drain 不应重复执行同一任务')
})
test('clear 会清空队列并取消已安排的重试', async () => {
    const queue = new RetryQueue({ intervalMs: 30 })
    let attempts = 0
    queue.register('cancelled', async () => { attempts++ })
    queue.clear()
    await sleep(120)
    assert.equal(attempts, 0, 'clear 后不应再重试')
    assert.equal(queue.pending, false)
})
