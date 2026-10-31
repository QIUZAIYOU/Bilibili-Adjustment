import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
import { perfStart, perfEnd } from '@/shared/perf'
import { EVENT_NAMES } from '@/shared/constants'
/** 模块定义对象（各 *.module 的 default 导出） */
export interface ModuleDefinition {
    /** 模块名（与页面类型对应） */
    name: string
    /** 是否支持离线模式（#handleOfflineMode 据此下发） */
    offline?: boolean
    install?: () => Promise<void> | void
    uninstall?: () => Promise<void> | void
    [key: string]: unknown
}
/** 模块实例（由 definition 动态创建，方法已绑定到实例） */
export interface ModuleInstance extends ModuleDefinition {
    enableOfflineMode?: () => void
}
/** 模块运行状态 */
export type ModuleStatus = 'registered' | 'active' | 'error'
/** 内部模块元数据 */
interface ModuleMeta {
    definition: ModuleDefinition
    instance: ModuleInstance | null
    status: ModuleStatus
    timestamp: number
}
export class ModuleSystem {
    static #instance: ModuleSystem | undefined
    #logger = new LoggerService('ModuleSystem')
    #modules = new Map<string, ModuleMeta>()
    constructor () {
        if (ModuleSystem.#instance) {
            return ModuleSystem.#instance
        }
        ModuleSystem.#instance = this
        this.#initEventListeners()
    }
    register (module: ModuleDefinition): void {
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
            timestamp: Date.now()
        })
        eventBus.emit(EVENT_NAMES.MODULE_REGISTERED, { name })
        this.#logger.debug(`模块已注册: ${name}`)
    }
    async init (): Promise<void> {
        await ConfigService.initializeDefaults()
        const startTime = Date.now()
        // P1-4.2：模块系统初始化耗时同时进 Performance API（adj:system:init）
        perfStart('system:init')
        eventBus.emitMeasured(EVENT_NAMES.SYSTEM_INIT_START, { timestamp: startTime })
        try {
            const moduleNames = Array.from(this.#modules.keys())
            this.#logger.debug(`正在初始化模块: ${moduleNames.join(', ')}`)
            await this.#initializeModules(moduleNames)
            eventBus.emitMeasured(EVENT_NAMES.SYSTEM_INIT_SUCCESS, {
                duration: Date.now() - startTime,
                moduleCount: this.#modules.size
            })
            this.#logger.debug(`模块初始化完成，耗时: ${Date.now() - startTime} 毫秒`)
        } catch (error) {
            eventBus.emitMeasured(EVENT_NAMES.SYSTEM_INIT_FAIL, { error })
            throw this.#enhanceError(error, '系统初始化失败')
        } finally {
            perfEnd('system:init', { modules: this.#modules.size })
        }
    }
    getModule (name: string): ModuleInstance | null {
        const moduleMeta = this.#modules.get(name)
        if (!moduleMeta) return null
        return moduleMeta.instance
    }
    // 卸载模块
    async unloadModule (moduleName: string): Promise<void> {
        const moduleMeta = this.#modules.get(moduleName)
        if (moduleMeta) {
            // 调用模块的卸载方法（如果存在）
            const instance = moduleMeta.instance
            if (instance && typeof instance.uninstall === 'function') {
                try {
                    await instance.uninstall()
                } catch (error) {
                    this.#handleError(`模块 ${moduleName} 卸载失败`, 'warn', { error })
                }
            }
            // 从模块列表中移除
            this.#modules.delete(moduleName)
            eventBus.emit(EVENT_NAMES.MODULE_UNLOADED, { name: moduleName })
            this.#logger.debug(`模块已卸载: ${moduleName}`)
        }
    }
    // 清空所有模块
    async clearModules (): Promise<void> {
        const moduleNames = Array.from(this.#modules.keys())
        await Promise.all(moduleNames.map(name => this.unloadModule(name)))
        this.#logger.debug('所有模块已清空')
    }
    async #initializeModule (moduleMeta: ModuleMeta): Promise<void> {
        const moduleName = moduleMeta.definition.name
        // P1-4.2：每模块初始化耗时（adj:module:init:<name>）
        perfStart(`module:init:${moduleName}`)
        try {
            moduleMeta.instance = this.#createModuleInstance(moduleMeta.definition)
            const instance = moduleMeta.instance
            if (instance && typeof instance.install === 'function') {
                await instance.install()
            }
            moduleMeta.status = 'active'
            this.#logger.debug(`模块初始化成功: ${moduleName}`)
        } catch (error) {
            moduleMeta.status = 'error'
            // 初始化失败：必须置空实例，否则 getModule() 会把「装了一半」的对象交出去，
            // 调用方以为模块可用（审查 W6）
            moduleMeta.instance = null
            this.#handleError(error, 'critical', { module: moduleName })
        } finally {
            perfEnd(`module:init:${moduleName}`)
        }
    }
    async #initializeModules (moduleNames: string[]): Promise<void> {
        await Promise.all(moduleNames.map(name => {
            const moduleMeta = this.#modules.get(name)!
            return this.#initializeModule(moduleMeta)
        }))
    }
    #validateModule (module: ModuleDefinition): void {
        if (!module.name) {
            throw new Error('模块必须包含 name 属性')
        }
    }
    /**
     * 创建模块实例
     *
     * 说明（2026-10-31 评估过但**保留**绑定）：试过只 `Object.create(definition)`（省掉每个方法的 bind），
     * 但模块里大量把方法当回调传出去（`executeFunctionsSequentially([this.foo])`、`eventBus.on(x, this.fn)`），
     * 脱钩后 `this` 会丢 —— 绑定是必须的，不能省。这里只保留原来的语义。
     */
    #createModuleInstance (moduleDef: ModuleDefinition): ModuleInstance {
        const instance = Object.create(moduleDef) as ModuleInstance
        Object.entries(moduleDef).forEach(([key, value]) => {
            if (typeof value === 'function') {
                instance[key] = value.bind(instance)
            } else {
                instance[key] = value
            }
        })
        return instance
    }
    #initEventListeners (): void {
        eventBus.on(EVENT_NAMES.NETWORK_OFFLINE, () => {
            this.#handleOfflineMode()
        })
        // 2026-10-31 审查（W5）：此前这里挂 #tryFallback，但全仓没有任何 `<name>-fallback`
        // 模块注册者，且它把 ModuleMeta 当 ModuleDefinition 再 register（缺 name 必抛）——
        // 是「永远走不到、走到就报错」的死代码，直接删掉。MODULE_ERROR 仍照常 emit，
        // 供外部（控制台/排查脚本）观察。
    }
    #handleOfflineMode (): void {
        this.#modules.forEach(module => {
            if (module.definition.offline) {
                module.instance?.enableOfflineMode?.()
            }
        })
    }
    #enhanceError (error: unknown, context: string): Error {
        // 原实现直接在任意 error 上挂属性；非 Error 值在严格模式下同样会抛错，故此处仅断言
        const target = error as Error & { moduleSystemContext?: string; timestamp?: string }
        target.moduleSystemContext = context
        target.timestamp = new Date().toISOString()
        return target
    }
    #handleError (message: unknown, level = 'error', metadata: Record<string, unknown> = {}): void {
        // warn 级别（重复注册、卸载失败）只记日志：不造 Error、不 emit MODULE_ERROR
        if (level === 'warn') {
            this.#logger.warn(String(message), metadata)
            return
        }
        // ⚠️ 保留原始 Error 实例（审查 W6）：`new Error(String(err))` 会把 message 变成
        // "Error: xxx" 且丢掉 stack，线上根本没法定位是哪一行炸的
        const error = message instanceof Error ? message : new Error(String(message))
        const enhancedError = this.#enhanceError(error, 'operation')
        eventBus.emit(EVENT_NAMES.MODULE_ERROR, {
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
