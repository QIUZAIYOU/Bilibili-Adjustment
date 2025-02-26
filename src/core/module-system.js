// core/enterprise-module-system.js
import { ConfigService } from '@/services/config.service'
import { eventBus } from './event-bus'
import { LoggerService } from '@/services/logger.service'
const LIFECYCLE_HOOKS = [
    'beforeCreate',
    'created',
    'beforeMount',
    'mounted',
    'beforeUpdate',
    'updated',
    'beforeDestroy',
    'destroyed'
]

export class ModuleSystem {
    static #instance
    #logger = new LoggerService('ModuleSystem')
    #modules = new Map() // {name: ModuleMeta}
    #dependencies = new Map() // 依赖关系图
    #diContainer = new Map() // 依赖注入容器
    #moduleStatus = new Map() // 模块健康状态
    #config = {
        strictMode: true, // 是否启用严格依赖检查
        lazyInit: false, // 延迟初始化模式
        enableDI: true // 是否启用依赖注入
    }
    constructor() {
        if (ModuleSystem.#instance) {
            return ModuleSystem.#instance
        }
        ModuleSystem.#instance = this
        this.#initEventListeners()
    }
    configure(options) {
        Object.assign(this.#config, options)
    }
    // 保持原有注册方式
    register(module, deps = []) {
        this.#validateModule(module)
        const { name } = module

        if (this.#modules.has(name)) {
            this.#handleError(`Module ${name} already registered`, 'warn')
            return
        }

        this.#modules.set(name, {
            definition: module,
            instance: null,
            status: 'registered',
            dependencies: new Set(deps),
            version: module?.version || '1.0.0',
            timestamp: Date.now()
        })

        if (this.#config.enableDI) {
            this.#diContainer.set(`module:${name}`, module)
        }

        eventBus.emit('module:registered', { name })
    }
    async init(options = {}) {
        ConfigService.initializeDefaults()
        const startTime = Date.now()
        eventBus.emit('system:init-start', { timestamp: startTime })

        try {
            const sortedModules = this.#topologicalSort()
            await this.#executeLifecycle(sortedModules, 'init', options)

            eventBus.emit('system:init-success', {
                duration: Date.now() - startTime,
                moduleCount: this.#modules.size
            })
        } catch (error) {
            eventBus.emit('system:init-fail', { error })
            throw this.#enhanceError(error, 'System initialization failed')
        }
    }
    // 新增企业级功能方法
    async hotReload(moduleName) {
        const moduleMeta = this.#modules.get(moduleName)
        if (!moduleMeta) throw new Error(`Module ${moduleName} not found`)

        try {
            await this.#callModuleHook(moduleMeta, 'beforeDestroy')
            await this.#callModuleHook(moduleMeta, 'destroyed')

            // 模拟热更新
            const newModule = await import(`${moduleMeta.definition.filePath}?t=${Date.now()}`)
            this.register(newModule.default)
            await this.init({ silent: true })

            eventBus.emit('module:hot-reload', { name: moduleName })
        } catch (error) {
            eventBus.emit('module:hot-reload-fail', { name: moduleName, error })
        }
    }
    // 保持原有获取方式
    getModule(name) {
        return this.#diContainer.get(`module:${name}`)?.instance
    }
    // 新增状态检查
    getSystemStatus() {
        return {
            modules: Array.from(this.#modules.values()).map(m => ({
                name: m.definition.name,
                status: m.status,
                version: m.version,
                dependencies: Array.from(m.dependencies)
            })),
            health: {
                activeModules: Array.from(this.#modules.values()).filter(m => m.status === 'active').length,
                errorModules: Array.from(this.#moduleStatus.values()).filter(s => s === 'error').length
            }
        }
    }
    #validateModule(module) {
        if (!module.name) {
            throw new Error('Module must have a name property')
        }
        if (this.#config.strictMode && !module.version) {
            throw new Error('Strict mode requires module version')
        }
    }
    #executeLifecycle = async (modules, phase, options) => {
        for (const name of modules) {
            const moduleMeta = this.#modules.get(name)
            try {
                await this.#callModuleHook(moduleMeta, 'beforeCreate')

                moduleMeta.instance = this.#createModuleInstance(moduleMeta.definition)
                await this.#callModuleHook(moduleMeta, 'created')

                if (this.#config.enableDI) {
                    this.#injectDependencies(moduleMeta)
                }

                if (typeof moduleMeta.instance.install === 'function') {
                    const deps = this.#resolveDependencies(name)
                    await moduleMeta.instance.install(...deps)
                }

                await this.#callModuleHook(moduleMeta, 'mounted')
                moduleMeta.status = 'active'
                this.#moduleStatus.set(name, 'healthy')
            } catch (error) {
                moduleMeta.status = 'error'
                this.#moduleStatus.set(name, 'error')
                this.#handleError(error, 'critical', { module: name, phase })
                if (this.#config.strictMode) throw error
            }
        }
    }
    #resolveDependencies = moduleName => {
        return Array.from(this.#dependencies.get(moduleName) || [])
            .map(depName => this.getModule(depName))
            .filter(Boolean)
    }
    #topologicalSort() {
        const visited = new Set()
        const result = []
        const pending = new Set()

        const visit = name => {
            if (pending.has(name)) {
                throw new Error(`Circular dependency detected: ${name}`)
            }

            if (!visited.has(name)) {
                pending.add(name)

                const deps = this.#dependencies.get(name) || new Set()
                deps.forEach(dep => {
                    if (!this.#modules.has(dep)) {
                        throw new Error(`Dependency ${dep} not found for ${name}`)
                    }
                    visit(dep)
                })

                pending.delete(name)
                visited.add(name)
                result.push(name)
            }
        }

        this.#modules.forEach((_, name) => {
            if (!visited.has(name)) visit(name)
        })

        return result
    }
    #callModuleHook = async (moduleMeta, hookName) => {
        if (!moduleMeta?.instance) {
            this.#handleError(`Module instance not initialized for ${moduleMeta.definition.name}`, 'error')
            return
        }

        const { instance } = moduleMeta
        if (typeof instance[hookName] === 'function') {
            await instance[hookName]()
        }
    }
    #createModuleInstance = moduleDef => {
        // 保留原型链的实例化方式
        const instance = Object.create(moduleDef)

        // 使用 defineProperties 确保方法可枚举
        Object.entries(moduleDef).forEach(([key,
                                            value]) => {
            if (typeof value === 'function') {
                instance[key] = value.bind(instance)
            } else {
                instance[key] = value
            }
        })

        return instance
    }
    #injectDependencies = moduleMeta => {
        const { instance } = moduleMeta
        if (!instance.inject) return

        Object.entries(instance.inject).forEach(([key,
                                                  serviceName]) => {
            const service = this.#diContainer.get(serviceName)
            if (!service && this.#config.strictMode) {
                throw new Error(`Dependency ${serviceName} not found for ${moduleMeta.definition.name}`)
            }
            instance[key] = service?.instance || service
        })
    }
    #initEventListeners() {
        eventBus.on('network:offline', () => {
            this.#handleOfflineMode()
        })

        eventBus.on('module:error', ({ module, error }) => {
            this.#tryFallback(module, error)
        })
    }
    #tryFallback = (moduleName, error) => {
        const fallbackModule = this.#modules.get(`${moduleName}-fallback`)
        if (fallbackModule) {
            this.register(fallbackModule)
            eventBus.emit('module:fallback', { original: moduleName })
        }
    }
    #handleOfflineMode() {
        this.#modules.forEach(module => {
            if (module.definition.offline) {
                module.instance.enableOfflineMode()
            }
        })
    }
    #enhanceError = (error, context) => {
        error.moduleSystemContext = context
        error.timestamp = new Date().toISOString()
        return error
    }
    #handleError = (message, level = 'error', metadata = {}) => {
        const error = new Error(message)
        const enhancedError = this.#enhanceError(error, 'operation')

        eventBus.emit('module:error', {
            error: enhancedError,
            level,
            ...metadata
        })

        if (level === 'critical') {
            this.#logger.error(`[CRITICAL] ${message}`, metadata)
        }
    }
}

// 保持单例导出方式不变
export const moduleSystem = new ModuleSystem()
