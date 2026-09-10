import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpRequest, httpGet, httpPost } from '@/utils/http'
const jsonResponse = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => JSON.stringify(data)
})
const originalFetch = globalThis.fetch
const restore = () => { globalThis.fetch = originalFetch }
// ============ 正常路径 ============
test('httpGet：返回解析后的 data 与 status', async () => {
    globalThis.fetch = async () => jsonResponse({ ok: true, value: 42 })
    const response = await httpGet('https://example.com/api')
    restore()
    assert.equal(response.status, 200)
    assert.deepEqual(response.data, { ok: true, value: 42 })
})
test('httpPost：对象请求体被 JSON 化并带 Content-Type', async () => {
    let captured = null
    globalThis.fetch = async (url, options) => {
        captured = options
        return jsonResponse({ ok: true })
    }
    await httpPost('https://example.com/api', { a: 1 }, { headers: { 'Content-Type': 'application/json' }})
    restore()
    assert.equal(captured.method, 'POST')
    assert.equal(captured.body, '{"a":1}')
})
test('httpRequest：withCredentials 映射为 credentials=include', async () => {
    let captured = null
    globalThis.fetch = async (url, options) => {
        captured = options
        return jsonResponse({})
    }
    await httpGet('https://example.com/api', { withCredentials: true })
    restore()
    assert.equal(captured.credentials, 'include')
})
// ============ 错误形状（与 axios 兼容） ============
test('错误响应：error.response.status 与 data 可用', async () => {
    globalThis.fetch = async () => jsonResponse({ message: 'bad' }, 400)
    let error = null
    try {
        await httpGet('https://example.com/api')
    } catch (e) {
        error = e
    }
    restore()
    assert.equal(error.response.status, 400)
    assert.deepEqual(error.response.data, { message: 'bad' })
    assert.equal(error.code, 'ERR_BAD_REQUEST')
})
test('429：可重试并在重试成功后返回结果', async () => {
    let calls = 0
    globalThis.fetch = async () => {
        calls++
        return calls === 1 ? jsonResponse({}, 429) : jsonResponse({ ok: true })
    }
    const response = await httpGet('https://example.com/api', { retries: 1, retryDelay: 1 })
    restore()
    assert.equal(calls, 2)
    assert.deepEqual(response.data, { ok: true })
})
test('5xx 且无重试次数：抛出 ERR_BAD_RESPONSE', async () => {
    globalThis.fetch = async () => jsonResponse({}, 503)
    let error = null
    try {
        await httpGet('https://example.com/api')
    } catch (e) {
        error = e
    }
    restore()
    assert.equal(error.response.status, 503)
    assert.equal(error.code, 'ERR_BAD_RESPONSE')
})
// ============ 超时与取消 ============
test('超时：抛出 code=ECONNABORTED', async () => {
    globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
    let error = null
    try {
        await httpGet('https://example.com/api', { timeout: 30 })
    } catch (e) {
        error = e
    }
    restore()
    assert.equal(error.code, 'ECONNABORTED')
})
test('外部取消：抛出 code=ERR_CANCELED 且不重试', async () => {
    let calls = 0
    globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
        calls++
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
    const controller = new AbortController()
    const promise = httpGet('https://example.com/api', { signal: controller.signal, timeout: 5000, retries: 2 })
    controller.abort()
    let error = null
    try {
        await promise
    } catch (e) {
        error = e
    }
    restore()
    assert.equal(error.code, 'ERR_CANCELED')
    assert.equal(calls, 1)
})
// ============ 文本响应 ============
test('responseType=text：不做 JSON 解析', async () => {
    globalThis.fetch = async () => jsonResponse({ raw: 'text' })
    const response = await httpRequest('https://example.com/api', { responseType: 'text' })
    restore()
    assert.equal(typeof response.data, 'string')
})
