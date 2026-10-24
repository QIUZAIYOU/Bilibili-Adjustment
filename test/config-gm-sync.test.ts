import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { installFakeGm, removeFakeGm } from './helpers/fake-gm'
/**
 * 配置服务与 GM 存储的衔接
 *
 * 覆盖两件事：
 * ① 迁移：IndexedDB（按源隔离）里的「用户显式设置」被搬进 GM 存储（脚本级，全局一份），
 *    而各源库里的默认值与未知键不搬（否则会把用户在 www 的设置盖回默认值）。
 * ② 跨源同步：别的源（space / search）改了配置 → 本页广播 CONFIG_CHANGED，主题、预览开关即时生效。
 */
if (!(globalThis.window as unknown as { indexedDB?: unknown }).indexedDB) (globalThis.window as unknown as { indexedDB: unknown }).indexedDB = {}
const fake = installFakeGm('sync')
const { ConfigService } = await import('@/services/config.service')
const { storageService } = await import('@/services/storage.service')
const { gmStorageService } = await import('@/services/gm-storage.service')
const { eventBus } = await import('@/core/event-bus')
after(() => {
    ConfigService.closeSyncChannel()
    removeFakeGm()
})
/** 模拟「本源」的旧库内容：显式设置 2 项、默认值 1 项、未知键 1 项 */
const legacyEntries = [
    { key: 'theme', value: 'night', timestamp: 1000 },
    { key: 'home_video_preview', value: true, timestamp: 2000 },
    { key: 'offset_top', value: 5, timestamp: 3000 },
    { key: 'auto_check_update', value: false, timestamp: 4000 }
]
const markers: Array<[string, unknown]> = []
storageService.init = async () => {}
storageService.legacyUserEntries = async () => legacyEntries
storageService.legacyUserSet = async (key: string, value: unknown) => { markers.push([key, value]) }
storageService.legacyUserGet = async () => undefined
test('迁移：用户显式设置写进 GM 存储，默认值与未知键不搬', async () => {
    await ConfigService.initialize()
    assert.equal((await gmStorageService.read('theme'))?.v, 'night', '用户显式设的主题应迁入 GM 存储')
    assert.equal((await gmStorageService.read('home_video_preview'))?.v, true, '预览开关应迁入 GM 存储')
    assert.equal(await gmStorageService.read('offset_top'), null, '等于默认值的键不该迁')
    assert.equal(await gmStorageService.read('auto_check_update'), null, '已废弃的未知键不该迁')
    assert.equal(markers.length, 1, '幂等标记应写一次')
    assert.equal(markers[0]?.[0], 'adj.meta.migrated')
})
test('迁移后：配置写入直接落 GM 存储（不再写 IndexedDB）', async () => {
    await ConfigService.setValue('webfull_unlock', true)
    assert.equal((await gmStorageService.read('webfull_unlock'))?.v, true, '写入应落到 GM 存储')
})
test('跨源同步：别的源改了配置 → 广播 CONFIG_CHANGED（主题/预览开关即时生效的支点）', async () => {
    const received: Array<{ key?: string, value?: unknown }> = []
    const off = eventBus.on('config:changed', (_ctx, payload) => {
        received.push(payload as { key?: string, value?: unknown })
    })
    // 模拟 space.bilibili.com 的标签页改了「调试日志」开关
    fake.remoteSet('adj.cfg.log_level_debug', { v: true, t: Date.now() })
    await new Promise(resolve => setTimeout(resolve, 0))
    off()
    assert.equal(received.length, 1, '应当收到一次跨源变更通知')
    assert.equal(received[0]?.key, 'log_level_debug')
    assert.equal(received[0]?.value, true)
})
