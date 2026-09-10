const DEFAULT_IDLE_TIMEOUT = 30000
class IndexedDBService {
    constructor (dbName, version, storeConfig) {
        this.dbName = dbName
        this.version = version
        this.storeConfig = storeConfig
        this.db = null
        this.lastOperationTime = Date.now()
    }
    async connect () {
        if (this.db) {
            this._updateLastOperation()
            return this.db
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version)
            request.onupgradeneeded = event => {
                const db = event.target.result
                this._createStores(db)
            }
            request.onsuccess = event => {
                this.db = event.target.result
                this._setupConnectionMonitoring()
                resolve(this.db)
            }
            request.onerror = event => {
                reject(new Error(`数据库错误: ${event.target.error}`))
            }
        })
    }
    isStoreExists (storeName) {
        return this.db && this.db.objectStoreNames.contains(storeName)
    }
    async add (storeName, data) {
        return this._execute(storeName, 'readwrite', store => store.add(data))
    }
    async get (storeName, key) {
        return this._execute(storeName, 'readonly', store => store.get(key))
    }
    async getAll (storeName, indexName, queryRange, pageSize) {
        const result = await this.getAllRaw(storeName, indexName, queryRange, pageSize)
        return {
            results: result.results.reduce((obj, item) => {
                obj[item.key] = item.value
                return obj
            }, {}),
            continue: result.continue
        }
    }
    async getAllRaw (storeName, indexName, queryRange, pageSize) {
        return this._executeCursorQuery(storeName, indexName, queryRange, pageSize)
    }
    async update (storeName, data) {
        return this._execute(storeName, 'readwrite', store => store.put(data))
    }
    /**
     * 单事务批量写入（P0-3）
     * 逐条 update 会为每个键开一次事务（N 次往返），批量初始化/批量提交必须走这里。
     * @param {string} storeName
     * @param {Array<object>} records 待写入记录（含 keyPath 字段）
     * @returns {Promise<number>} 写入条数
     */
    async batchUpdate (storeName, records) {
        if (!records || records.length === 0) return 0
        await this.connect()
        this._updateLastOperation()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite')
            const store = tx.objectStore(storeName)
            for (const record of records) store.put(record)
            tx.oncomplete = () => resolve(records.length)
            tx.onerror = event => reject(event.target.error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 批量写入事务已中止'))
        })
    }
    /**
     * 单事务批量读取（同一事务内并发取键，避免 N 次事务）
     * @param {string} storeName
     * @param {Array<string>} keys
     * @returns {Promise<object>} 键值映射；不存在的键不会出现在结果中
     */
    async batchGet (storeName, keys) {
        if (!keys || keys.length === 0) return {}
        await this.connect()
        this._updateLastOperation()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const result = {}
            for (const key of keys) {
                const request = store.get(key)
                request.onsuccess = () => {
                    if (request.result !== undefined) {
                        result[key] = request.result.value
                    }
                }
            }
            tx.oncomplete = () => resolve(result)
            tx.onerror = event => reject(event.target.error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 批量读取事务已中止'))
        })
    }
    async delete (storeName, key) {
        return this._execute(storeName, 'readwrite', store => store.delete(key))
    }
    async clear (storeName) {
        return this._execute(storeName, 'readwrite', store => store.clear())
    }
    async _execute (storeName, mode, operation) {
        await this.connect()
        this._updateLastOperation()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode)
            const store = tx.objectStore(storeName)
            const request = operation(store)
            let result
            request.onsuccess = () => {
                result = request.result
            }
            request.onerror = event => reject(event.target.error)
            tx.oncomplete = () => resolve(result)
            tx.onerror = event => reject(event.target.error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务已中止'))
        })
    }
    async _executeCursorQuery (storeName, indexName, range, pageSize = null) {
        await this.connect()
        this._updateLastOperation()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const index = indexName ? store.index(indexName) : store
            const results = []
            let cursor
            const request = index.openCursor(range)
            request.onsuccess = event => {
                cursor = event.target.result
                if (cursor) {
                    results.push(cursor.value)
                    // 如果没有设置 pageSize 或者结果数量还没有达到 pageSize，则继续查询
                    if (pageSize === null || pageSize === undefined || results.length < pageSize) {
                        cursor.continue()
                    } else {
                        // 事务完成后 cursor 已失效，不能向调用方暴露 cursor.continue()
                        return resolve({ results, continue: null })
                    }
                } else {
                    resolve({ results, continue: null })
                }
            }
            request.onerror = reject
        })
    }
    close () {
        if (this._idleTimer) {
            clearInterval(this._idleTimer)
            this._idleTimer = null
        }
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }
    _createStores (db) {
        this.storeConfig.forEach(config => {
            if (!db.objectStoreNames.contains(config.name)) {
                const store = db.createObjectStore(config.name, {
                    keyPath: config.keyPath
                })
                config.indexes?.forEach(index => {
                    store.createIndex(index.name, index.keyPath, {
                        unique: index.unique || false
                    })
                })
            }
        })
    }
    _setupConnectionMonitoring () {
        if (this._idleTimer) clearInterval(this._idleTimer)
        this._idleTimer = setInterval(() => {
            if (Date.now() - this.lastOperationTime > DEFAULT_IDLE_TIMEOUT) {
                this.close()
            }
        }, 5000)
    }
    _updateLastOperation () {
        this.lastOperationTime = Date.now()
    }
}
export const createIndexedDBService = config => new IndexedDBService(config.dbName, config.version, config.storeConfig)
