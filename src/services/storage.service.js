import { createIndexedDBService } from '@/services/index-db.service'
import { LoggerService } from '@/services/logger.service'
export class StorageService {
    static #instance
    #dbs
    #logger
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
    async init () {
        try {
            for (const [name, db] of this.#dbs) {
                await db.connect()
                if (!db.isStoreExists('keyval')) {
                    throw new Error(`数据库 ${name} 初始化丨数据表不存在`)
                }
            }
            this.#logger.debug('数据库集群初始化丨成功')
        } catch (error) {
            this.#logger.error('数据库集群初始化丨失败', error)
            throw error
        }
    }
    async set (dbName, key, value) {
        const db = this.#dbs.get(dbName)
        await db.update('keyval', { key, value, timestamp: Date.now() })
    }
    async get (dbName, key) {
        const db = this.#dbs.get(dbName)
        return db.get('keyval', key).then(data => data?.value)
    }
    userSet (key, value) { return this.set('user', key, value) }
    userGet (key) { return this.get('user', key) }
    userRemove (key) { return this.remove('user', key) }
    /** 单事务批量读取用户配置（P0-3：替代 N 次 userGet） */
    userBatchGet (keys) { return this.batchGet('user', keys) }
    /** 单事务批量写入用户配置（P0-3：替代 N 次 userSet） */
    userBatchSet (entries) { return this.batchSet('user', entries) }
    adCacheGet (key) { return this.get('adCache', key) }
    adCacheSet (key, value) { return this.set('adCache', key, value) }
    async getAll (dbName, indexName, queryRange, pageSize) {
        const db = this.#dbs.get(dbName)
        const result = await db.getAll('keyval', indexName, queryRange, pageSize)
        return result.results
    }
    async getAllRaw (dbName, indexName, queryRange, pageSize) {
        const db = this.#dbs.get(dbName)
        const result = await db._executeCursorQuery('keyval', indexName, queryRange, pageSize)
        return result.results.map(item => ({
            key: item.key,
            value: item.value,
            timestamp: item.timestamp
        }))
    }
    async getByTimeRange (dbName, startTime, endTime, pageSize = 100) {
        const range = IDBKeyRange.bound(startTime, endTime)
        return this.getAll(dbName, 'by_timestamp', range, pageSize)
    }
    async batchSet (dbName, configsArray) {
        if (!configsArray || configsArray.length === 0) return 0
        const db = this.#dbs.get(dbName)
        // P0-3：单事务批量写入，替代逐条 update（每键一次事务往返）
        const timestamp = Date.now()
        const records = configsArray.map(({ key, value }) => ({ key, value, timestamp }))
        return db.batchUpdate('keyval', records)
    }
    async batchGet (dbName, keys) {
        if (!keys || keys.length === 0) return {}
        const db = this.#dbs.get(dbName)
        return db.batchGet('keyval', keys)
    }
    async clear (dbName) {
        const db = this.#dbs.get(dbName)
        return db.clear('keyval')
    }
    async remove (dbName, key) {
        const db = this.#dbs.get(dbName)
        await db.delete('keyval', key)
    }
}
export const storageService = new StorageService()
