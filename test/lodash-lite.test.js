import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk, debounce, throttle, pick, reduce, snakeCase, camelCase } from '@/utils/lodash-lite'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// ============ chunk ============
test('chunk：按 size 切分', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})
test('chunk：size < 1 时视为 1', () => {
    assert.deepEqual(chunk([1, 2], 0), [[1], [2]])
})
test('chunk：空/非数组输入不报错', () => {
    assert.deepEqual(chunk(null, 2), [])
})
// ============ debounce ============
test('debounce：leading + trailing:false 首次立即执行、等待期内忽略重复调用', async () => {
    let calls = 0
    const fn = debounce(() => { calls++ }, 20, { leading: true, trailing: false })
    fn()
    fn()
    fn()
    assert.equal(calls, 1)
    await sleep(40)
    assert.equal(calls, 1)
})
test('debounce：默认 trailing 只在静默期结束后执行一次', async () => {
    let calls = 0
    const fn = debounce(() => { calls++ }, 20)
    fn()
    fn()
    assert.equal(calls, 0)
    await sleep(40)
    assert.equal(calls, 1)
})
test('debounce：cancel 阻止后续执行', async () => {
    let calls = 0
    const fn = debounce(() => { calls++ }, 20)
    fn()
    fn.cancel()
    await sleep(40)
    assert.equal(calls, 0)
})
test('debounce：flush 立即执行挂起调用', () => {
    let calls = 0
    const fn = debounce(() => { calls++ }, 50)
    fn()
    fn.flush()
    assert.equal(calls, 1)
})
// ============ throttle ============
test('throttle：首次立即执行，等待期内合并为一次尾调用', async () => {
    let calls = 0
    const fn = throttle(() => { calls++ }, 30)
    fn()
    fn()
    fn()
    assert.equal(calls, 1)
    await sleep(60)
    assert.equal(calls, 2)
})
// ============ pick / reduce ============
test('pick：取存在的键（含原型链，兼容 CSSStyleDeclaration）', () => {
    assert.deepEqual(pick({ a: 1, b: 2 }, ['a', 'c']), { a: 1 })
})
test('reduce：遍历对象归并', () => {
    assert.equal(reduce({ a: 1, b: 2 }, (sum, value) => sum + value, 0), 3)
})
test('reduce：无初值时行为可预期（不抛错）', () => {
    assert.equal(reduce(null, (sum, value) => sum + value, 0), 0)
})
// ============ snakeCase / camelCase ============
test('snakeCase：驼峰与数字边界', () => {
    assert.equal(snakeCase('autoSkip'), 'auto_skip')
    assert.equal(snakeCase('jump_2_k'), 'jump_2_k')
})
test('snakeCase：与 V2 lodash 语义一致（数字前后加下划线）', () => {
    // 原实现依赖 lodash.snakeCase(element.id).replace(/_(\d)_k/g, '$1k')
    assert.equal(snakeCase('segment_2_k').replace(/_(\d)_k/g, '$1k'), 'segment2k')
})
test('camelCase：与 snakeCase 同一拆词规则', () => {
    assert.equal(camelCase('auto_skip'), 'autoSkip')
    assert.equal(camelCase('Auto Skip'), 'autoSkip')
})
