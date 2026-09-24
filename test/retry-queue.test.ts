import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { RetryQueue } from '@/utils/retry-queue'
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
/**
 * 重试队列的回归防线
 *
 * 背景 1（2026-09-21 用户报「提示已加入重试队列但永远不重试」）：
 * 旧实现只暴露 `drain()`，靠外部 pump（`executeFunctionsSequentially` 的 onAfterChunk）驱动；
 * 而播放器模式切换是在那批函数执行完之后才跑的，失败后没有任何"下一批"来 pump → 任务永不重试。
 * 现在 register 即自行安排重试，下面的用例大多**不调用 drain()**，只等队列自己动。
 *
 * 背景 2（2026-09-24 用户报「重试 3 次太少，网络不好时体验很差」）：
 * 收口口径从「次数」改为「时间预算 + 递增退避」—— 预算内一直重试，只有预算用完才放弃。
 */
test('注册后无需外部 pump 也会自动重试，成功即出队', async () => {
    const queue = new RetryQueue({ intervalMs: 20 })
    let attempts = 0
    queue.register('probe', async () => {
        attempts++
        if (attempts < 3) throw new Error(`第 ${attempts} 次失败`)
    })
    assert.equal(queue.pending, true)
    await sleep(400)
    assert.equal(attempts, 3, '应自动重试到成功')
    assert.equal(queue.pending, false, '成功后应出队')
})
test('不按次数收口：失败次数远超旧上限（3 次）仍继续重试', async () => {
    const queue = new RetryQueue({ intervalMs: 5, budgetMs: 400 })
    let attempts = 0
    queue.register('always-fail', async () => {
        attempts++
        throw new Error('始终失败')
    })
    await sleep(250)
    assert.ok(attempts > 3, `预算内应远超 3 次，实际 ${attempts} 次`)
    assert.equal(queue.pending, true, '预算未用完时不应放弃')
    await sleep(600)
    assert.equal(queue.pending, false, '预算用尽后应出队')
    const settled = attempts
    await sleep(200)
    assert.equal(attempts, settled, '放弃后不应再尝试')
})
test('退避生效：重试间隔逐次变大（不是固定间隔猛刷）', async () => {
    const queue = new RetryQueue({ intervalMs: 10, budgetMs: 500 })
    const stamps: number[] = []
    queue.register('backoff', async () => {
        stamps.push(Date.now())
        throw new Error('始终失败')
    })
    await sleep(700)
    assert.ok(stamps.length >= 4, `应至少尝试 4 次，实际 ${stamps.length} 次`)
    const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index])
    assert.ok(gaps[1] > gaps[0], `间隔应递增：${JSON.stringify(gaps)}`)
    assert.ok(gaps[gaps.length - 1] >= gaps[1], `间隔不应回落：${JSON.stringify(gaps)}`)
})
test('预算足够大时不会因为"次数"提前放弃（旧实现 3 次就放弃）', async () => {
    const queue = new RetryQueue({ intervalMs: 10, budgetMs: 2000 })
    let attempts = 0
    queue.register('flaky', async () => {
        attempts++
        if (attempts <= 5) throw new Error('前 5 次都失败')
    })
    await sleep(500)
    assert.equal(queue.pending, false, '第 6 次成功应出队（旧实现第 3 次就放弃了）')
    assert.equal(attempts, 6)
})
test('预算用尽即放弃并出队，之后不再尝试（不会无限重试）', async () => {
    const queue = new RetryQueue({ intervalMs: 15, budgetMs: 150 })
    let attempts = 0
    queue.register('always-fail-budget', async () => {
        attempts++
        throw new Error('始终失败')
    })
    await sleep(400)
    assert.equal(queue.pending, false, '预算用尽后应出队')
    assert.ok(attempts >= 2 && attempts <= 8, `150ms 预算内的尝试次数应有限，实际 ${attempts}`)
    const settled = attempts
    await sleep(150)
    assert.equal(attempts, settled, '放弃后不应再尝试')
})
test('同一 id 重复注册被忽略（不会重复重试同一件事）', async () => {
    const queue = new RetryQueue({ intervalMs: 10 })
    let attempts = 0
    const fn = async (): Promise<void> => { attempts++ }
    queue.register('dup', fn)
    queue.register('dup', fn)
    await sleep(120)
    assert.equal(attempts, 1)
})
test('并发 drain 保护：执行中的任务不会被第二轮重复执行', async () => {
    const queue = new RetryQueue({ intervalMs: 20 })
    let started = 0
    // 一次重试耗时 400ms（远大于 20ms 间隔），保证断言落在"执行中"的窗口里
    queue.register('slow', async () => {
        started++
        await sleep(400)
        throw new Error('失败')
    })
    await sleep(80) // 首轮已经开跑，此刻仍在执行中
    const concurrent = await Promise.all([queue.drain(), queue.drain()])
    assert.deepEqual(concurrent, [[], []], '执行中的 drain 应立即返回空')
    assert.equal(started, 1, '同一任务不应被并发执行')
    // 清掉队列：否则任务会按默认 3 分钟预算一直重试，拖住测试进程
    queue.clear()
    await sleep(400)
    assert.equal(started, 1, 'clear 之后也不应再尝试')
})
test('退避未到点时外部 drain 不会提前执行（不破坏退避节奏）', async () => {
    const queue = new RetryQueue({ intervalMs: 60 })
    let attempts = 0
    queue.register('too-early', async () => { attempts++ })
    await queue.drain()
    assert.equal(attempts, 0, '还没到点，外部 drain 应跳过')
    await sleep(120)
    assert.equal(attempts, 1, '到点后自动执行')
})
test('clear 会清空队列并取消已安排的重试', async () => {
    const queue = new RetryQueue({ intervalMs: 30 })
    let attempts = 0
    queue.register('cancelled', async () => { attempts++ })
    queue.clear()
    await sleep(200)
    assert.equal(attempts, 0, 'clear 后不应再重试')
    assert.equal(queue.pending, false)
})
