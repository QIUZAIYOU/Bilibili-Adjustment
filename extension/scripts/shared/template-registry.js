// ===== scripts/shared/template-registry.js =====
window.__biliExt = window.__biliExt || {}

class TemplateRegistry {
  #registry = new Map()
  #usageStats = new Map()
  #versions = new Map()
  #logger

  constructor () {
    this.#logger = window.__biliExt.LoggerService ? new window.__biliExt.LoggerService('TemplateRegistry') : console
  }

  register (name, template, meta = {}) {
    if (this.#registry.has(name)) {
      this.#logger.warn(`模板 "${name}" 已存在，将被覆盖`)
    }
    const entry = { template, selectors: meta.selectors || this.#extractSelectors(template), dependencies: new Set(meta.dependencies || []), createdAt: Date.now(), updatedAt: Date.now() }
    this.#registry.set(name, entry)
    this.#versions.set(name, (this.#versions.get(name) || 0) + 1)
    return this
  }

  #extractSelectors (template) {
    const selectors = []
    const regex = /(?:#|\.)[\w-]+(?:[\s>+~][\w.#[\]]+)*/g
    let match
    while ((match = regex.exec(template)) !== null) {
      const sel = match[0].trim()
      if (sel.length > 3 && !selectors.includes(sel)) selectors.push(sel)
    }
    return selectors
  }

  get (name) { const e = this.#registry.get(name); if (e) this.#recordUsage(name); return e ? e.template : null }
  getMeta (name) { return this.#registry.get(name) || null }

  update (name, newTemplate, meta = {}) {
    const existing = this.#registry.get(name)
    if (!existing) { this.#logger.warn(`更新失败，模板未注册: "${name}"`); return }
    existing.template = newTemplate
    if (meta.selectors) existing.selectors = meta.selectors
    else existing.selectors = this.#extractSelectors(newTemplate)
    if (meta.dependencies) existing.dependencies = new Set([...existing.dependencies, ...meta.dependencies])
    existing.updatedAt = Date.now()
    this.#versions.set(name, (this.#versions.get(name) || 1) + 1)
  }

  #recordUsage (name) {
    const s = this.#usageStats.get(name) || { count: 0, lastUsed: null }
    s.count++; s.lastUsed = Date.now()
    this.#usageStats.set(name, s)
  }

  getUsageReport () {
    const r = []
    this.#usageStats.forEach((s, name) => { const m = this.#registry.get(name) || {}; r.push({ name, ...s, selectorCount: m.selectors?.length || 0 }) })
    return r.sort((a, b) => b.count - a.count)
  }

  exportRegistry () {
    const r = {}
    this.#registry.forEach((m, n) => { r[n] = { ...m, dependencies: [...m.dependencies], version: this.#versions.get(n) || 1 } })
    return r
  }

  clear () { this.#registry.clear(); this.#usageStats.clear(); this.#versions.clear() }
  get size () { return this.#registry.size }
}

window.__biliExt.TemplateRegistry = TemplateRegistry
window.__biliExt.templateRegistry = new TemplateRegistry()
