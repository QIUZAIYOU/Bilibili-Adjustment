import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    parsePromptPayload,
    parseCachedPrompt,
    describePromptSource,
    MIN_PROMPT_LENGTH,
    PROMPT_MARKER
} from '@/shared/remote-prompt'
/** 造一份「合法」的提示词正文（长度与标记都满足校验） */
const validPrompt = `${PROMPT_MARKER}（测试）\n` + '内容'.repeat(MIN_PROMPT_LENGTH)
const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    prompt: validPrompt,
    version: '3.35.4',
    hash: 'abc123def456',
    updatedAt: '2026-09-17T08:24:52.564Z',
    ...overrides
})
test('parsePromptPayload：合法载荷解析出全部字段', () => {
    assert.deepEqual(parsePromptPayload(payload()), {
        prompt: validPrompt,
        version: '3.35.4',
        hash: 'abc123def456',
        updatedAt: '2026-09-17T08:24:52.564Z'
    })
})
test('parsePromptPayload：半截内容/错误页/缺标记一律拒绝（宁可用内置提示词）', () => {
    // 太短
    assert.equal(parsePromptPayload(payload({ prompt: '太短了' })), null)
    // 长度够但缺少必备标记（例如服务器返回了别的东西）
    assert.equal(parsePromptPayload(payload({ prompt: 'x'.repeat(MIN_PROMPT_LENGTH + 10) })), null)
    // 非 JSON / HTML 错误页
    assert.equal(parsePromptPayload('<html>404</html>'), null)
    assert.equal(parsePromptPayload(''), null)
    assert.equal(parsePromptPayload(null), null)
    // 合法 JSON 但类型不对
    assert.equal(parsePromptPayload('[]'), null)
    assert.equal(parsePromptPayload('{"prompt":123}'), null)
})
test('parsePromptPayload：version/hash/updatedAt 缺失时容忍（只校验提示词本身）', () => {
    const result = parsePromptPayload(payload({ version: undefined, hash: undefined, updatedAt: undefined }))
    assert.equal(result?.prompt, validPrompt)
    assert.equal(result?.version, '')
    assert.equal(result?.hash, '')
})
test('parseCachedPrompt：缓存同样过完整性校验，并带 fetchedAt', () => {
    const cached = parseCachedPrompt(JSON.stringify({ prompt: validPrompt, version: '3.35.3', hash: 'h', updatedAt: '', fetchedAt: 123 }))
    assert.equal(cached?.prompt, validPrompt)
    assert.equal(cached?.fetchedAt, 123)
    // 缓存被写坏（半截内容）时不可用
    assert.equal(parseCachedPrompt(JSON.stringify({ prompt: '半截', fetchedAt: 1 })), null)
    assert.equal(parseCachedPrompt('not json'), null)
    assert.equal(parseCachedPrompt(null), null)
})
test('describePromptSource：一行看清「这次用的是哪一版提示词」', () => {
    const text = describePromptSource('remote', { version: '3.35.4', hash: 'abc123def456', updatedAt: '2026-09-17T08:24:52.564Z' }, 7650)
    assert.match(text, /来源=remote/)
    assert.match(text, /v3\.35\.4/)
    assert.match(text, /#abc123def456/)
    assert.match(text, /7650 字/)
    // 内置兜底时没有版本/哈希
    assert.match(describePromptSource('embedded', null, 7647), /来源=embedded 7647 字/)
    assert.match(describePromptSource('cache', { version: '3.35.3' }, 100), /来源=cache v3\.35\.3/)
})
