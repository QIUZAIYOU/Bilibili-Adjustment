import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
export class ModuleSystem {
    static #instance
    #logger = new LoggerService('ModuleSystem')
    #modules = new Map()
    #config = {
        lazyInit: false
    }
    constructor () {
        if (ModuleSystem.#instance) {
            return ModuleSystem.#instance
        }
        ModuleSystem.#instance = this
        this.#initEventListeners()
    }
    configure ({ lazyInit = false }) {
        this.#config.lazyInit = lazyInit
    }
    register (module) {
        this.#validateModule(module)
        const { name } = module
        if (this.#modules.has(name)) {
            this.#handleError(`模块 ${name} 已注册`, 'warn')
            return
        }
        this.#modules.set(name, {
            definition: module,
            instance: null,
            status: 'registered',
            version: module?.version || '1.0.0',
            timestamp: Date.now()
        })
        eventBus.emit('module:registered', { name })
        this.#logger.debug(`模块已注册: ${name}`)
    }
    async init (options = {}) {
        await ConfigService.initializeDefaults()
        const startTime = Date.now()
        eventBus.emit('system:init-start', { timestamp: startTime })
        try {
            const moduleNames = Array.from(this.#modules.keys())
            this.#logger.debug(`正在初始化模块: ${moduleNames.join(', ')}`)
            await this.#initializeModules(moduleNames)
            eventBus.emit('system:init-success', {
                duration: Date.now() - startTime,
                moduleCount: this.#modules.size
            })
            this.#logger.debug(`模块初始化完成，耗时: ${Date.now() - startTime} 毫秒`)
        } catch (error) {
            eventBus.emit('system:init-fail', { error })
            throw this.#enhanceError(error, '系统初始化失败')
        }
    }
    getModule (name) {
        const moduleMeta = this.#modules.get(name)
        if (!moduleMeta) return null
        if (this.#config.lazyInit && !moduleMeta.instance) {
            this.#initializeModule(moduleMeta)
        }
        return moduleMeta.instance
    }
    #initializeModule (moduleMeta) {
        try {
            moduleMeta.instance = this.#createModuleInstance(moduleMeta.definition)
            if (typeof moduleMeta.instance.install === 'function') {
                moduleMeta.instance.install()
            }
            moduleMeta.status = 'active'
            this.#logger.debug(`模块初始化成功: ${moduleMeta.definition.name}`)
        } catch (error) {
            moduleMeta.status = 'error'
            this.#handleError(error, 'critical', { module: moduleMeta.definition.name })
        }
    }
    async #initializeModules (moduleNames) {
        await Promise.all(moduleNames.map(name => {
            const moduleMeta = this.#modules.get(name)
            this.#initializeModule(moduleMeta)
        }))
    }
    #validateModule (module) {
        if (!module.name) {
            throw new Error('模块必须包含 name 属性')
        }
    }
    #createModuleInstance (moduleDef) {
        const instance = Object.create(moduleDef)
        Object.entries(moduleDef).forEach(([key, value]) => {
            if (typeof value === 'function') {
                instance[key] = value.bind(instance)
            } else {
                instance[key] = value
            }
        })
        return instance
    }
    #initEventListeners () {
        eventBus.on('network:offline', () => {
            this.#handleOfflineMode()
        })
        eventBus.on('module:error', ({ module, error }) => {
            this.#tryFallback(module, error)
        })
    }
    #tryFallback (moduleName, error) {
        const fallbackModule = this.#modules.get(`${moduleName}-fallback`)
        if (fallbackModule) {
            this.register(fallbackModule)
            eventBus.emit('module:fallback', { original: moduleName })
        }
    }
    #handleOfflineMode () {
        this.#modules.forEach(module => {
            if (module.definition.offline) {
                module.instance.enableOfflineMode()
            }
        })
    }
    #enhanceError (error, context) {
        error.moduleSystemContext = context
        error.timestamp = new Date().toISOString()
        return error
    }
    #handleError (message, level = 'error', metadata = {}) {
        const error = new Error(message)
        const enhancedError = this.#enhanceError(error, 'operation')
        eventBus.emit('module:error', {
            error: enhancedError,
            level,
            ...metadata
        })
        if (level === 'critical') {
            this.#logger.error(`[严重错误] ${message}`, metadata)
        }
    }
}
export const moduleSystem = new ModuleSystem()
