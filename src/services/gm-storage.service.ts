/**
 * GM 存储适配层（脚本管理器提供的 GM_* API）
 *
 * 为什么需要它：IndexedDB 是**按源隔离**的 —— www.bilibili.com / t.bilibili.com /
 * search.bilibili.com / space.bilibili.com 各有一份同名库 BilibiliAdjustmentUserConfigs。
 * 而 GM 存储是**脚本级**的：一份数据被脚本匹配到的所有页面共享。
 * 迁到 GM 存储后，用户在 www 设一次「视频卡片预览」「界面主题」，
 * 搜索页/空间页/动态页立刻就是同一份配置（且跨源实时生效）。
 *
 * 存储格式：每个配置键在 GM 里存 `{ v: 裸值, t: 写入时间戳, d?: 1 }`
 *   - v：与 IndexedDB 里存的值同构（导出/导入无需转换）
 *   - t：毫秒时间戳 —— 迁移期「同一键多源冲突」靠它裁决（后改的赢）
 *   - d：标记「这条是默认值补齐，不是用户显式设置」。
 *     默认值补齐发生在迁移之后，写入时间必然更新；不标记的话，
 *     迁移时「用户显式设置」会被「默认补齐」按时间戳压掉（night 被 follow 盖回去）。
 *
 * 兼容性：优先用同步版 GM_getValue/GM_setValue/...（油猴 v4/v5、ScriptCat、Violentmonkey 全都提供），
 * 没有则回落 Promise 版 GM.getValue/GM.setValue/...；两套都没有时本模块视为不可用，
 * 由 storage.service 继续走 IndexedDB（老管理器不丢配置）。
 */
const CONFIG_KEY_PREFIX = 'adj.cfg.'
/** GM 里单条配置记录的存储结构 */
export interface GmConfigRecord {
    /** 裸值（与 IndexedDB 里存的一致） */
    v: unknown
    /** 写入时间戳（毫秒） */
    t: number
    /** 1 = 这条是默认值补齐，不是用户显式设置 */
    d?: 1
}
/** 变更回调（key 为去掉前缀的配置键） */
export type GmRecordChangeHandler = (key: string, record: GmConfigRecord | null) => void
interface GmListener {
    (name: string, oldValue: unknown, newValue: unknown, remote: boolean): void
}
interface GmRawApi {
    get: (key: string) => unknown
    set: (key: string, value: unknown) => unknown
    remove: (key: string) => unknown
    list: () => unknown
    getMany: (keys: string[]) => unknown
    setMany: (values: Record<string, unknown>) => unknown
    addListener: (key: string, handler: GmListener) => unknown
    removeListener: (id: unknown) => void
}
interface GmGlobalScope {
    GM_getValue?: (key: string, def?: unknown) => unknown
    GM_setValue?: (key: string, value: unknown) => unknown
    GM_deleteValue?: (key: string) => unknown
    GM_listValues?: () => unknown
    GM_getValues?: (keys?: string[]) => unknown
    GM_setValues?: (values: Record<string, unknown>) => unknown
    GM_addValueChangeListener?: (key: string, handler: GmListener) => unknown
    GM_removeValueChangeListener?: (id: unknown) => void
    GM?: {
        getValue?: (key: string, def?: unknown) => unknown
        setValue?: (key: string, value: unknown) => unknown
        deleteValue?: (key: string) => unknown
        listValues?: () => unknown
        getValues?: (keys?: string[]) => unknown
        setValues?: (values: Record<string, unknown>) => unknown
        addValueChangeListener?: (key: string, handler: GmListener) => unknown
        removeValueChangeListener?: (id: unknown) => void
    }
}
export class GmStorageService {
    /** 探测结果缓存（undefined = 未探测） */
    #api: GmRawApi | null | undefined
    /** 配置键 → GM 监听器 id */
    #listenerIds = new Map<string, unknown>()
    /** 变更回调集合 */
    #handlers = new Set<GmRecordChangeHandler>()
    /**
     * 探测可用的 GM API
     * 同步版优先：兼容性最好（油猴 v4/v5、ScriptCat、Violentmonkey 全都提供），
     * 且配置数据量极小（几十个标量），同步读取无性能问题。
     */
    #resolveApi (): GmRawApi | null {
        if (this.#api !== undefined) return this.#api
        const g = globalThis as unknown as GmGlobalScope
        let api: GmRawApi | null = null
        if (typeof g.GM_getValue === 'function' && typeof g.GM_setValue === 'function') {
            api = {
                get: key => g.GM_getValue!(key),
                set: (key, value) => g.GM_setValue!(key, value),
                remove: key => g.GM_deleteValue?.(key),
                list: () => g.GM_listValues?.() ?? [],
                // GM_getValues 缺失时退回逐键读（老管理器只提供基础 API）
                getMany: keys => {
                    if (typeof g.GM_getValues === 'function') return g.GM_getValues(keys)
                    const out: Record<string, unknown> = {}
                    for (const key of keys) out[key] = g.GM_getValue!(key)
                    return out
                },
                setMany: values => g.GM_setValues?.(values),
                addListener: (key, handler) => g.GM_addValueChangeListener?.(key, handler),
                removeListener: id => { g.GM_removeValueChangeListener?.(id) }
            }
        } else if (g.GM && typeof g.GM.getValue === 'function' && typeof g.GM.setValue === 'function') {
            const gm = g.GM
            api = {
                get: key => gm.getValue!(key),
                set: (key, value) => gm.setValue!(key, value),
                remove: key => gm.deleteValue?.(key),
                list: () => gm.listValues?.() ?? [],
                getMany: keys => {
                    if (typeof gm.getValues === 'function') return gm.getValues(keys)
                    const out: Record<string, unknown> = {}
                    for (const key of keys) out[key] = gm.getValue!(key)
                    return out
                },
                setMany: values => gm.setValues?.(values),
                addListener: (key, handler) => gm.addValueChangeListener?.(key, handler),
                removeListener: id => { gm.removeValueChangeListener?.(id) }
            }
        }
        this.#api = api
        return api
    }
    /** GM 存储是否可用（不可用时 storage.service 回落 IndexedDB） */
    get available (): boolean {
        return this.#resolveApi() !== null
    }
    /** 拆包：GM 里存的是 {v,t,d?}，裸值形态（手工写入/旧数据）也兼容 */
    #unwrap (raw: unknown): GmConfigRecord | null {
        if (raw === null || raw === undefined) return null
        if (typeof raw === 'object') {
            const record = raw as Partial<GmConfigRecord>
            if ('v' in record) {
                return {
                    v: record.v,
                    t: typeof record.t === 'number' ? record.t : 0,
                    d: record.d === 1 ? 1 : undefined
                }
            }
        }
        // 裸值：没有时间戳，按最早处理（任何显式值都能盖过它）
        return { v: raw, t: 0 }
    }
    /** 读取一条配置记录（不存在返回 null） */
    async read (key: string): Promise<GmConfigRecord | null> {
        const api = this.#resolveApi()
        if (!api) return null
        const raw = await api.get(CONFIG_KEY_PREFIX + key)
        return this.#unwrap(raw)
    }
    /** 读取多条配置记录（键 → 记录） */
    async readMany (keys: string[]): Promise<Map<string, GmConfigRecord>> {
        const result = new Map<string, GmConfigRecord>()
        const api = this.#resolveApi()
        if (!api || !keys.length) return result
        const prefixed = keys.map(key => CONFIG_KEY_PREFIX + key)
        const rawMap = await api.getMany(prefixed)
        const raw = (rawMap && typeof rawMap === 'object' ? rawMap : {}) as Record<string, unknown>
        for (const key of keys) {
            const record = this.#unwrap(raw[CONFIG_KEY_PREFIX + key])
            if (record) result.set(key, record)
        }
        return result
    }
    /** 读取全部配置记录（键 → 记录） */
    async readAll (knownKeys?: string[]): Promise<Map<string, GmConfigRecord>> {
        const result = new Map<string, GmConfigRecord>()
        const api = this.#resolveApi()
        if (!api) return result
        const listed = await api.list()
        const list = Array.isArray(listed) ? listed : []
        const keys = list
            .filter((key): key is string => typeof key === 'string' && key.startsWith(CONFIG_KEY_PREFIX))
            .map(key => key.slice(CONFIG_KEY_PREFIX.length))
        // GM_listValues 不可用时退回「已知键」逐个读
        const target = keys.length ? keys : (knownKeys ?? [])
        const records = await this.readMany(target)
        for (const [key, record] of records) result.set(key, record)
        return result
    }
    /** 写入一条配置记录 */
    async write (key: string, value: unknown, timestamp?: number, isDefault?: boolean): Promise<void> {
        const api = this.#resolveApi()
        if (!api) return
        const record: GmConfigRecord = { v: value, t: timestamp ?? Date.now() }
        if (isDefault) record.d = 1
        await api.set(CONFIG_KEY_PREFIX + key, record)
        this.#ensureListener(key)
    }
    /** 批量写入配置记录 */
    async writeMany (entries: Array<{ key: string, value: unknown, timestamp?: number; isDefault?: boolean }>): Promise<void> {
        const api = this.#resolveApi()
        if (!api || !entries.length) return
        const values: Record<string, unknown> = {}
        for (const entry of entries) {
            const record: GmConfigRecord = { v: entry.value, t: entry.timestamp ?? Date.now() }
            if (entry.isDefault) record.d = 1
            values[CONFIG_KEY_PREFIX + entry.key] = record
        }
        await api.setMany(values)
        for (const entry of entries) this.#ensureListener(entry.key)
    }
    /** 删除一条配置 */
    async remove (key: string): Promise<void> {
        const api = this.#resolveApi()
        if (!api) return
        await api.remove(CONFIG_KEY_PREFIX + key)
    }
    /**
     * 订阅配置变更
     * GM_addValueChangeListener 是**按键**注册的（不像 storage 事件那样通配），
     * 所以内部为每个键各注册一个监听器，回调里按回调参数还原出是哪个键变了。
     */
    watch (keys: string[], handler: GmRecordChangeHandler): void {
        this.#handlers.add(handler)
        for (const key of keys) this.#ensureListener(key)
    }
    /** 取消全部订阅（页面卸载 / 单测收尾） */
    unwatchAll (): void {
        const api = this.#resolveApi()
        if (api) {
            for (const id of this.#listenerIds.values()) api.removeListener(id)
        }
        this.#listenerIds.clear()
        this.#handlers.clear()
    }
    /** 为某个键确保已注册监听（写入时也会调，覆盖用户导入的未知键） */
    #ensureListener (key: string): void {
        const api = this.#resolveApi()
        if (!api || this.#listenerIds.has(key)) return
        const id = api.addListener(CONFIG_KEY_PREFIX + key, (changedKey, _oldValue, newValue) => {
            const rawKey = String(changedKey ?? '').replace(CONFIG_KEY_PREFIX, '')
            if (!rawKey) return
            const record = this.#unwrap(newValue)
            for (const handler of this.#handlers) {
                try {
                    handler(rawKey, record)
                } catch { /* 单个回调异常不影响其它回调 */ }
            }
        })
        if (id !== undefined && id !== null) this.#listenerIds.set(key, id)
    }
    /** 单测用：清空探测缓存与监听状态 */
    reset (): void {
        this.unwatchAll()
        this.#api = undefined
    }
}
export const gmStorageService = new GmStorageService()
