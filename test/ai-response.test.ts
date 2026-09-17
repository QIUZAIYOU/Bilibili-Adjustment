import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    BASE_RESPONSE_TOKENS,
    THINKING_RESPONSE_TOKENS,
    RETRY_RESPONSE_TOKENS,
    initialResponseTokens,
    retryResponseTokens,
    isTruncatedByLength,
    shouldRetryEmptyResponse,
    describeChatResult
} from '@/utils/ai-response'
import type { ChatResult } from '@/utils/ai-response'
const result = (overrides: Partial<ChatResult> = {}): ChatResult => ({
    content: '',
    finishReason: 'stop',
    usage: null,
    reasoningChars: 0,
    ...overrides
})
test('思考型模型的输出预算必须远大于普通模型（推理与答案共用同一预算）', () => {
    assert.equal(initialResponseTokens(false), BASE_RESPONSE_TOKENS)
    assert.equal(initialResponseTokens(true), THINKING_RESPONSE_TOKENS)
    assert.ok(THINKING_RESPONSE_TOKENS > BASE_RESPONSE_TOKENS * 2, '思考型预算要给推理留出量级空间')
    // 重试预算一律更大（否则重试没有意义）
    assert.ok(retryResponseTokens(false) > BASE_RESPONSE_TOKENS)
    assert.ok(retryResponseTokens(true) > THINKING_RESPONSE_TOKENS)
    assert.equal(retryResponseTokens(true), RETRY_RESPONSE_TOKENS)
})
test('isTruncatedByLength：只认 finish_reason=length', () => {
    assert.equal(isTruncatedByLength(result({ finishReason: 'length' })), true)
    assert.equal(isTruncatedByLength(result({ finishReason: 'stop' })), false)
    assert.equal(isTruncatedByLength(result({ finishReason: '' })), false)
})
test('shouldRetryEmptyResponse：被截断或产生了推理才值得重试（提供方真返回空则不必）', () => {
    // 本次故障形态：内容为空 + 被 length 截断（推理吃满预算）
    assert.equal(shouldRetryEmptyResponse(result({ finishReason: 'length', reasoningChars: 0 })), true)
    // 内容为空但产生了推理（哪怕 finish_reason 不是 length）也要重试
    assert.equal(shouldRetryEmptyResponse(result({ finishReason: 'stop', reasoningChars: 1200 })), true)
    // 既没截断也没推理：重试无意义，直接报错
    assert.equal(shouldRetryEmptyResponse(result({ finishReason: 'stop', reasoningChars: 0 })), false)
})
test('describeChatResult：把 finish_reason / 推理字数 / 用量压成一行，便于「内容为空」时定位', () => {
    const text = describeChatResult(result({
        finishReason: 'length',
        reasoningChars: 3210,
        usage: { prompt: 5120, completion: 2048, reasoning: 1950 }
    }))
    assert.match(text, /finish_reason=length/)
    assert.match(text, /推理内容 3210 字/)
    assert.match(text, /in 5120 \/ out 2048/)
    assert.match(text, /其中推理 1950/)
    // 缺字段时的兜底文案
    assert.match(describeChatResult(result({ finishReason: '' })), /finish_reason=未知/)
    assert.match(describeChatResult(result()), /用量未返回/)
})
