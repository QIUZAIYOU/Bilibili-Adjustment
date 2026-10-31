import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FeatureScheduler, type FeatureDefinition } from '@/shared/feature-scheduler'
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
const mk = (id: string, lane: FeatureDefinition['lane'], trigger: FeatureDefinition['trigger'], run: () => unknown, extra: Partial<FeatureDefinition> = {}): FeatureDefinition =>
    ({ id, lane, trigger, run, ...extra })
test('instant 车道并行执行，互不等待', async () => {
    const done: string[] = []
    const features = [
        mk('a', 'instant', 'player:ready', async () => { await sleep(60); done.push('a') }),
        mk('b', 'instant', 'player:ready', async () => { await sleep(10); done.push('b') }),
        mk('c', 'instant', 'player:ready', () => { done.push('c') })
    ]
    const scheduler = new FeatureScheduler(features, { defaultTimeouts: { instant: 500 } })
    const summary = await scheduler.trigger('player:ready')
    assert.equal(summary.instant.total, 3)
    assert.equal(summary.instant.ok, 3)
    // 并行：b/c 先于 a 完成
    assert.deepEqual(done.slice(-1), ['a'])
})
test('instant 单项超时不影响其它项，也不中断后续', async () => {
    const ran: string[] = []
    const features = [
        mk('slow', 'instant', 'player:ready', async () => { await sleep(200); ran.push('slow') }),
        mk('fast', 'instant', 'player:ready', () => { ran.push('fast') }),
        mk('boom', 'instant', 'player:ready', () => { throw new Error('boom') })
    ]
    const statuses: Record<string, string> = {}
    const scheduler = new FeatureScheduler(features, {
        defaultTimeouts: { instant: 30 },
        onRecord: record => { statuses[record.id] = record.status }
    })
    const summary = await scheduler.trigger('player:ready')
    assert.equal(summary.instant.total, 3)
    assert.equal(summary.instant.failed, 2)
    assert.equal(statuses.slow, 'timeout')
    assert.equal(statuses.boom, 'error')
    assert.equal(statuses.fast, 'ok')
    assert.ok(ran.includes('fast'))
})
test('when 返回 false 的功能直接被过滤（不执行、不计入 total）', async () => {
    let called = false
    const statuses: string[] = []
    const features = [
        mk('off', 'instant', 'player:ready', () => { called = true }, { when: () => false }),
        mk('on', 'instant', 'player:ready', () => {}, { when: () => true })
    ]
    const scheduler = new FeatureScheduler(features, { onRecord: r => statuses.push(`${r.id}:${r.status}`) })
    const summary = await scheduler.trigger('player:ready')
    assert.equal(called, false)
    assert.equal(summary.instant.total, 1)
    assert.deepEqual(statuses, ['on:ok'])
})
test('interactive 独占：同一触发点并发调用不会跑两遍', async () => {
    let runs = 0
    const scheduler = new FeatureScheduler([
        mk('mode', 'interactive', 'player:ready', async () => { runs++; await sleep(50) })
    ])
    const [first, second] = await Promise.all([
        scheduler.trigger('player:ready'),
        scheduler.trigger('player:ready')
    ])
    assert.equal(runs, 1, '同一 id 的交互动作只跑一次')
    assert.equal(first.interactive.total, 1)
    assert.equal(second.interactive.ok, 0, '独占中的第二个调用被去重跳过（记为 skipped，不计 ok）')
})
test('background 排队执行且可在空闲时等待', async () => {
    const order: string[] = []
    let running = 0
    let maxRunning = 0
    const make = (id: string): FeatureDefinition => mk(id, 'background', 'player:ready', async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await sleep(20)
        order.push(id)
        running--
    })
    const scheduler = new FeatureScheduler([make('x'), make('y'), make('z')], { backgroundConcurrency: 2 })
    const summary = await scheduler.trigger('player:ready')
    assert.equal(summary.backgroundQueued, 3)
    await scheduler.whenBackgroundIdle()
    assert.deepEqual(order.sort(), ['x', 'y', 'z'])
    assert.ok(maxRunning <= 2, `并发不得超过 2，实际 ${maxRunning}`)
    assert.equal(scheduler.backgroundPending, 0)
})
test('bumpGeneration 后旧代次仍在跑的任务记为 stale', async () => {
    const statuses: string[] = []
    const scheduler = new FeatureScheduler([
        mk('old', 'background', 'player:ready', async () => { await sleep(30) })
    ], { backgroundConcurrency: 1, onRecord: record => statuses.push(record.status) })
    const triggerPromise = scheduler.trigger('player:ready')
    scheduler.bumpGeneration()
    await triggerPromise
    await scheduler.whenBackgroundIdle()
    assert.deepEqual(statuses, ['stale'])
})
test('bumpGeneration 后排队未启动的 background 任务直接丢弃', async () => {
    const statuses: string[] = []
    const scheduler = new FeatureScheduler([
        mk('first', 'background', 'player:ready', async () => { await sleep(40) }),
        mk('second', 'background', 'player:ready', () => {})
    ], { backgroundConcurrency: 1, onRecord: record => statuses.push(`${record.id}:${record.status}`) })
    const triggerPromise = scheduler.trigger('player:ready')
    scheduler.bumpGeneration()
    await triggerPromise
    await scheduler.whenBackgroundIdle()
    assert.deepEqual(statuses.sort(), ['first:stale', 'second:stale'])
})
test('background 队列按 id 去重：重复触发时排队中的同名任务被替换而非叠加（审查 W7）', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>(resolve => { release = resolve })
    const dupRuns: string[] = []
    const features = [
        mk('gate', 'background', 'player:ready', async () => { await gate }),
        mk('dup', 'background', 'player:ready', () => { dupRuns.push('dup') })
    ]
    const scheduler = new FeatureScheduler(features, { defaultTimeouts: { background: 500 }, backgroundConcurrency: 1 })
    void scheduler.trigger('player:ready')
    void scheduler.trigger('player:ready')
    // 队列里 dup 只有一份（第二次触发替换掉第一次的排队项）——由下面的执行次数断言
    release?.()
    await scheduler.whenBackgroundIdle()
    assert.equal(dupRuns.length, 1)
})
test('background 队列有上限常量，排队数不会超过它（审查 W7 上限）', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>(resolve => { release = resolve })
    const max = FeatureScheduler.MAX_BACKGROUND_QUEUE
    assert.ok(Number.isInteger(max) && max > 0, '应有正整数队列上限')
    const features = [
        mk('gate', 'background', 'player:ready', async () => { await gate }),
        ...Array.from({ length: max + 5 }, (_, i) => mk(`q${i}`, 'background', 'player:ready', () => {}))
    ]
    const statuses: Record<string, string> = {}
    const scheduler = new FeatureScheduler(features, {
        defaultTimeouts: { background: 500 },
        backgroundConcurrency: 1,
        onRecord: record => { statuses[record.id] = record.status }
    })
    void scheduler.trigger('player:ready')
    assert.ok(scheduler.backgroundPending <= max, `排队数 ${scheduler.backgroundPending} 不应超过 ${max}`)
    release?.()
    await scheduler.whenBackgroundIdle()
    // 被挤掉的记 stale，其余正常跑完
    const stale = Object.values(statuses).filter(status => status === 'stale').length
    assert.ok(stale >= 5, `应至少有 5 个被丢弃记 stale，实际 ${stale}`)
})
test('bumpGeneration 后 instant 车道结果也记 stale', async () => {
    const statuses: Record<string, string> = {}
    let scheduler: FeatureScheduler | null = null
    const features = [
        mk('slow-instant', 'instant', 'player:ready', async () => {
            await sleep(80)
            scheduler?.bumpGeneration()
        })
    ]
    scheduler = new FeatureScheduler(features, {
        defaultTimeouts: { instant: 500 },
        onRecord: record => { statuses[record.id] = record.status }
    })
    await scheduler.trigger('player:ready')
    assert.equal(statuses['slow-instant'], 'stale')
})
