import { test, after } from 'node:test'
import assert from 'node:assert/strict'
// storage.service 构造时会检查 window.indexedDB：Node 环境先补最小 stub
globalThis.window = globalThis.window || {}
if (!globalThis.window.indexedDB) globalThis.window.indexedDB = {}
const { ConfigService } = await import('@/services/config.service')
const { storageService } = await import('@/services/storage.service')
// BroadcastChannel 会保持 Node 事件循环活跃：测试结束显式关闭，避免测试进程挂起
after(() => ConfigService.closeSyncChannel())
/** 以内存对象替换存储层，并记录所有写入（用于断言「读不写库」） */
const stubStorage = (stored = {}) => {
    const writes = []
    storageService.init = async () => {}
    storageService.userGet = async key => (key in stored ? stored[key] : null)
    storageService.userBatchGet = async keys => {
        const result = {}
        for (const key of keys || []) {
            if (key in stored) result[key] = stored[key]
        }
        return result
    }
    storageService.userSet = async (key, value) => {
        writes.push([key, value])
        stored[key] = value
    }
    storageService.userBatchSet = async entries => {
        for (const { key, value } of entries || []) {
            writes.push([key, value])
            stored[key] = value
        }
        return (entries || []).length
    }
    storageService.userRemove = async key => {
        delete stored[key]
    }
    return writes
}
// ============ P0-3：读配置不写库 ============
test('getValue：缺失配置返回 schema 默认值且不产生任何写入', async () => {
    const writes = stubStorage()
    await ConfigService.initialize()
    const theme = await ConfigService.getValue('theme')
    assert.equal(theme, 'follow')
    const isVip = await ConfigService.getValue('is_vip')
    assert.equal(isVip, true)
    assert.equal(writes.length, 0, 'getValue 不得写入存储')
})
test('getValue：已存值优先于默认值，且二次读取走内存缓存', async () => {
    // 上一个用例已把 theme 默认值放入内存缓存，这里先清掉以验证「存储值优先」
    await ConfigService.removeValue('theme')
    const writes = stubStorage({ theme: 'night' })
    const first = await ConfigService.getValue('theme')
    const second = await ConfigService.getValue('theme')
    assert.equal(first, 'night')
    assert.equal(second, 'night')
    assert.equal(writes.length, 0)
})
// ============ P0-3：批量初始化 ============
test('initializeDefaults：缺失项批量写入，已有项不覆盖', async () => {
    const stored = { theme: 'night' }
    const writes = stubStorage(stored)
    await ConfigService.initializeDefaults()
    const writtenKeys = writes.map(([key]) => key)
    assert.ok(writtenKeys.length > 0, '应补齐缺失的默认值')
    assert.ok(!writtenKeys.includes('theme'), '已存在的配置不应被默认值覆盖')
    assert.equal(stored.theme, 'night')
})
test('setValues：批量写入并更新缓存', async () => {
    const writes = stubStorage()
    const count = await ConfigService.setValues([{ key: 'theme', value: 'night' }, { key: 'is_vip', value: false }])
    assert.equal(count, 2)
    assert.deepEqual(writes.map(([key]) => key).sort(), ['is_vip', 'theme'])
    assert.equal(await ConfigService.getValue('theme'), 'night')
})
test('setValue：单值写入并进入缓存', async () => {
    const writes = stubStorage()
    await ConfigService.setValue('is_vip', false)
    assert.deepEqual(writes, [['is_vip', false]])
    assert.equal(await ConfigService.getValue('is_vip'), false)
})
