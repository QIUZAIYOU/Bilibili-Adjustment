import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
// storage.service 构造时会检查 window.indexedDB：Node 环境先补最小 stub
if (!(globalThis.window as unknown as { indexedDB?: unknown }).indexedDB) (globalThis.window as unknown as { indexedDB: unknown }).indexedDB = {}
const { fetchModels } = await import('@/services/ai.service')
/**
 * 模型列表拉取的「按预算重试」回归（2026-09-24 改）
 *
 * 旧实现写 `retries: 1`（只试 2 次），网络差时设置面板直接显示回退列表；
 * 现按预算重试（默认 30 秒，退避递增）。这里注入很小的预算，毫秒级验证重试确实发生。
 * ⚠️ 每个用例用不同的自定义 baseURL：模型列表带进程级缓存（缓存键 = provider|baseURL），
 * 换 baseURL 才能保证互不干扰；自定义提供商没有内置回退列表，故失败路径只断言"不抛错、返回数组"。
 */
const withFetch = async (handler: () => Response, run: () => Promise<unknown>): Promise<number> => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => { calls++; return handler() }) as typeof fetch
    try {
        await run()
    } finally {
        globalThis.fetch = originalFetch
    }
    return calls
}
const okResponse = (): Response => new Response(JSON.stringify({
    data: [
        { id: 'Qwen/Qwen2.5-7B-Instruct', object: 'model', owned_by: 'qwen' },
        { id: 'flux-image-v1', object: 'model', owned_by: 'blackforest' }
    ]
}), { status: 200, headers: { 'Content-Type': 'application/json' }})
test('模型列表：连续 503 会按预算重试（旧实现只试 2 次）', async () => {
    const calls = await withFetch(() => new Response('busy', { status: 503 }), async () => {
        const models = await fetchModels('sk-test', 'custom', 'https://a.test', { retryBudgetMs: 200, retryDelay: 10 })
        assert.ok(Array.isArray(models), '失败路径应走回退列表而不是抛错')
    })
    assert.ok(calls > 2, `预算内应超过 2 次尝试，实际 ${calls} 次`)
})
test('模型列表：前两次失败后重试成功，返回接口数据并过滤非对话模型', async () => {
    let attempt = 0
    const calls = await withFetch(() => {
        attempt++
        return attempt <= 2 ? new Response('busy', { status: 503 }) : okResponse()
    }, async () => {
        const models = await fetchModels('sk-test', 'custom', 'https://b.test', { retryBudgetMs: 500, retryDelay: 10 })
        assert.deepEqual(models.map(model => model.id), ['Qwen/Qwen2.5-7B-Instruct'], '图像模型应被过滤掉')
    })
    assert.equal(calls, 3)
})
test('模型列表：401 等确定性失败不重试，直接报错（不浪费重试预算）', async () => {
    const calls = await withFetch(() => new Response('unauthorized', { status: 401 }), async () => {
        await assert.rejects(
            fetchModels('sk-bad', 'custom', 'https://c.test', { retryBudgetMs: 200, retryDelay: 10 }),
            /API Key 无效/
        )
    })
    assert.equal(calls, 1, '401 只尝试一次')
})
test('模型列表：网络错误按预算重试后回退内置列表', async () => {
    const calls = await withFetch(() => { throw new TypeError('fetch failed') }, async () => {
        const models = await fetchModels('sk-test', 'siliconflow', '', { retryBudgetMs: 150, retryDelay: 10 })
        assert.ok(models.length > 0, 'siliconflow 有内置回退列表')
    })
    assert.ok(calls > 2, `网络错误也应按预算重试，实际 ${calls} 次`)
})
