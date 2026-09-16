const DEFAULT_IDLE_TIMEOUT = 30000
/** object store 的索引配置 */
export interface IndexDbStoreIndex {
    name: string
    keyPath: string
    unique?: boolean
}
/** object store 配置 */
export interface IndexDbStoreConfig {
    name: string
    keyPath: string
    indexes?: IndexDbStoreIndex[]
}
/** createIndexedDBService 的配置（对应 storage.service 的库配置条目） */
export interface IndexedDbConfig {
    dbName: string
    version: number
    storeConfig: IndexDbStoreConfig[]
}
/** 游标查询结果条目 */
export interface IndexedDbCursorItem {
    key: unknown
    value: unknown
    timestamp?: unknown
}
export class IndexedDBService {
    dbName: string
    version: number
    storeConfig: IndexDbStoreConfig[]
    db: IDBDatabase | null
    lastOperationTime: number
    /** 空闲连接回收定时器（_setupConnectionMonitoring 中创建） */
    _idleTimer: ReturnType<typeof setInterval> | null = null
    constructor (dbName: string, version: number, storeConfig: IndexDbStoreConfig[]) {
        this.dbName = dbName
        this.version = version
        this.storeConfig = storeConfig
        this.db = null
        this.lastOperationTime = Date.now()
    }
    async connect (): Promise<IDBDatabase> {
        if (this.db) {
            this._updateLastOperation()
            return this.db
        }
        return new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version)
            request.onupgradeneeded = (event: Event) => {
                const db = (event.target as IDBOpenDBRequest).result
                this._createStores(db)
            }
            request.onsuccess = (event: Event) => {
                this.db = (event.target as IDBOpenDBRequest).result
                this._setupConnectionMonitoring()
                resolve(this.db)
            }
            request.onerror = (event: Event) => {
                reject(new Error(`数据库错误: ${(event.target as IDBOpenDBRequest).error}`))
            }
        })
    }
    isStoreExists (storeName: string): boolean | null {
        return this.db && this.db.objectStoreNames.contains(storeName)
    }
    async add (storeName: string, data: unknown): Promise<unknown> {
        return this._execute(storeName, 'readwrite', store => store.add(data))
    }
    /** 读取单条记录（store 中存的是 { key, value, timestamp } 形态） */
    async get (storeName: string, key: IDBValidKey): Promise<{ value?: unknown } | null | undefined> {
        return this._execute<{ value?: unknown } | null | undefined>(storeName, 'readonly', store => store.get(key))
    }
    async getAll (storeName: string, indexName: string | null, queryRange: IDBKeyRange | null | undefined, pageSize: number | null): Promise<{ results: Record<string, unknown>; continue: unknown }> {
        const result = await this.getAllRaw(storeName, indexName, queryRange, pageSize)
        return {
            results: result.results.reduce<Record<string, unknown>>((obj, item) => {
                obj[String(item.key)] = item.value
                return obj
            }, {}),
            continue: result.continue
        }
    }
    async getAllRaw (storeName: string, indexName: string | null, queryRange: IDBKeyRange | null | undefined, pageSize: number | null): Promise<{ results: IndexedDbCursorItem[]; continue: null }> {
        return this._executeCursorQuery(storeName, indexName, queryRange, pageSize)
    }
    async update (storeName: string, data: unknown): Promise<unknown> {
        return this._execute(storeName, 'readwrite', store => store.put(data))
    }
    /**
     * 单事务批量写入（P0-3）
     * 逐条 update 会为每个键开一次事务（N 次往返），批量初始化/批量提交必须走这里。
     * @param {string} storeName
     * @param {Array<object>} records 待写入记录（含 keyPath 字段）
     * @returns {Promise<number>} 写入条数
     */
    async batchUpdate (storeName: string, records: unknown[]): Promise<number> {
        if (!records || records.length === 0) return 0
        await this.connect()
        this._updateLastOperation()
        return new Promise<number>((resolve, reject) => {
            const tx = this.db!.transaction(storeName, 'readwrite')
            const store = tx.objectStore(storeName)
            for (const record of records) store.put(record)
            tx.oncomplete = () => resolve(records.length)
            tx.onerror = (event: Event) => reject((event.target as IDBTransaction).error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 批量写入事务已中止'))
        })
    }
    /**
     * 单事务批量删除（P0-3）
     * 逐条 delete 会为每个键开一次事务（N 次往返），批量清理必须走这里。
     * @param {string} storeName
     * @param {Array<string>} keys 待删除主键
     * @returns {Promise<number>} 请求删除的条数（事务失败会 reject）
     */
    async batchDelete (storeName: string, keys: string[]): Promise<number> {
        if (!keys || keys.length === 0) return 0
        await this.connect()
        this._updateLastOperation()
        return new Promise<number>((resolve, reject) => {
            const tx = this.db!.transaction(storeName, 'readwrite')
            const store = tx.objectStore(storeName)
            for (const key of keys) store.delete(key)
            tx.oncomplete = () => resolve(keys.length)
            tx.onerror = (event: Event) => reject((event.target as IDBTransaction).error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 批量删除事务已中止'))
        })
    }
    /**
     * 单事务批量读取（同一事务内并发取键，避免 N 次事务）
     * @param {string} storeName
     * @param {Array<string>} keys
     * @returns {Promise<object>} 键值映射；不存在的键不会出现在结果中
     */
    async batchGet (storeName: string, keys: string[]): Promise<Record<string, unknown>> {
        if (!keys || keys.length === 0) return {}
        await this.connect()
        this._updateLastOperation()
        return new Promise<Record<string, unknown>>((resolve, reject) => {
            const tx = this.db!.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const result: Record<string, unknown> = {}
            for (const key of keys) {
                const request = store.get(key)
                request.onsuccess = () => {
                    if (request.result !== undefined) {
                        result[key] = request.result.value
                    }
                }
            }
            tx.oncomplete = () => resolve(result)
            tx.onerror = (event: Event) => reject((event.target as IDBTransaction).error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 批量读取事务已中止'))
        })
    }
    async delete (storeName: string, key: IDBValidKey): Promise<unknown> {
        return this._execute(storeName, 'readwrite', store => store.delete(key))
    }
    async clear (storeName: string): Promise<unknown> {
        return this._execute(storeName, 'readwrite', store => store.clear())
    }
    async _execute<T = unknown> (storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
        await this.connect()
        this._updateLastOperation()
        return new Promise<T>((resolve, reject) => {
            const tx = this.db!.transaction(storeName, mode)
            const store = tx.objectStore(storeName)
            const request = operation(store)
            let result: unknown
            request.onsuccess = () => {
                result = request.result
            }
            request.onerror = (event: Event) => reject((event.target as IDBRequest).error)
            tx.oncomplete = () => resolve(result as T)
            tx.onerror = (event: Event) => reject((event.target as IDBTransaction).error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务已中止'))
        })
    }
    async _executeCursorQuery (storeName: string, indexName: string | null, range: IDBKeyRange | null | undefined, pageSize: number | null = null): Promise<{ results: IndexedDbCursorItem[]; continue: null }> {
        await this.connect()
        this._updateLastOperation()
        return new Promise<{ results: IndexedDbCursorItem[]; continue: null }>((resolve, reject) => {
            const tx = this.db!.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const index: IDBObjectStore | IDBIndex = indexName ? store.index(indexName) : store
            const results: IndexedDbCursorItem[] = []
            let cursor: IDBCursorWithValue | null = null
            const request = index.openCursor(range)
            request.onsuccess = (event: Event) => {
                cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
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
    close (): void {
        if (this._idleTimer) {
            clearInterval(this._idleTimer)
            this._idleTimer = null
        }
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }
    _createStores (db: IDBDatabase): void {
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
    _setupConnectionMonitoring (): void {
        if (this._idleTimer) clearInterval(this._idleTimer)
        this._idleTimer = setInterval(() => {
            if (Date.now() - this.lastOperationTime > DEFAULT_IDLE_TIMEOUT) {
                this.close()
            }
        }, 5000)
    }
    _updateLastOperation (): void {
        this.lastOperationTime = Date.now()
    }
}
export const createIndexedDBService = (config: IndexedDbConfig): IndexedDBService => new IndexedDBService(config.dbName, config.version, config.storeConfig)
