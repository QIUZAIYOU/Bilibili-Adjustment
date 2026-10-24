import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planConfigMigration } from '@/utils/config-migration'
import { normalizeConfigValue } from '@/config/config-normalize'
import type { GmConfigRecord } from '@/services/gm-storage.service'
/**
 * 配置迁移合并规则（IndexedDB → GM 存储）
 *
 * 核心诉求：**默认值让位、用户设置上位**。
 * search / space 的库里只有 initializeDefaults 写进去的默认值（它们没有设置入口），
 * 若不区分「默认值」与「用户设置」，迁移会把用户在 www 设的主题/预览开关盖回默认值。
 */
const defaults = new Map<string, unknown>([
    ['theme', 'follow'],
    ['is_vip', true],
    ['home_video_preview', false],
    ['offset_top', 72]
])
const remote = (entries: Array<[string, GmConfigRecord]>): Map<string, GmConfigRecord> => new Map(entries)
const plan = (
    local: Array<{ key: string, value: unknown, timestamp: number }>,
    remoteRecords: Map<string, GmConfigRecord> = new Map()
): ReturnType<typeof planConfigMigration> => planConfigMigration(local, remoteRecords, defaults, normalizeConfigValue)
test('默认值让位：本地值等于默认值 → 不写入（search/space 的默认值不能盖掉 www 的设置）', () => {
    const result = plan([{ key: 'theme', value: 'follow', timestamp: 1000 }])
    assert.equal(result.writes.length, 0, '等于默认值的键不该被写入')
    assert.equal(result.skips[0]?.reason, 'default-value')
})
test('用户设置上位：本地值与默认值不同 → 写入', () => {
    const result = plan([{ key: 'theme', value: 'night', timestamp: 1000 }])
    assert.equal(result.writes.length, 1)
    assert.deepEqual(result.writes[0], { key: 'theme', value: 'night', timestamp: 1000 })
})
test('未知键不搬：不在 schema 默认值表里的键（历史遗留 / 内部标记）不迁', () => {
    const result = plan([
        { key: 'auto_check_update', value: false, timestamp: 1000 },
        { key: 'adj.meta.migrated', value: 123, timestamp: 1000 }
    ])
    assert.equal(result.writes.length, 0)
    assert.equal(result.skips.length, 2)
    assert.ok(result.skips.every(item => item.reason === 'unknown-key'))
})
test('冲突裁决：远端是显式值且更新 → 本地跳过', () => {
    const result = plan(
        [{ key: 'theme', value: 'night', timestamp: 1000 }],
        remote([['theme', { v: 'follow', t: 2000 }]])
    )
    assert.equal(result.writes.length, 0)
    assert.equal(result.skips[0]?.reason, 'remote-newer')
})
test('冲突裁决：远端更旧 → 本地写入', () => {
    const result = plan(
        [{ key: 'theme', value: 'night', timestamp: 3000 }],
        remote([['theme', { v: 'follow', t: 2000 }]])
    )
    assert.equal(result.writes.length, 1)
    assert.equal(result.writes[0]?.value, 'night')
})
test('冲突裁决：远端是「默认值补齐」（d 标记）→ 本地显式值无条件赢', () => {
    // 默认值补齐发生在迁移之后、时间戳必然更新，不加这条用户设置会被默认值压掉
    const result = plan(
        [{ key: 'theme', value: 'night', timestamp: 1000 }],
        remote([['theme', { v: 'follow', t: 999999, d: 1 }]])
    )
    assert.equal(result.writes.length, 1, '默认值补齐不能盖掉用户显式设置')
    assert.equal(result.writes[0]?.value, 'night')
})
test('冲突裁决：远端同值 → 跳过（不重复写）', () => {
    const result = plan(
        [{ key: 'theme', value: 'night', timestamp: 1000 }],
        remote([['theme', { v: 'night', t: 500 }]])
    )
    assert.equal(result.writes.length, 0)
    assert.equal(result.skips[0]?.reason, 'same-value')
})
test('归一化后再判断：本地存的是字符串 "false"（历史数据）→ 归一化成 false 并写入', () => {
    const result = plan([{ key: 'is_vip', value: 'false', timestamp: 1000 }])
    assert.equal(result.writes.length, 1)
    assert.equal(result.writes[0]?.value, false, '字符串 "false" 必须归一化成布尔 false')
})
test('归一化后再判断：字符串 "true" 与默认 true 相同 → 视为没改过，不写入', () => {
    const result = plan([{ key: 'is_vip', value: 'true', timestamp: 1000 }])
    assert.equal(result.writes.length, 0)
})
test('未设置（null/undefined）视为没存过 → 不写入', () => {
    const result = plan([
        { key: 'theme', value: null, timestamp: 1000 },
        { key: 'offset_top', value: undefined, timestamp: 1000 }
    ])
    assert.equal(result.writes.length, 0)
})
