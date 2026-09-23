import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { refreshHotConfig, clearHotConfigCacheForTest } from '@/services/hot-config.service'
import { resolveAdDetectionPrompt, resetPromptCacheForTest } from '@/services/prompt.service'
import { AD_DETECTION_PROMPT } from '@/shared/ad-detection-prompt'
import { HOT_CONFIG_BASE } from '@/services/hot-config.service'
/**
 * 热更资产的**取用方式**回归防线（2026-09-23 的 CORS 缓存串号故障）：
 *
 * 服务器按请求 Origin 回显 `Access-Control-Allow-Origin`，如果浏览器复用了其他 B 站子域
 * 缓存下来的响应，当前 Origin 与缓存的 ACAO 不匹配 → fetch 直接被拦（5 个 `hot-config/*.js` 全挂）。
 * 因此热更表与提示词的请求都必须带 `cache: 'no-store'`，绕开浏览器缓存。
 * 服务端另有 `Vary: Origin` 兜底（nginx 配置），这里锁的是客户端这一层。
 */
const stubFetch = (captured: Array<{ url: string, options: RequestInit }>) => {
    globalThis.fetch = (async (input: RequestInfo | URL, options: RequestInit = {}) => {
        const url = String(input)
        captured.push({ url, options })
        const body = url.includes('ad-detection-prompt')
            ? JSON.stringify({ version: '3.36.6', hash: 'deadbeefcafe', updatedAt: '2026-09-23T00:00:00.000Z', prompt: AD_DETECTION_PROMPT })
            : JSON.stringify({ table: url.split('/').pop()?.replace('.js', ''), overrides: {}})
        return { ok: true, status: 200, text: async () => body } as unknown as Response
    }) as typeof fetch
}
test('热更覆盖表：5 张表都带 cache:no-store（避免跨子域缓存串号导致 CORS 失败）', async () => {
    const captured: Array<{ url: string, options: RequestInit }> = []
    stubFetch(captured)
    clearHotConfigCacheForTest()
    await refreshHotConfig()
    assert.equal(captured.length, 5, `应请求 5 张表，实际 ${captured.length}`)
    for (const { url, options } of captured) {
        assert.ok(url.startsWith(HOT_CONFIG_BASE), `非热更目录地址：${url}`)
        assert.equal(options.cache, 'no-store', `${url} 缺少 cache:no-store`)
        assert.equal(options.credentials, 'omit')
    }
})
test('远程提示词：同样带 cache:no-store', async () => {
    const captured: Array<{ url: string, options: RequestInit }> = []
    stubFetch(captured)
    clearHotConfigCacheForTest()
    resetPromptCacheForTest()
    const resolved = await resolveAdDetectionPrompt()
    const promptCall = captured.find(item => item.url.includes('ad-detection-prompt'))
    assert.ok(promptCall, '应请求远程提示词')
    assert.equal(promptCall.options.cache, 'no-store', '提示词请求缺少 cache:no-store')
    assert.equal(resolved.source, 'remote')
    resetPromptCacheForTest()
})
