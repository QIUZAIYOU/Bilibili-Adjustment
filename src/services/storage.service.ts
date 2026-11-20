import { createIndexedDBService } from '@/services/index-db.service'
import type { IndexedDBService } from '@/services/index-db.service'
import { LoggerService } from '@/services/logger.service'
import { gmStorageService } from '@/services/gm-storage.service'
/**
 * 存储服务
 *
 * 三套库，后端**统一为脚本管理器存储**（GM 存储，脚本级、跨子域共享）：
 * - `user`：用户配置；
 * - `index`：首页推荐历史、旧版黑名单；
 * - `adCache`：广告识别/跳过片段缓存。
 *
 * 迁移策略（2026-11-20）：index / adCache 首次访问时把 IndexedDB 旧数据懒迁移到脚本存储
 * （命名空间 `adj.idx.` / `adj.adc.`），**只搬不删**，IndexedDB 仅保留为
 * 「脚本管理器没有 GM 存储」时的降级后端；旧数据留在原地可回滚。
 */
/** 是否具备可用的 IndexedDB —— 只看 `window.indexedDB` 是否存在不够：测试桩/半实现里它可能是空对象 */
const hasIndexedDB = (): boolean => typeof (window.indexedDB as { open?: unknown } | undefined)?.open === 'function'
/**
 * 除 user 外的库：数据统一迁到脚本管理器存储后使用的命名空间前缀。
 * IndexedDB 只保留为「脚本存储不可用」时的降级后端与迁移源。
 */
const AUX_GM_PREFIX: Record<string, string> = {
    index: 'adj.idx.',
    adCache: 'adj.adc.'
}
const AUX_MIGRATION_FLAG_PREFIX = 'adj.meta.idbMigrated.'
/** 每个库的迁移只跑一次（并发调用共享同一个 Promise） */
const auxMigrationTasks = new Map<string, Promise<void>>()
export class StorageService {
    static #instance: StorageService | undefined
    #dbs!: Map<string, IndexedDBService>
    #logger!: LoggerService
    #dbConfig = {
        user: {
            dbName: 'BilibiliAdjustmentUserConfigs',
            version: 2,
            storeConfig: [
                {
                    name: 'keyval',
                    keyPath: 'key',
                    indexes: [
                        {
                            name: 'by_timestamp',
                            keyPath: 'timestamp',
                            unique: false
                        }
                    ]
                }
            ]
        },
        index: {
            dbName: 'BilibiliAdjustmentIndexRecommendVideoHistory',
            version: 2,
            storeConfig: [
                {
                    name: 'keyval',
                    keyPath: 'key',
                    indexes: [
                        {
                            name: 'by_timestamp',
                            keyPath: 'timestamp',
                            unique: false
                        }
                    ]
                }
            ]
        },
        adCache: {
            dbName: 'BilibiliAdjustmentAdCache',
            version: 1,
            storeConfig: [
                {
                    name: 'keyval',
                    keyPath: 'key'
                }
            ]
        }
    }
    constructor () {
        // ⚠️ 不在构造期抛错（审查 W2）：本单例在模块顶层就被 new 出来，一旦抛错，
        // 整个脚本在加载阶段就挂掉 —— 连「配置存 GM 存储」这条完全不依赖 IndexedDB 的链路也没了。
        // 这里只记录警告并降级：依赖 IndexedDB 的功能（首页历史、广告识别缓存）自行失败。
        if (!hasIndexedDB()) {
            // 注意：这里 #logger 还没赋值，不能用它
            console.warn('[StorageService] 当前环境不支持 IndexedDB，首页历史与广告识别缓存将不可用')
        }
        if (StorageService.#instance) {
            return StorageService.#instance
        }
        this.#logger = new LoggerService('StorageService')
        this.#dbs = new Map()
        if (hasIndexedDB()) {
            Object.entries(this.#dbConfig).forEach(([name, config]) => {
                this.#dbs.set(name, createIndexedDBService(config))
            })
        }
        StorageService.#instance = this
    }
    async init (): Promise<void> {
        if (!hasIndexedDB()) {
            // 降级路径：没有 IndexedDB 就没有这些库，直接跳过而不是抛错拖垮启动
            this.#logger.warn('数据库集群初始化丨跳过（当前环境不支持 IndexedDB）')
            return
        }
        try {
            for (const [name, db] of this.#dbs) {
                await db.connect()
                if (!db.isStoreExists('keyval')) {
                    throw new Error(`数据库 ${name} 初始化丨数据表不存在`)
                }
            }
            this.#logger.debug(`数据库集群初始化丨成功丨配置后端=${gmStorageService.available ? 'GM存储' : 'IndexedDB'}`)
        } catch (error) {
            this.#logger.error('数据库集群初始化丨失败', error)
            throw error
        }
    }
    /**
     * 懒迁移：把某个 IndexedDB 库的数据搬到脚本存储（每库一次，成功写标记）
     *
     * 只搬不删：IndexedDB 原数据留在原地作为回滚源；脚本存储不可用时仍走 IndexedDB 旧路径。
     */
    async #ensureAuxMigrated (dbName: string): Promise<void> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (!prefix || !gmStorageService.available) return
        const running = auxMigrationTasks.get(dbName)
        if (running) {
            await running
            return
        }
        const task = (async (): Promise<void> => {
            const flag = await gmStorageService.read(AUX_MIGRATION_FLAG_PREFIX + dbName)
            if (flag?.v) return
            try {
                const db = this.#dbs.get(dbName)
                if (!db) return
                const result = await db._executeCursorQuery('keyval', null, null, null)
                const entries = result.results.map(item => ({ key: prefix + String(item.key), value: item.value }))
                if (entries.length) await gmStorageService.writeMany(entries)
                await gmStorageService.write(AUX_MIGRATION_FLAG_PREFIX + dbName, 1)
                if (entries.length) this.#logger.info(`存储迁移丨${dbName} → 脚本存储`, `${entries.length} 条`)
            } catch (error) {
                auxMigrationTasks.delete(dbName)
                this.#logger.warn(`存储迁移丨${dbName} 失败（本轮继续用 IndexedDB）`, error)
            }
        })()
        auxMigrationTasks.set(dbName, task)
        await task
    }
    async set (dbName: string, key: string, value: unknown): Promise<void> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            await gmStorageService.write(prefix + key, value)
            return
        }
        const db = this.#dbs.get(dbName)!
        await db.update('keyval', { key, value, timestamp: Date.now() })
    }
    async get (dbName: string, key: string): Promise<unknown> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            const record = await gmStorageService.read(prefix + key)
            return record?.v
        }
        const db = this.#dbs.get(dbName)!
        return db.get('keyval', key).then(data => data?.value)
    }
    userSet (key: string, value: unknown, options?: { isDefault?: boolean }): Promise<void> {
        if (gmStorageService.available) return gmStorageService.write(key, value, undefined, options?.isDefault)
        return this.set('user', key, value)
    }
    userGet (key: string): Promise<unknown> {
        if (gmStorageService.available) {
            return gmStorageService.read(key).then(record => (record ? record.v : undefined))
        }
        return this.get('user', key)
    }
    userRemove (key: string): Promise<void> {
        if (gmStorageService.available) {
            return gmStorageService.remove(key)
        }
        return this.remove('user', key)
    }
    /** 单事务批量读取用户配置（P0-3：替代 N 次 userGet） */
    async userBatchGet (keys: string[]): Promise<Record<string, unknown>> {
        if (!keys || keys.length === 0) return {}
        if (gmStorageService.available) {
            const records = await gmStorageService.readMany(keys)
            const result: Record<string, unknown> = {}
            for (const key of keys) {
                const record = records.get(key)
                if (record) result[key] = record.v
            }
            return result
        }
        return this.batchGet('user', keys)
    }
    /**
     * 单事务批量写入用户配置（P0-3：替代 N 次 userSet）
     * @param options.isDefault 标记这批是「默认值补齐」而非用户显式设置（迁移裁决用）
     */
    async userBatchSet (entries: Array<{ key: string, value: unknown }>, options?: { isDefault?: boolean }): Promise<number> {
        if (!entries || entries.length === 0) return 0
        if (gmStorageService.available) {
            await gmStorageService.writeMany(entries.map(entry => ({
                key: entry.key,
                value: entry.value,
                isDefault: options?.isDefault
            })))
            return entries.length
        }
        return this.batchSet('user', entries)
    }
    adCacheGet (key: string): Promise<unknown> { return this.get('adCache', key) }
    adCacheSet (key: string, value: unknown): Promise<void> { return this.set('adCache', key, value) }
    async getAll (dbName: string, indexName: string | null = null, queryRange: IDBKeyRange | null | undefined = null, pageSize: number | null = null): Promise<unknown> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            const records = await gmStorageService.readAll()
            const result: Record<string, unknown> = {}
            for (const [key, record] of records) {
                if (key.startsWith(prefix)) result[key.slice(prefix.length)] = record.v
            }
            return result
        }
        if (dbName === 'user' && gmStorageService.available) {
            const records = await gmStorageService.readAll()
            const result: Record<string, unknown> = {}
            for (const [key, record] of records) result[key] = record.v
            return result
        }
        const db = this.#dbs.get(dbName)!
        const result = await db.getAll('keyval', indexName, queryRange, pageSize)
        return result.results
    }
    async getAllRaw (dbName: string, indexName: string | null = null, queryRange: IDBKeyRange | null | undefined = null, pageSize: number | null = null): Promise<Array<{ key: unknown, value: unknown, timestamp: unknown }>> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            const records = await gmStorageService.readAll()
            const result: Array<{ key: unknown, value: unknown, timestamp: unknown }> = []
            for (const [key, record] of records) {
                if (!key.startsWith(prefix)) continue
                result.push({ key: key.slice(prefix.length), value: record.v, timestamp: record.t })
            }
            return result
        }
        const db = this.#dbs.get(dbName)!
        const result = await db._executeCursorQuery('keyval', indexName, queryRange, pageSize)
        return result.results.map(item => ({
            key: item.key,
            value: item.value,
            timestamp: item.timestamp
        }))
    }
    async batchSet (dbName: string, configsArray: Array<{ key: string, value: unknown }>): Promise<number> {
        if (!configsArray || configsArray.length === 0) return 0
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            await gmStorageService.writeMany(configsArray.map(entry => ({ key: prefix + entry.key, value: entry.value })))
            return configsArray.length
        }
        if (dbName === 'user' && gmStorageService.available) {
            await gmStorageService.writeMany(configsArray.map(entry => ({ key: entry.key, value: entry.value })))
            return configsArray.length
        }
        const db = this.#dbs.get(dbName)!
        // P0-3：单事务批量写入，替代逐条 update（每键一次事务往返）
        const timestamp = Date.now()
        const records = configsArray.map(({ key, value }) => ({ key, value, timestamp }))
        return db.batchUpdate('keyval', records)
    }
    /** 单事务批量读取（P0-3：单事务内并发取键，避免 N 次事务） */
    async batchGet (dbName: string, keys: string[]): Promise<Record<string, unknown>> {
        if (!keys || keys.length === 0) return {}
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            const result: Record<string, unknown> = {}
            for (const key of keys) {
                const record = await gmStorageService.read(prefix + key)
                if (record) result[key] = record.v
            }
            return result
        }
        const db = this.#dbs.get(dbName)!
        return db.batchGet('keyval', keys)
    }
    /** 单事务批量删除（P0-3：替代循环里逐键 await remove） */
    async batchRemove (dbName: string, keys: string[]): Promise<number> {
        if (!keys || keys.length === 0) return 0
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            for (const key of keys) await gmStorageService.remove(prefix + key)
            return keys.length
        }
        if (dbName === 'user' && gmStorageService.available) {
            for (const key of keys) await gmStorageService.remove(key)
            return keys.length
        }
        const db = this.#dbs.get(dbName)!
        return db.batchDelete('keyval', keys)
    }
    async clear (dbName: string): Promise<unknown> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            const records = await gmStorageService.readAll()
            for (const key of records.keys()) {
                if (key.startsWith(prefix)) await gmStorageService.remove(key)
            }
            return undefined
        }
        if (dbName === 'user' && gmStorageService.available) {
            const records = await gmStorageService.readAll()
            for (const key of records.keys()) await gmStorageService.remove(key)
            return undefined
        }
        const db = this.#dbs.get(dbName)!
        return db.clear('keyval')
    }
    async remove (dbName: string, key: string): Promise<void> {
        const prefix = AUX_GM_PREFIX[dbName]
        if (prefix && gmStorageService.available) {
            await this.#ensureAuxMigrated(dbName)
            await gmStorageService.remove(prefix + key)
            return
        }
        const db = this.#dbs.get(dbName)!
        await db.delete('keyval', key)
    }
    /**
     * 迁移专用：直读 IndexedDB 里的 user 库（绕过 GM 后端）
     * GM 模式下用户配置已迁走，IndexedDB 里那份是「迁移前快照」，仅供迁移与回滚使用。
     */
    async legacyUserEntries (): Promise<Array<{ key: string, value: unknown, timestamp: number }>> {
        const raw = await this.getAllRaw('user')
        return raw.map(item => ({
            key: String(item.key),
            value: item.value,
            timestamp: Number(item.timestamp) || 0
        }))
    }
    /** 迁移专用：直写 IndexedDB（幂等标记），不经过 GM 后端 */
    async legacyUserSet (key: string, value: unknown): Promise<void> {
        await this.set('user', key, value)
    }
    /**
     * 迁移专用：直读 IndexedDB 里的某个键（绕过 GM 后端）
     * 用于读「当前版本已移除」的历史配置键 —— 它们不在 schema 默认值表里，不会被迁到 GM 存储
     */
    async legacyUserGet (key: string): Promise<unknown> {
        return this.get('user', key)
    }
}
export const storageService = new StorageService()
