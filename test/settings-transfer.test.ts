import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    parseSettingsPayload,
    splitKnownEntries,
    buildSettingsExportPayload,
    formatImportSummary,
    formatLocalDateStamp,
    MAX_IMPORT_ENTRIES
} from '@/utils/settings-transfer'
test('parseSettingsPayload：新版 {key: value} 格式原样取出', () => {
    const parsed = parseSettingsPayload(JSON.stringify({ theme: 'night', auto_subtitle: true }))
    assert.equal(parsed.malformed, false)
    assert.equal(parsed.tooLarge, false)
    assert.deepEqual(parsed.entries, [
        { key: 'theme', value: 'night' },
        { key: 'auto_subtitle', value: true }
    ])
})
test('parseSettingsPayload：旧版 [{key, value, timestamp}] 格式兼容', () => {
    const parsed = parseSettingsPayload(JSON.stringify([{ key: 'theme', value: 'light', timestamp: 1700000000000 }]))
    assert.equal(parsed.malformed, false)
    assert.deepEqual(parsed.entries, [{ key: 'theme', value: 'light' }])
})
test('parseSettingsPayload：JSON 非法 / 顶层不是对象 → malformed', () => {
    assert.equal(parseSettingsPayload('{ not json').malformed, true)
    assert.equal(parseSettingsPayload('123').malformed, true)
    assert.equal(parseSettingsPayload('"text"').malformed, true)
    assert.equal(parseSettingsPayload('null').malformed, true)
})
test('parseSettingsPayload：键去重，空白与非字符串键剔除', () => {
    // 重复键在 JSON 里合法（后者覆盖前者），这里用 raw 字符串构造真实文件里会出现的形态
    const parsed = parseSettingsPayload('{"a": 1, "a": 2, "  ": 3, "b": 4}')
    assert.deepEqual(parsed.entries, [
        { key: 'a', value: 2 },
        { key: 'b', value: 4 }
    ])
})
test('parseSettingsPayload：条目数超上限判定为异常文件', () => {
    const huge: Record<string, number> = {}
    for (let i = 0; i <= MAX_IMPORT_ENTRIES; i++) huge[`key_${i}`] = i
    const parsed = parseSettingsPayload(JSON.stringify(huge))
    assert.equal(parsed.tooLarge, true)
    assert.equal(parsed.entries.length, 0)
})
test('splitKnownEntries：已知键与未知键分开，未知键单独列出', () => {
    const entries = [
        { key: 'theme', value: 'night' },
        { key: 'future_option', value: 1 }
    ]
    const { knownEntries, unknownKeys } = splitKnownEntries(entries, ['theme', 'auto_subtitle'])
    assert.deepEqual(knownEntries, [{ key: 'theme', value: 'night' }])
    assert.deepEqual(unknownKeys, ['future_option'])
})
test('buildSettingsExportPayload：已存值覆盖默认值，缺值回落默认值', () => {
    const payload = buildSettingsExportPayload({ theme: 'night', log_level_debug: null }, [
        ['theme', 'follow'],
        ['auto_subtitle', false]
    ])
    assert.deepEqual(payload, {
        theme: 'night',
        auto_subtitle: false
    })
})
test('buildSettingsExportPayload：只导出 schema 里的键（与导入白名单对称）', () => {
    const payload = buildSettingsExportPayload({ theme: 'night', stale_key: 'x' }, [['theme', 'follow']])
    assert.deepEqual(Object.keys(payload), ['theme'])
})
test('buildSettingsExportPayload：已存值为 undefined/null 视为没存过', () => {
    const payload = buildSettingsExportPayload({ a: undefined, b: null }, [['a', 1], ['b', 2]])
    assert.deepEqual(payload, { a: 1, b: 2 })
})
test('formatImportSummary：无未知键时只报成功项数', () => {
    assert.equal(formatImportSummary(45, []), '成功导入 45 项配置')
})
test('formatImportSummary：未知键要说清数量与键名（不静默丢数据）', () => {
    const message = formatImportSummary(45, ['future_a', 'future_b'])
    assert.match(message, /成功导入 45 项配置/)
    assert.match(message, /2 项当前版本不识别/)
    assert.match(message, /future_a、future_b/)
})
test('formatLocalDateStamp：用本地日期，不用 UTC 日期', () => {
    assert.equal(formatLocalDateStamp(new Date(2026, 9, 23, 0, 30)), '2026-10-23')
    assert.equal(formatLocalDateStamp(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})
