// indexdb.service.js
const DEFAULT_IDLE_TIMEOUT = 30000 // 30秒空闲关闭

class IndexedDBService {
    constructor(dbName, version, storeConfig) {
        this.dbName = dbName
        this.version = version
        this.storeConfig = storeConfig
        this.db = null
        this.lastOperationTime = Date.now()
        this.connectionListeners = []
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
                this._handleSchemaMigration(db, event.oldVersion)
            }

            request.onsuccess = event => {
                this.db = event.target.result
                this._setupConnectionMonitoring()
                this._updateLastOperation()
                this._notifyConnectionReady()
                resolve(this.db)
            }

            request.onerror = event => {
                reject(new Error(`Database error: ${event.target.error}`))
            }
        })
    }
    // 基础CRUD操作
    async add(storeName, data) {
        return this._executeWithValidation(storeName, 'readwrite', async store => {
            return store.add(data)
        })
    }
    async get(storeName, key) {
        return this._execute('get', storeName, 'readonly', [key])
    }
    async update(storeName, data) {
        return this._executeWithValidation(storeName, 'readwrite', async store => {
            return store.put(data)
        })
    }
    async delete(storeName, key) {
        return this._execute('delete', storeName, 'readwrite', [key])
    }
    // 批量操作
    async bulkAdd(storeName, items) {
        return this._executeBatch(storeName, 'add', items)
    }
    async bulkUpdate(storeName, items) {
        return this._executeBatch(storeName, 'put', items)
    }
    // 高级查询
    async getAll(storeName, indexName, queryRange, pageSize) {
        return this._executeCursorQuery(storeName, indexName, queryRange, pageSize)
    }
    // 事务管理
    async transaction(storeNames, mode, operation) {
        await this.connect()
        const tx = this.db.transaction(storeNames, mode)
        const stores = storeNames.reduce((acc, name) => {
            acc[name] = tx.objectStore(name)
            return acc
        }, {})

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = event => reject(event.target.error)
            operation(stores).catch(reject)
        })
    }
    // 连接管理
    close() {
        if (this.db) {
            this.db.close()
            this.db = null
            this._clearConnectionMonitoring()
        }
    }
    // 私有方法
    async _execute(method, storeName, mode, args) {
        await this.connect()
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode)
            const store = tx.objectStore(storeName)
            const request = store[method](...args)

            request.onsuccess = () => resolve(request.result)
            request.onerror = event => reject(event.target.error)
        })
    }
    async _executeBatch(storeName, method, items) {
        return this.transaction([storeName], 'readwrite', async stores => {
            await Promise.all(items.map(item => {
                return new Promise((resolve, reject) => {
                    const request = stores[storeName][method](item)
                    request.onsuccess = resolve
                    request.onerror = reject
                })
            }))
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
    _setupConnectionMonitoring() {
        this._idleTimer = setInterval(() => {
            if (Date.now() - this.lastOperationTime > DEFAULT_IDLE_TIMEOUT) {
                this.close()
            }
        }, 5000)
    }
    _clearConnectionMonitoring() {
        clearInterval(this._idleTimer)
    }
    _updateLastOperation() {
        this.lastOperationTime = Date.now()
    }
    _notifyConnectionReady() {
        this.connectionListeners.forEach(resolve => resolve())
        this.connectionListeners = []
    }
    _handleSchemaMigration(db, oldVersion) {
        const migrationPlan = this._createMigrationPlan(oldVersion)
        migrationPlan.forEach(step => step.execute(db))
    }
    _createMigrationPlan(oldVersion) {
        const migrations = []

        // 从旧版本逐步升级到当前版本
        for (let v = oldVersion + 1; v <= this.version; v++) {
            migrations.push({
                version: v,
                execute: db => {
                    this.storeConfig.forEach(config => {
                        // 创建新存储
                        if (!db.objectStoreNames.contains(config.name)) {
                            const store = db.createObjectStore(config.name, {
                                keyPath: config.keyPath
                            })
                            config.indexes.forEach(index => {
                                store.createIndex(index.name, index.keyPath, {
                                    unique: index.unique || false
                                })
                            })
                        }
                    })
                }
            })
        }

        return migrations
    }
}

// 增强功能扩展
class EnhancedDBService extends IndexedDBService {
    constructor(config) {
        super(config.dbName, config.version, config.storeConfig)
        this.schemaValidator = new SchemaValidator(config.storeConfig)
        this.retryPolicy = config.retryPolicy || { maxRetries: 3 }
    }
    async _executeWithValidation(storeName, mode, operation) {
        return this.executeWithRetry(async () => {
            await this.connect()
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, mode)
                const store = tx.objectStore(storeName)

                // 数据验证
                if (mode === 'readwrite' && operation) {
                    const request = operation(store)
                    request.onsuccess = () => resolve(request.result)
                    request.onerror = reject
                }
            })
        })
    }
    async add(storeName, data) {
        this.schemaValidator.validate(storeName, data)
        return super.add(storeName, data)
    }
    async update(storeName, data) {
        this.schemaValidator.validate(storeName, data)
        return super.update(storeName, data)
    }
    async getAll(storeName, indexName, queryRange, pageSize = 100) {
        return this.executeWithRetry(async () => {
            const result = await super.getAll(storeName, indexName, queryRange, pageSize)
            return {
                results: result.results.reduce((obj, item) => {
                    obj[item.key] = item.value
                    return obj
                }, {}),
                continue: result.continue
            }
        })
    }
    async executeWithRetry(operation, context) {
        let attempts = 0
        while (attempts <= this.retryPolicy.maxRetries) {
            try {
                return await operation()
            } catch (error) {
                if (this._shouldRetry(error) && attempts < this.retryPolicy.maxRetries) {
                    await this._waitForRetry(attempts)
                    attempts++
                    continue
                }
                throw error
            }
        }
    }
    storeExists(storeName) {
        return this.db.objectStoreNames.contains(storeName)
    }
    _shouldRetry(error) {
        const retryableErrors = [
            'TransactionInactiveError',
            'DatabaseClosedError',
            'QuotaExceededError'
        ]
        return retryableErrors.includes(error.name)
    }
    _waitForRetry(attempt) {
        const delay = Math.pow(2, attempt) * 100
        return new Promise(resolve => setTimeout(resolve, delay))
    }
}

// 辅助类
class SchemaValidator {
    constructor(storeConfig) {
        this.schemas = new Map()
        storeConfig.forEach(config => {
            this.schemas.set(config.name, {
                keyPath: config.keyPath,
                required: [config.keyPath,
                           ...(config.requiredFields || [])],
                indexes: config.indexes || []
            })
        })
    }
    validate(storeName, data) {
        const schema = this.schemas.get(storeName)
        if (!schema) throw new Error(`Schema not found for ${storeName}`)

        // 主键检查
        if (data[schema.keyPath] === undefined) {
            throw new Error(`Missing key path: ${schema.keyPath}`)
        }

        // 必填字段检查
        schema.required.forEach(field => {
            if (data[field] === undefined) {
                throw new Error(`Missing required field: ${field}`)
            }
        })

        // 索引校验（可选）
        this._validateIndexes(storeName, data)
    }
    _validateIndexes(storeName, data) {
        const schema = this.schemas.get(storeName)
        schema.indexes.forEach(index => {
            if (index.unique && this._checkDuplicate(storeName, index, data)) {
                throw new Error(`Duplicate value for unique index: ${index.name}`)
            }
        })
    }
    _checkDuplicate(storeName, index, data) {
        // 需要实际数据库查询实现
        return false
    }
}

// 连接池管理
class ConnectionPool {
    static instances = new Map()
    static getInstance(config) {
        const key = `${config.dbName}_${config.version}`
        if (!this.instances.has(key)) {
            const instance = new EnhancedDBService(config)
            this.instances.set(key, instance)
        }
        return this.instances.get(key)
    }
    static closeAll() {
        this.instances.forEach(instance => instance.close())
        this.instances.clear()
    }
}

// 使用示例
/*
const config = {
  dbName: 'enterpriseDB',
  version: 3,
  storeConfig: [
    {
      name: 'users',
      keyPath: 'id',
      indexes: [
        { name: 'email', keyPath: 'email', unique: true },
        { name: 'department', keyPath: 'department' }
      ],
      requiredFields: ['name']
    }
  ],
  retryPolicy: {
    maxRetries: 5,
    retryDelay: 300
  }
};

// 获取数据库实例
const db = ConnectionPool.getInstance(config);

// 使用示例
async function demo() {
  try {
    // 添加数据
    await db.add('users', {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      department: 'IT'
    });

    // 分页查询
    let result = await db.getAll('users', 'department', 'IT', 50);
    while (result.continue) {
      processData(result.results);
      result = await result.continue();
    }

    // 事务操作
    await db.transaction(['users'], 'readwrite', async (stores) => {
      const user = await stores.users.get(1);
      user.lastLogin = new Date();
      await stores.users.put(user);
    });

  } catch (error) {
    console.error('Operation failed:', error);
  }
}
*/

// 导出模块
export const createIndexedDBService = config => {
    return ConnectionPool.getInstance(config)
}
