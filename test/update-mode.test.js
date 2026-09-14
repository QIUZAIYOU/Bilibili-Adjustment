import { test, after } from 'node:test'
import assert from 'node:assert/strict'
// storage.service 构造时会检查 window.indexedDB：Node 环境先补最小 stub
globalThis.window = globalThis.window || {}
if (!globalThis.window.indexedDB) globalThis.window.indexedDB = {}
const { ConfigService } = await import('@/services/config.service')
const { videoSettingsConfig, dynamicSettingsConfig } = await import('@/config/settings-config')
// BroadcastChannel 会保持 Node 事件循环活跃：测试结束显式关闭，避免测试进程挂起
after(() => ConfigService.closeSyncChannel())
// issue #27 的根治方案：把语义重叠的 4 个更新开关一刀切为单个「更新方式」radio。
// 这里锁住这个决定，防止以后有人再把独立开关加回来。
const allSchema = () => [...videoSettingsConfig, ...dynamicSettingsConfig]
const collectIds = items => {
    const ids = []
    for (const item of items) {
        if (item.id) ids.push(item.id)
        if (item.children?.length) ids.push(...collectIds(item.children))
        if (item.items?.length) ids.push(...collectIds(item.items))
    }
    return ids
}
const findItem = items => {
    for (const item of items) {
        if (item.id === 'update_mode') return item
        const fromChildren = item.children?.length ? findItem(item.children) : null
        if (fromChildren) return fromChildren
        const fromItems = item.items?.length ? findItem(item.items) : null
        if (fromItems) return fromItems
    }
    return null
}
test('更新设置已简化为单个 update_mode 开关', () => {
    assert.equal(ConfigService.DEFAULT_VALUES.get('update_mode'), 'auto')
    const ids = collectIds(allSchema())
    for (const legacy of ['auto_check_update', 'update_check_frequency', 'auto_update', 'skip_update_check']) {
        assert.equal(ConfigService.DEFAULT_VALUES.has(legacy), false, `${legacy} 应已从默认值移除`)
        assert.equal(ids.includes(legacy), false, `${legacy} 不应再出现在 schema 中`)
    }
})
test('update_mode 为 radio，含 auto / manual 两个选项', () => {
    const item = findItem(allSchema())
    assert.ok(item, 'update_mode 应存在于 schema')
    assert.equal(item.type, 'radio')
    assert.deepEqual((item.options ?? []).map(option => option.value), ['auto', 'manual'])
})
