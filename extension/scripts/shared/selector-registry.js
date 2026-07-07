// ===== scripts/shared/selector-registry.js =====
window.__biliExt = window.__biliExt || {}

class SelectorRegistry {
  #selectors = new Map()
  #usageCount = new Map()
  #logger

  constructor () {
    this.#logger = window.__biliExt.LoggerService ? new window.__biliExt.LoggerService('SelectorRegistry') : console
  }

  register (name, selector, meta = {}) {
    const existing = this.#selectors.get(name)
    if (existing) {
      this.#logger.warn(`选择器 "${name}" 已存在，将被覆盖`)
    }
    this.#selectors.set(name, { selector, meta, createdAt: Date.now() })
    this.#usageCount.set(name, 0)
    this.#logger.debug(`选择器已注册: ${name} -> ${selector}`)
  }

  registerBatch (selectors) {
    Object.entries(selectors).forEach(([name, config]) => {
      const selector = typeof config === 'string' ? config : config.selector
      const meta = typeof config === 'string' ? {} : config.meta || {}
      this.register(name, selector, meta)
    })
  }

  get (name) {
    const entry = this.#selectors.get(name)
    if (!entry) {
      this.#logger.warn(`选择器未注册: "${name}"`)
      return null
    }
    this.#usageCount.set(name, (this.#usageCount.get(name) || 0) + 1)
    return entry.selector
  }

  resolve (name) {
    const selector = this.get(name)
    if (!selector) return null
    const el = document.querySelector(selector)
    return el
  }

  resolveAll (name) {
    const selector = this.get(name)
    if (!selector) return []
    return [...document.querySelectorAll(selector)]
  }

  has (name) { return this.#selectors.has(name) }

  getUsageStats () {
    const stats = []
    this.#selectors.forEach((entry, name) => {
      stats.push({ name, selector: entry.selector, usageCount: this.#usageCount.get(name) || 0 })
    })
    return stats.sort((a, b) => b.usageCount - a.usageCount)
  }

  remove (name) {
    this.#selectors.delete(name)
    this.#usageCount.delete(name)
  }

  clear () { this.#selectors.clear(); this.#usageCount.clear() }

  get size () { return this.#selectors.size }
}

window.__biliExt.SelectorRegistry = SelectorRegistry
window.__biliExt.selectorRegistry = new SelectorRegistry()
