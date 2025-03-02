const DEFAULT_IDLE_TIMEOUT = 30000

class IndexedDBService {
    constructor(dbName, version, storeConfig) {
        this.dbName = dbName
        this.version = version
        this.storeConfig = storeConfig
        this.db = null
        this.lastOperationTime = Date.now()
    }
    // 核心数据库连接
    async connect() {
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
                reject(new Error(`Database error: ${event.target.error}`))
            }
        })
    }
    isStoreExists(storeName) {
        return this.db && this.db.objectStoreNames.contains(storeName)
    }
    // 基础CRUD操作
    async add(storeName, data) {
        return this._execute(storeName, 'readwrite', store => store.add(data))
    }
    async get(storeName, key) {
        return this._execute(storeName, 'readonly', store => store.get(key))
    }
    async getAll(storeName, indexName, queryRange, pageSize) {
        const result = await this.getAllRaw(storeName, indexName, queryRange, pageSize)
        return {
            results: result.results.reduce((obj, item) => {
                obj[item.key] = item.value
                return obj
            }, {}),
            continue: result.continue
        }
    }
    async getAllRaw(storeName, indexName, queryRange, pageSize) {
        return this._executeCursorQuery(storeName, indexName, queryRange, pageSize)
    }
    async update(storeName, data) {
        return this._execute(storeName, 'readwrite', store => store.put(data))
    }
    async delete(storeName, key) {
        return this._execute(storeName, 'readwrite', store => store.delete(key))
    }
    // 通用执行方法
    async _execute(storeName, mode, operation) {
        await this.connect()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode)
            const store = tx.objectStore(storeName)

            const request = operation(store)
            request.onsuccess = () => resolve(request.result)
            request.onerror = event => reject(event.target.error)
        })
    }
    async _executeCursorQuery(storeName, indexName, range, pageSize = 100) {
        await this.connect()
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
                    if (results.length >= pageSize) {
                        return resolve({ results, continue: () => cursor.continue() })
                    }
                    cursor.continue()
                } else {
                    resolve({ results, continue: null })
                }
            }
            request.onerror = reject
        })
    }
    // 精简后的连接管理
    close() {
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }
    // 存储创建逻辑
    _createStores(db) {
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
    _setupConnectionMonitoring() {
        this._idleTimer = setInterval(() => {
            if (Date.now() - this.lastOperationTime > DEFAULT_IDLE_TIMEOUT) {
                this.close()
            }
        }, 5000)
    }
    _updateLastOperation() {
        this.lastOperationTime = Date.now()
    }
}

export const createIndexedDBService = config => new IndexedDBService(config.dbName, config.version, config.storeConfig)
