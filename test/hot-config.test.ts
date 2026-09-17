import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    parseHotConfigPayload,
    pickStringOverrides,
    pickProviderOverrides,
    readPromptEntry,
    describeHotConfig,
    MAX_OVERRIDE_VALUE_LENGTH
} from '@/shared/hot-config'
import { AI_PROVIDER_CONFIGS, applyProviderOverrides } from '@/shared/ai-providers'
const table = (overrides: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({
    table: 'selectors',
    updatedAt: '2026-09-17T08:24:52.564Z',
    overrides,
    ...extra
})
test('parseHotConfigPayload：合法表解析；表名不匹配/结构非法一律拒绝', () => {
    const payload = parseHotConfigPayload(table({ app: '#app' }), 'selectors')
    assert.deepEqual(payload?.entries, { app: '#app' })
    assert.equal(payload?.updatedAt, '2026-09-17T08:24:52.564Z')
    // table 字段与文件名不一致 → 拒绝（防串文件）
    assert.equal(parseHotConfigPayload(table({ app: '#app' }, { table: 'ai-providers' }), 'selectors'), null)
    // 缺 overrides / overrides 是数组 / 非 JSON
    assert.equal(parseHotConfigPayload(JSON.stringify({ table: 'selectors' }), 'selectors'), null)
    assert.equal(parseHotConfigPayload(table([]), 'selectors'), null)
    assert.equal(parseHotConfigPayload('<html>404</html>', 'selectors'), null)
    assert.equal(parseHotConfigPayload(null, 'selectors'), null)
})
test('pickStringOverrides：只认白名单 key，非字符串/空/超长一律丢弃', () => {
    const entries = {
        app: '#app',
        player: '   #bilibili-player   ',
        notExist: '#whatever',
        empty: '   ',
        wrong: 42,
        tooLong: 'x'.repeat(MAX_OVERRIDE_VALUE_LENGTH + 1)
    }
    const picked = pickStringOverrides(entries, key => key === 'app' || key === 'player' || key === 'empty' || key === 'wrong' || key === 'tooLong')
    assert.deepEqual(picked, { app: '#app', player: '#bilibili-player' })
})
test('pickProviderOverrides：只取白名单 provider 的 baseURL/defaultModel 字符串字段', () => {
    const entries = {
        deepseek: { baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat-v4', name: '改名请求（应忽略）', pricingUrl: 'x' },
        unknownProvider: { baseURL: 'https://evil.example' },
        emptyOverride: {},
        wrongType: { baseURL: 42, defaultModel: null }
    }
    const picked = pickProviderOverrides(entries, key => key === 'deepseek' || key === 'emptyOverride' || key === 'wrongType')
    assert.deepEqual(picked, { deepseek: { baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat-v4' }})
})
test('applyProviderOverrides：就地合并、只认已存在的 provider、返回生效列表', () => {
    const snapshot = { deepseek: { ...AI_PROVIDER_CONFIGS.deepseek }, kimi: { ...AI_PROVIDER_CONFIGS.kimi }}
    try {
        const applied = applyProviderOverrides({
            deepseek: { defaultModel: 'deepseek-chat-v4' },
            kimi: { baseURL: 'https://api.moonshot.cn/v2' },
            notExist: { baseURL: 'https://evil.example' }
        })
        assert.deepEqual(applied.sort(), ['deepseek', 'kimi'])
        assert.equal(AI_PROVIDER_CONFIGS.deepseek.defaultModel, 'deepseek-chat-v4')
        assert.equal(AI_PROVIDER_CONFIGS.kimi.baseURL, 'https://api.moonshot.cn/v2')
        // 未列入白名单的 provider 不会被凭空创建
        assert.equal(AI_PROVIDER_CONFIGS.notExist, undefined)
        // 名称/文档链接等字段不归远端管
        assert.equal(AI_PROVIDER_CONFIGS.deepseek.name, snapshot.deepseek.name)
    } finally {
        AI_PROVIDER_CONFIGS.deepseek = snapshot.deepseek
        AI_PROVIDER_CONFIGS.kimi = snapshot.kimi
    }
})
test('readPromptEntry / describeHotConfig：提示词取值与来源日志', () => {
    assert.equal(readPromptEntry({ prompt: 'abc' }), 'abc')
    assert.equal(readPromptEntry({ prompt: 42 }), '')
    assert.match(describeHotConfig('selectors', 'remote', 3, '2026-09-17T08:24:52.564Z'), /selectors：来源=remote 生效 3 项/)
    assert.match(describeHotConfig('ai-providers', 'none', 0), /来源=none 生效 0 项/)
})
