import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventBus } from '@/core/event-bus'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// ============ 优先级插入（P1-4.1） ============
test('on：handler 按 priority 降序执行（注册顺序无关）', async () => {
    const order = []
    const offLow = eventBus.on('test:order', () => order.push('low'), { priority: 0 })
    const offHigh = eventBus.on('test:order', () => order.push('high'), { priority: 10 })
    const offMid = eventBus.on('test:order', () => order.push('mid'), { priority: 5 })
    await eventBus.emit('test:order')
    offLow()
    offHigh()
    offMid()
    assert.deepEqual(order, ['high', 'mid', 'low'])
})
test('once：只执行一次', async () => {
    let calls = 0
    const off = eventBus.once('test:once', () => { calls++ })
    await eventBus.emit('test:once')
    await eventBus.emit('test:once')
    off()
    assert.equal(calls, 1)
})
// ============ 并行白名单 ============
test('app:ready：白名单事件并行，慢 handler 不阻塞快 handler', async () => {
    const order = []
    const offSlow = eventBus.on('app:ready', async () => {
        await sleep(30)
        order.push('slow')
    })
    const offFast = eventBus.on('app:ready', () => order.push('fast'))
    await eventBus.emit('app:ready')
    offSlow()
    offFast()
    assert.deepEqual(order, ['fast', 'slow'])
})
test('非白名单事件保持串行执行（顺序敏感语义不变）', async () => {
    const order = []
    const offFirst = eventBus.on('config:changed', async () => {
        await sleep(20)
        order.push('first')
    })
    const offSecond = eventBus.on('config:changed', () => order.push('second'))
    await eventBus.emit('config:changed', { key: 'theme', value: 'night' })
    offFirst()
    offSecond()
    assert.deepEqual(order, ['first', 'second'])
})
// ============ 错误处理与深度防护 ============
test('handler 抛错不阻断后续 handler，并上报 error 事件', async () => {
    const seen = []
    const offError = eventBus.on('error', () => seen.push('error'))
    const offBad = eventBus.on('test:throw', () => { throw new Error('boom') })
    const offGood = eventBus.on('test:throw', () => seen.push('after'))
    await eventBus.emit('test:throw')
    await sleep(10)
    offError()
    offBad()
    offGood()
    assert.ok(seen.includes('after'), '后续 handler 应继续执行')
    assert.ok(seen.includes('error'), '应上报 error 事件')
})
test('error 事件 handler 自身抛错不会导致无限递归', async () => {
    let errorHandlerCalls = 0
    const offError = eventBus.on('error', () => {
        errorHandlerCalls++
        throw new Error('error-handler-boom')
    })
    const offBad = eventBus.on('test:recursion', () => { throw new Error('boom') })
    await eventBus.emit('test:recursion')
    await sleep(20)
    offError()
    offBad()
    assert.ok(errorHandlerCalls >= 1)
    // 深度防护保证调用次数有限（不会无限递归）；异步上报的 microtask 顺序会使计数略高于上限
    assert.ok(errorHandlerCalls <= 8, `深度防护生效（实际 ${errorHandlerCalls} 次）`)
})
test('cancel：interceptor 可中断 emit', async () => {
    let handled = false
    const removeInterceptor = eventBus.addInterceptor(context => {
        if (context.event === 'test:cancel') context.cancel()
    })
    const off = eventBus.on('test:cancel', () => { handled = true })
    await eventBus.emit('test:cancel')
    removeInterceptor()
    off()
    assert.equal(handled, false)
})
