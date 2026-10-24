import { createIndexedDBService } from '@/services/index-db.service'
import type { IndexedDBService } from '@/services/index-db.service'
import { LoggerService } from '@/services/logger.service'
import { gmStorageService } from '@/services/gm-storage.service'
/**
 * 存储服务
 *
 * 三套库，后端不同：
 * - `user`：**用户配置** → 后端是 GM 存储（脚本级，跨全部匹配页面共享一份）；
 *   GM 不可用时（老管理器）自动回落 IndexedDB，老用户不丢配置。
 *   读取时始终回落到 schema 默认值，缺失键不必落盘。
 * - `index`：首页推荐位历史 → 留在 IndexedDB。它天然是「当前站点」的数据，
 *   按源隔离是对的，搬进 GM 存储反而会跟其它源的历史混在一起。
 * - `adCache`：广告识别缓存 → 留在 IndexedDB。量大、可重建，不适合塞进脚本存储。
 *
 * 迁移说明：配置从 IndexedDB 迁到 GM 存储后，IndexedDB 里那份**保留不删**（回滚源），
 * 读写切换由 `gmStorageService.available` 决定，legacyUser* 系列方法专供迁移使用。
 */
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
        if (!window.indexedDB) {
            throw new Error('浏览器不支持 IndexedDB')
        }
        if (StorageService.#instance) {
            return StorageService.#instance
        }
        this.#logger = new LoggerService('StorageService')
        this.#dbs = new Map()
        Object.entries(this.#dbConfig).forEach(([name, config]) => {
            this.#dbs.set(name, createIndexedDBService(config))
        })
        StorageService.#instance = this
    }
    async init (): Promise<void> {
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
    async set (dbName: string, key: string, value: unknown): Promise<void> {
        const db = this.#dbs.get(dbName)!
        await db.update('keyval', { key, value, timestamp: Date.now() })
    }
    async get (dbName: string, key: string): Promise<unknown> {
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
        const db = this.#dbs.get(dbName)!
        return db.batchGet('keyval', keys)
    }
    /** 单事务批量删除（P0-3：替代循环里逐键 await remove） */
    async batchRemove (dbName: string, keys: string[]): Promise<number> {
        if (!keys || keys.length === 0) return 0
        if (dbName === 'user' && gmStorageService.available) {
            for (const key of keys) await gmStorageService.remove(key)
            return keys.length
        }
        const db = this.#dbs.get(dbName)!
        return db.batchDelete('keyval', keys)
    }
    async clear (dbName: string): Promise<unknown> {
        if (dbName === 'user' && gmStorageService.available) {
            const records = await gmStorageService.readAll()
            for (const key of records.keys()) await gmStorageService.remove(key)
            return undefined
        }
        const db = this.#dbs.get(dbName)!
        return db.clear('keyval')
    }
    async remove (dbName: string, key: string): Promise<void> {
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
