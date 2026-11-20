/**
 * ScriptCat「用户配置」↔ 项目配置 双向桥
 *
 * ScriptCat 会从脚本头的 ==UserConfig== 生成设置表单，值存在 GM 里，键为 `分组.设置项`；
 * 本项目的配置存在 `adj.cfg.<设置项>`。两边必须保持同步，否则用户在脚本猫里改了设置，
 * 打开 B 站行为却不变（或反过来：网页里改了，脚本猫里还是旧值）。
 *
 * 同步口径：
 * - 启动时逐项对账：脚本猫有值且「本机没存过」或「脚本猫值不是默认值」→ 采纳脚本猫；
 *   其余情况把本机值回写脚本猫（防止脚本猫面板停在默认值）。
 * - 运行期：脚本猫侧变更（remote）→ 写入本机配置；本机配置变更 → 回写脚本猫。
 * - select/radio 在脚本猫面板里显示并保存 label，这里负责 label ↔ 内部值互转。
 */
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
import { EVENT_NAMES } from '@/shared/constants'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import { resolveUserConfigGroup } from '@/config/userconfig-groups'
import type { SettingItemSchema } from '@/config/settings-config'
import { toScriptCatValue, fromScriptCatValue } from '@/utils/scriptcat-config-map'
const logger = new LoggerService('ScriptCatConfig', { notify: false })
interface ScEntry {
    /** ScriptCat 的 GM 键：分组.设置项 */
    key: string
    id: string
    item: SettingItemSchema
    defaultValue: unknown
}
type GmApi = {
    GM_getValue?: (key: string) => unknown
    GM_setValue?: (key: string, value: unknown) => void
    GM_addValueChangeListener?: (key: string, handler: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) => number
}
const gmApi = globalThis as unknown as GmApi
const hasGm = (): boolean => typeof gmApi.GM_getValue === 'function' && typeof gmApi.GM_setValue === 'function'
const flattenItems = (items: SettingItemSchema[] | undefined, out: SettingItemSchema[]): SettingItemSchema[] => {
    for (const item of items || []) {
        if (!item || item.type === 'section') continue
        out.push(item)
        if (Array.isArray(item.children)) flattenItems(item.children, out)
    }
    return out
}
const buildEntries = (): ScEntry[] => {
    const entries: ScEntry[] = []
    for (const schema of [videoSettingsConfig, dynamicSettingsConfig]) {
        for (const section of schema) {
            if (!section || section.type !== 'section') continue
            const group = resolveUserConfigGroup(String(section.id), String(section.label || section.id))
            for (const item of flattenItems(section.items, [])) {
                entries.push({
                    key: `${group}.${item.id}`,
                    id: item.id,
                    item,
                    defaultValue: typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue
                })
            }
        }
    }
    return entries.filter(entry => !entry.id.startsWith('__'))
}
const ENTRIES = buildEntries()
const ENTRY_BY_ID = new Map(ENTRIES.map(entry => [entry.id, entry]))
const sameValue = (a: unknown, b: unknown): boolean => String(a) === String(b)
/** 上次同步后脚本猫面板里的值快照：只有「和快照不同」才视为用户在脚本猫里主动改了 */
const SCRIPT_CAT_BASE_KEY = 'adj.sc.base'
let syncBase: Record<string, unknown> = {}
const readSyncBase = (): Record<string, unknown> => {
    try {
        const raw = gmApi.GM_getValue?.(SCRIPT_CAT_BASE_KEY)
        return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    } catch {
        return {}
    }
}
const writeSyncBase = (): void => {
    try {
        gmApi.GM_setValue?.(SCRIPT_CAT_BASE_KEY, syncBase)
    } catch { /* 忽略 */ }
}
let applyingFromScriptCat = false
let started = false
/** 启动时对账一次；幂等，重复调用只跑一次 */
export const syncConfigFromScriptCat = async (): Promise<void> => {
    if (started || !hasGm()) return
    started = true
    syncBase = readSyncBase()
    const updates: Array<{ key: string, value: unknown }> = []
    const mirror: Array<{ key: string, value: unknown }> = []
    for (const entry of ENTRIES) {
        let raw: unknown
        try {
            raw = gmApi.GM_getValue!(entry.key)
        } catch {
            continue
        }
        const current = await ConfigService.getValue(entry.id)
        if (raw === undefined) {
            // 脚本猫还没有这条值：把本机值灌过去，打开面板即所见即所得
            const uiValue = toScriptCatValue(entry.item, current)
            mirror.push({ key: entry.key, value: uiValue })
            syncBase[entry.id] = uiValue
            continue
        }
        const next = fromScriptCatValue(entry.item, raw)
        if (next === undefined) continue
        const previous = syncBase[entry.id]
        let adopt = false
        if (previous !== undefined) {
            // 快照存在：只有脚本猫侧与快照不同，才说明用户刚在脚本猫里改过
            adopt = !sameValue(raw, previous)
        } else {
            // 首次桥接：脚本猫默认值不能覆盖本机已有配置，只有脚本猫值不是默认值才采纳
            const stored = await storageService.userGet(entry.id)
            const neverStored = stored === undefined || stored === null
            const scriptCatIsDefault = sameValue(next, entry.defaultValue)
            adopt = !sameValue(current, next) && (neverStored || !scriptCatIsDefault)
        }
        if (adopt && !sameValue(current, next)) {
            updates.push({ key: entry.id, value: next })
            syncBase[entry.id] = toScriptCatValue(entry.item, next)
            continue
        }
        const uiValue = toScriptCatValue(entry.item, current)
        mirror.push({ key: entry.key, value: uiValue })
        syncBase[entry.id] = uiValue
    }
    if (updates.length) {
        try {
            await ConfigService.setValues(updates)
            logger.info('脚本猫用户配置丨已采纳脚本猫设置', `${updates.length} 项`)
        } catch (error) {
            logger.warn('脚本猫用户配置丨写入本机配置失败', error instanceof Error ? error.message : error)
        }
    }
    for (const item of mirror) {
        try {
            gmApi.GM_setValue!(item.key, item.value)
        } catch { /* 单个写失败不阻塞其它项 */ }
    }
    writeSyncBase()
    // 运行期双向同步
    eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, ...args: unknown[]) => {
        if (applyingFromScriptCat) return
        const changed = (args[0] ?? {}) as { key?: string, value?: unknown }
        if (!changed.key) return
        const entry = ENTRY_BY_ID.get(changed.key)
        if (!entry || !hasGm()) return
        try {
            const uiValue = toScriptCatValue(entry.item, changed.value)
            gmApi.GM_setValue!(entry.key, uiValue)
            syncBase[entry.id] = uiValue
            writeSyncBase()
        } catch { /* 忽略 */ }
    })
    if (typeof gmApi.GM_addValueChangeListener === 'function') {
        for (const entry of ENTRIES) {
            try {
                gmApi.GM_addValueChangeListener(entry.key, (_key, _oldValue, newValue, remote) => {
                    if (!remote) return
                    const next = fromScriptCatValue(entry.item, newValue)
                    if (next === undefined) return
                    syncBase[entry.id] = newValue
                    writeSyncBase()
                    void (async (): Promise<void> => {
                        const current = await ConfigService.getValue(entry.id)
                        if (sameValue(current, next)) return
                        applyingFromScriptCat = true
                        try {
                            await ConfigService.setValue(entry.id, next)
                        } catch (error) {
                            logger.warn('脚本猫用户配置丨应用失败', entry.id, error instanceof Error ? error.message : error)
                        } finally {
                            applyingFromScriptCat = false
                        }
                    })()
                })
            } catch { /* 某些管理器不支持监听，忽略 */ }
        }
    }
    logger.debug('脚本猫用户配置丨桥接就绪', `${ENTRIES.length} 项`)
}
