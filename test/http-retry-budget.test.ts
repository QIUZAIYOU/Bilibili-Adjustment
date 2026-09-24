import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { httpGet } from '@/utils/http'
/**
 * httpRequest 的「按预算重试」回归（2026-09-24 新增）
 *
 * 旧口径只有 `retries`（次数，默认 0）：调用点写 `retries: 1` 就是"只试 2 次"，
 * 网络差时几次用完就失败。现在可以传 `retryBudgetMs` 按时间预算重试（退避递增、封顶 10 秒），
 * 未传预算的调用点行为完全不变（仍按次数）。
 */
const withFailingFetch = async (status: number, run: () => Promise<void>): Promise<() => number> => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
        calls++
        return new Response('err', { status })
    }) as typeof fetch
    try {
        await run()
    } finally {
        globalThis.fetch = originalFetch
    }
    return () => calls
}
test('给了预算就按预算重试：5xx 连续失败会远超 2 次尝试', async () => {
    let calls = 0
    const startedAt = Date.now()
    await withFailingFetch(503, async () => {
        await assert.rejects(httpGet('https://example.com/api', { timeout: 200, retryBudgetMs: 300, retryDelay: 10 }), /请求失败: 503/)
    }).then(getCalls => { calls = getCalls() })
    assert.ok(calls > 2, `预算内应远超"只试 2 次"，实际 ${calls} 次`)
    assert.ok(Date.now() - startedAt >= 300, '应确实等到预算用尽才放弃')
})
test('不传预算时行为不变：仍按 retries 次数（retries: 1 就是两次尝试）', async () => {
    let calls = 0
    await withFailingFetch(503, async () => {
        await assert.rejects(httpGet('https://example.com/api', { timeout: 200, retries: 1, retryDelay: 5 }), /请求失败: 503/)
    }).then(getCalls => { calls = getCalls() })
    assert.equal(calls, 2)
})
test('4xx 等确定性失败不重试（预算内也只试一次）', async () => {
    let calls = 0
    await withFailingFetch(404, async () => {
        await assert.rejects(httpGet('https://example.com/api', { timeout: 200, retryBudgetMs: 300, retryDelay: 10 }), /请求失败: 404/)
    }).then(getCalls => { calls = getCalls() })
    assert.equal(calls, 1)
})
test('成功即返回，不额外重试', async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
        calls++
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' }})
    }) as typeof fetch
    try {
        const response = await httpGet('https://example.com/api', { timeout: 200, retryBudgetMs: 300 })
        assert.deepEqual(response.data, { ok: true })
        assert.equal(calls, 1)
    } finally {
        globalThis.fetch = originalFetch
    }
})
