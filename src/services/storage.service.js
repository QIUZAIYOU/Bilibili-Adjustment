import { createIndexedDBService } from '@/services/indexdb.service'
import { LoggerService } from '@/services/logger.service'
export class StorageService {
    static #instance
    #db
    #logger
    #dbConfig = {
        dbName: 'BilibiliAdjustmentStorage',
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
    }
    constructor () {
        if (!window.indexedDB) {
            throw new Error('Browser does not support IndexedDB')
        }
        if (StorageService.#instance) {
            return StorageService.#instance
        }
        this.#logger = new LoggerService('StorageService')
        this.#db = createIndexedDBService(this.#dbConfig)
        StorageService.#instance = this
    }
    async init () {
        try {
            await this.#db.connect()
            if (!this.#db.isStoreExists('keyval')) {
                throw new Error('数据库初始化丨数据表不存在')
            }
            this.#logger.debug('数据库初始化丨成功')
        } catch (error) {
            this.#logger.error('数据库初始化丨失败', error)
            throw error
        }
    }
    async set (key, value) {
        await this.#db.update('keyval', {
            key,
            value,
            timestamp: Date.now()
        })
    }
    async get (key) {
        return this.#db.get('keyval', key).then(data => data?.value)
    }
    async getAll (indexName, queryRange, pageSize) {
        const result = await this.#db.getAll('keyval', indexName, queryRange, pageSize)
        return result.results
    }
    async getAllRaw (indexName, queryRange, pageSize) {
        const result = await this.#db._executeCursorQuery('keyval', indexName, queryRange, pageSize)
        return result.results.map(item => ({
            key: item.key,
            value: item.value,
            timestamp: item.timestamp
        }))
    }
    async getByTimeRange (startTime, endTime, pageSize = 100) {
        const range = IDBKeyRange.bound(startTime, endTime)
        return this.getAll('by_timestamp', range, pageSize)
    }
    async batch (operations) {
        return this.#db.transaction(['keyval'], 'readwrite', async stores => {
            for (const { type, key, value } of operations) {
                if (type === 'set') {
                    await stores.keyval.put({
                        key,
                        value,
                        timestamp: Date.now()
                    })
                } else if (type === 'delete') {
                    await stores.keyval.delete(key)
                }
            }
        })
    }
}
export const storageService = new StorageService()
