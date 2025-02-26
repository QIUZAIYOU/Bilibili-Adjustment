import { createIndexedDBService } from '@/services/indexdb.service'
import { LoggerService } from '@/services/logger.service'

export class StorageService {
    static #instance
    #db
    #logger = new LoggerService('StorageService')
    #dbConfig = {
        dbName: 'BilibiliAdjustmentStorage',
        version: 2,
        storeConfig: [{
            name: 'keyval',
            keyPath: 'key',
            indexes: [
                {
                    name: 'by_timestamp',
                    keyPath: 'timestamp',
                    unique: false
                }
            ]
        }]
    }
    constructor() {
        if (!window.indexedDB) {
            throw new Error('Browser does not support IndexedDB')
        }
        if (StorageService.#instance) {
            return StorageService.#instance
        }

        // 初始化增强版数据库服务
        this.#db = createIndexedDBService(this.#dbConfig)
        StorageService.#instance = this
    }
    async init() {
        try {
            await this.#db.connect()
            // 验证存储是否存在
            if (!this.#db.storeExists('keyval')) {
                throw new Error('keyval 存储未成功创建')
            }
            this.#logger.debug('Database initialized')
        } catch (error) {
            this.#logger.error('Database init failed', error)
            throw error
        }
    }
    async set(key, value) {
        return this.#db.executeWithRetry(async () => {
            await this.#db.update('keyval', {
                key,
                value,
                timestamp: Date.now()
            })
        })
    }
    async get(key) {
        return this.#db.executeWithRetry(async () => {
            return this.#db.get('keyval', key).then(data => data?.value)
        })
    }
    async getAll(indexName, queryRange, pageSize) {
        return this.#db.executeWithRetry(async () => {
            // 直接返回对象格式数据，移除数组映射
            return this.#db.getAll('keyval', indexName, queryRange, pageSize)
        })
    }
    async getAllRaw(indexName, queryRange, pageSize) {
        return this.#db.executeWithRetry(async () => {
            const result = await this.#db._executeCursorQuery('keyval', indexName, queryRange, pageSize)
            return result.results.map(item => ({
                key: item.key,
                value: item.value,
                timestamp: item.timestamp
            }))
        })
    }
    async getByTimeRange(startTime, endTime, pageSize = 100) {
        const range = IDBKeyRange.bound(startTime, endTime)
        return this.getAll('by_timestamp', range, pageSize)
    }
    async batch(operations) {
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
