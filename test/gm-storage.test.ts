import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { installFakeGm, removeFakeGm } from './helpers/fake-gm'
/**
 * GM 存储适配层
 *
 * 覆盖三件事：
 * ① 同步版 / Promise 版两套 GM API 都能用（老管理器只有同步版，新管理器两者都有）
 * ② GM 不可用时明确降级（由 storage.service 回落 IndexedDB）
 * ③ 存储层在 GM 可用时把 user 库路由到 GM 存储
 */
if (!(globalThis.window as unknown as { indexedDB?: unknown }).indexedDB) (globalThis.window as unknown as { indexedDB: unknown }).indexedDB = {}
const fake = installFakeGm('sync')
const { gmStorageService } = await import('@/services/gm-storage.service')
const { storageService } = await import('@/services/storage.service')
test('同步版 GM API：写入 / 读取 / 删除', async () => {
    gmStorageService.reset()
    assert.equal(gmStorageService.available, true, '同步版 GM API 应被识别')
    await gmStorageService.write('theme', 'night')
    const record = await gmStorageService.read('theme')
    assert.equal(record?.v, 'night', '读回的值应是裸值')
    assert.equal(typeof record?.t, 'number', '记录应带写入时间戳')
    await gmStorageService.remove('theme')
    assert.equal(await gmStorageService.read('theme'), null, '删除后应读不到')
})
test('同步版 GM API：批量读写与全量枚举', async () => {
    gmStorageService.reset()
    await gmStorageService.writeMany([
        { key: 'theme', value: 'night' },
        { key: 'is_vip', value: false }
    ])
    const records = await gmStorageService.readAll()
    assert.equal(records.get('theme')?.v, 'night')
    assert.equal(records.get('is_vip')?.v, false)
    assert.equal(records.size, 2, '枚举结果只应包含配置键')
})
test('默认值补齐标记：isDefault 写入的记录带 d 标记', async () => {
    gmStorageService.reset()
    await gmStorageService.write('theme', 'follow', undefined, true)
    const record = await gmStorageService.read('theme')
    assert.equal(record?.d, 1, '默认值补齐必须带 d 标记（迁移裁决靠它让位）')
    await gmStorageService.write('theme', 'night')
    assert.equal((await gmStorageService.read('theme'))?.d, undefined, '用户显式设置不带 d 标记')
})
test('变更监听：别的上下文写入 → 回调收到裸值与键名', async () => {
    gmStorageService.reset()
    const received: Array<{ key: string, value: unknown }> = []
    gmStorageService.watch(['theme'], (key, record) => { received.push({ key, value: record?.v }) })
    fake.remoteSet('adj.cfg.theme', { v: 'night', t: Date.now() })
    assert.equal(received.length, 1, '应当收到一次变更通知')
    assert.equal(received[0]?.key, 'theme', '回调里应还原出去掉前缀的配置键')
    assert.equal(received[0]?.value, 'night')
    gmStorageService.unwatchAll()
})
test('Promise 版 GM API：没有同步版时也能工作', async () => {
    removeFakeGm()
    installFakeGm('promise')
    gmStorageService.reset()
    assert.equal(gmStorageService.available, true, 'Promise 版 GM API 应被识别')
    await gmStorageService.write('theme', 'night')
    assert.equal((await gmStorageService.read('theme'))?.v, 'night')
    const records = await gmStorageService.readAll()
    assert.equal(records.get('theme')?.v, 'night')
})
test('GM 完全不可用：明确降级（存储层回落 IndexedDB）', async () => {
    removeFakeGm()
    gmStorageService.reset()
    assert.equal(gmStorageService.available, false, '没有 GM API 时应判定为不可用')
    assert.equal(await gmStorageService.read('theme'), null)
    await gmStorageService.write('theme', 'night')
    assert.equal(await gmStorageService.read('theme'), null, '不可用时写入应为空操作')
})
test('存储层路由：GM 可用时 user 库的读写走 GM 存储', async () => {
    removeFakeGm()
    installFakeGm('sync')
    gmStorageService.reset()
    await storageService.userSet('theme', 'night')
    assert.equal(fake.values.get('adj.cfg.theme')?.v, 'night', '写入应落到 GM 存储')
    assert.equal(await storageService.userGet('theme'), 'night')
    const all = await storageService.getAll('user') as Record<string, unknown>
    assert.equal(all.theme, 'night', 'getAll 应返回裸值映射')
    await storageService.userRemove('theme')
    assert.equal(await storageService.userGet('theme'), undefined)
})
test('存储层路由：GM 不可用时 user 库回落 IndexedDB', async () => {
    removeFakeGm()
    gmStorageService.reset()
    const originalUserSet = storageService.userSet
    const originalUserGet = storageService.userGet
    const written: Array<[string, unknown]> = []
    storageService.userSet = async (key: string, value: unknown) => { written.push([key, value]) }
    storageService.userGet = async () => 'from-indexeddb'
    try {
        await storageService.userSet('theme', 'night')
        assert.deepEqual(written[0], ['theme', 'night'])
        assert.equal(await storageService.userGet('theme'), 'from-indexeddb')
    } finally {
        storageService.userSet = originalUserSet
        storageService.userGet = originalUserGet
    }
})
