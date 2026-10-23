import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
/**
 * 配置归一化必须落在**写边界**上（2026-10-23 审查发现）
 *
 * 旧实现只在 `getValue` 的「缓存未命中」分支归一化，而 `initializeDefaults` / `setValue`
 * 会把**原始值**灌进内存缓存 —— 于是缓存命中时直接返回原始值，归一化代码永远不执行。
 * 后果：库里的字符串 'false' 被当成 true，开关显示与运行期判断全部反了（issue #27 同类）。
 */
if (!(globalThis.window as unknown as { indexedDB?: unknown }).indexedDB) (globalThis.window as unknown as { indexedDB: unknown }).indexedDB = {}
;(globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = class {
    postMessage (): void {}
    close (): void {}
    addEventListener (): void {}
    removeEventListener (): void {}
}
const { ConfigService } = await import('@/services/config.service')
const { storageService } = await import('@/services/storage.service')
test('setValue：布尔项的字符串值在写库前就归一化', async () => {
    const originalUserSet = storageService.userSet
    const written: Array<[string, unknown]> = []
    storageService.userSet = async (key: string, value: unknown) => { written.push([key, value]) }
    try {
        await ConfigService.setValue('is_vip', 'false')
        assert.deepEqual(written[0], ['is_vip', false], '"false" 必须归一化成布尔 false')
        await ConfigService.setValue('is_vip', 'true')
        assert.deepEqual(written[1], ['is_vip', true], '"true" 必须归一化成布尔 true')
    } finally {
        storageService.userSet = originalUserSet
    }
})
test('setValue：数字项的字符串值在写库前就归一化', async () => {
    const originalUserSet = storageService.userSet
    const written: Array<[string, unknown]> = []
    storageService.userSet = async (key: string, value: unknown) => { written.push([key, value]) }
    try {
        await ConfigService.setValue('offset_top', '72')
        assert.deepEqual(written[0], ['offset_top', 72], `数字项应归一化成 number：${String(written[0]?.[1])}`)
    } finally {
        storageService.userSet = originalUserSet
    }
})
test('setValues：批量写入同样归一化', async () => {
    const originalBatchSet = storageService.userBatchSet
    const written: Array<{ key: string; value: unknown }> = []
    storageService.userBatchSet = async (records: Array<{ key: string; value: unknown }>) => { written.push(...records) }
    try {
        await ConfigService.setValues([
            { key: 'is_vip', value: 'false' },
            { key: 'offset_top', value: '72' }
        ])
        assert.equal(written[0]?.value, false, '布尔项应归一化')
        assert.equal(written[1]?.value, 72, '数字项应归一化')
    } finally {
        storageService.userBatchSet = originalBatchSet
    }
})
test('getValue：读路径也归一化（历史数据 / 跨标签同步过来的字符串值）', async () => {
    const originalUserGet = storageService.userGet
    const originalUserSet = storageService.userSet
    const originalInit = storageService.init
    // Node 环境没有 IndexedDB，初始化直接短路（本用例只验归一化口径）
    storageService.init = async () => {}
    // 用一个本文件里没写过的键，避免命中前面用例留下的缓存
    storageService.userGet = async () => 'false'
    storageService.userSet = async () => {}
    try {
        const value = await ConfigService.getValue('show_comment_location')
        assert.equal(value, false, `读到的应是布尔 false，实际拿到 ${String(value)}（类型 ${typeof value}）`)
    } finally {
        storageService.userGet = originalUserGet
        storageService.userSet = originalUserSet
        storageService.init = originalInit
    }
})
