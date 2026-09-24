import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { biliApis } from '@/shared/bili-apis'
/**
 * 接口请求重试的集成回归（2026-09-24 用户报「重试 3 次太少，网络不好时体验很差」）
 *
 * 这里用真实模块链路跑一遍：`biliApis` → `_apiRequest` → `_fetchWithRetry` → `withRetryBudget`
 * → 每次尝试单独 `_enqueueRequest` → `httpGet` →（stub 的）`fetch`。
 * 两个关键点：
 * 1. 5xx 之后确实会重试并最终成功（旧实现 3 次尝试就放弃）；
 * 2. **不会把全局请求队列锁死** —— `_fetchWithRetry` 内部已逐次入队，外面若再套一层
 *    `_enqueueRequest`，内层入队永远排不到（外层在等这个重试循环）→ 死锁。
 *    故这里给用例设了超时，死锁会以超时失败而不是永远挂住。
 */
const jsonResponse = (data: unknown): Response => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
})
test('接口请求：连续 503 会重试并最终成功', { timeout: 20000 }, async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
        calls++
        if (calls <= 2) return new Response('busy', { status: 503 })
        return jsonResponse({ code: 0, data: { mid: 1, name: '测试' }})
    }) as typeof fetch
    try {
        const info = await biliApis.getUserInformation(1)
        assert.deepEqual(info, { mid: 1, name: '测试' }, '重试成功后应拿到数据')
        assert.equal(calls, 3, '前两次 503 应被重试，第 3 次成功')
    } finally {
        globalThis.fetch = originalFetch
    }
})
test('接口请求：确定性失败（404）不重试，直接抛出', { timeout: 20000 }, async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
        calls++
        return new Response('not found', { status: 404 })
    }) as typeof fetch
    try {
        await assert.rejects(biliApis.getUserInformation(1), /404/)
        assert.equal(calls, 1, '404 重试再久也没用，只尝试一次')
    } finally {
        globalThis.fetch = originalFetch
    }
})
