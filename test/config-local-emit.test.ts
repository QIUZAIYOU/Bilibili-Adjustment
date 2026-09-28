import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
// storage.service / config.service 构造与初始化会碰 indexedDB：Node 环境先补最小 stub
if (!(globalThis.window as unknown as { indexedDB?: unknown }).indexedDB) (globalThis.window as unknown as { indexedDB: unknown }).indexedDB = {}
// Node 的 BroadcastChannel 会一直占着事件循环（node:test 跑完也不退出）：本用例只验事件契约，换空实现
;(globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = class {
    postMessage (): void {}
    close (): void {}
    addEventListener (): void {}
    removeEventListener (): void {}
}
const { ConfigService } = await import('@/services/config.service')
const { storageService } = await import('@/services/storage.service')
const { eventBus } = await import('@/core/event-bus')
const { EVENT_NAMES } = await import('@/shared/constants')
/**
 * 本地写入广播契约（2026-09-24）
 *
 * `ConfigService.setValue` 只对**运行时即时生效项**在本页广播 `config:changed`
 * （其余键靠 BroadcastChannel 跨标签同步，本页不需要立刻反应）。
 * 首页视频预览开关依赖这条契约：在首页设置面板里一开，预览按钮就要立刻出现，不能等刷新。
 */
test('setValue 对「运行时即时生效项」在本页广播 config:changed', async () => {
    // 不落库：本用例只验证事件契约，避免依赖真实 IndexedDB
    const originalUserSet = storageService.userSet
    storageService.userSet = async () => {}
    const seen: string[] = []
    const unsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, ...args: unknown[]) => {
        const { key } = (args[0] ?? {}) as { key?: string }
        if (key) seen.push(key)
    })
    try {
        await ConfigService.setValue('home_video_preview', true)
        assert.deepEqual(seen, ['home_video_preview'], '首页视频预览开关应立刻广播（首页据此即时加/移按钮）')
        seen.length = 0
        await ConfigService.setValue('theme', 'night')
        assert.deepEqual(seen, ['theme'], '主题也要立刻广播（主题即时切换依赖它）')
        seen.length = 0
        await ConfigService.setValue('is_vip', true)
        assert.deepEqual(seen, [], '不在白名单里的键不广播（本页不需要即时反应，避免无谓的全局事件）')
    } finally {
        unsubscribe()
        storageService.userSet = originalUserSet
    }
})
