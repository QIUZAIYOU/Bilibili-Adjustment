// ===== scripts/core/module-system.js =====
window.__biliExt = window.__biliExt || {}

class ModuleSystem {
  #modules = new Map()
  #config = { lazyInit: false }
  #LoggerService

  constructor () {
    if (window.__biliExt.ModuleSystemInstance) return window.__biliExt.ModuleSystemInstance
    this.#LoggerService = window.__biliExt.LoggerService
    window.__biliExt.ModuleSystemInstance = this
  }

  get #logger () { return this.#LoggerService ? new this.#LoggerService('ModuleSystem') : console }

  configure (opts) { if (opts.lazyInit !== undefined) this.#config.lazyInit = opts.lazyInit }

  register (module) {
    if (!module.name) throw new Error('模块必须包含 name 属性')
    if (this.#modules.has(module.name)) { this.#logger.warn(`模块 ${module.name} 已注册`); return }
    this.#modules.set(module.name, {
      definition: module, instance: null, status: 'registered',
      version: module.version || '1.0.0', timestamp: Date.now()
    })
    window.__biliExt.eventBus?.emit('module:registered', { name: module.name })
    this.#logger.debug(`模块已注册: ${module.name}`)
  }

  async init () {
    await window.__biliExt.ConfigService.initializeDefaults()
    window.__biliExt.eventBus?.emit('system:init-start')
    try {
      const names = [...this.#modules.keys()]
      for (const name of names) {
        const meta = this.#modules.get(name)
        await this.#initModule(meta)
      }
      window.__biliExt.eventBus?.emit('system:init-success')
      this.#logger.debug('模块初始化完成')
    } catch (e) { window.__biliExt.eventBus?.emit('system:init-fail', { error: e }); throw e }
  }

  async #initModule (meta) {
    try {
      const def = meta.definition
      meta.instance = Object.create(def)
      for (const [k, v] of Object.entries(def)) {
        meta.instance[k] = typeof v === 'function' ? v.bind(meta.instance) : v
      }
      if (typeof meta.instance.install === 'function') {
        await meta.instance.install()
      }
      meta.status = 'active'
      this.#logger.debug(`模块初始化成功: ${def.name}`)
    } catch (e) { meta.status = 'error'; this.#logger.error(`模块初始化失败: ${meta.definition.name}`, e) }
  }

  getModule (name) {
    const meta = this.#modules.get(name)
    if (!meta) return null
    if (this.#config.lazyInit && !meta.instance) this.#initModule(meta)
    return meta.instance
  }

  unloadModule (name) {
    const meta = this.#modules.get(name)
    if (meta) {
      if (meta.instance?.uninstall) try { meta.instance.uninstall() } catch (e) { this.#logger.warn(`模块卸载失败: ${name}`, e) }
      this.#modules.delete(name)
      window.__biliExt.eventBus?.emit('module:unloaded', { name })
    }
  }

  clearModules () { [...this.#modules.keys()].forEach(n => this.unloadModule(n)) }

  get registeredModules () { return [...this.#modules.keys()] }
  get moduleCount () { return this.#modules.size }
}

window.__biliExt.ModuleSystem = ModuleSystem
if (!window.__biliExt.moduleSystem) window.__biliExt.moduleSystem = new ModuleSystem()
