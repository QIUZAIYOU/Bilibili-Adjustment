// ===== scripts/core/event-bus.js =====
window.__biliExt = window.__biliExt || {}

class EventBus {
  #events = new Map()
  #interceptors = []
  #debug = false
  #LoggerService

  constructor () {
    if (window.__biliExt.EventBusInstance) return window.__biliExt.EventBusInstance
    this.#LoggerService = window.__biliExt.LoggerService
    window.__biliExt.EventBusInstance = this
  }

  get #logger () {
    return this.#LoggerService ? new this.#LoggerService('EventBus') : console
  }

  on (event, handler, options = {}) {
    const { priority = 0, once = false, namespace = '' } = options
    const key = namespace ? `${namespace}:${event}` : event
    if (!this.#events.has(key)) this.#events.set(key, [])
    this.#events.get(key).push({ handler, once, priority })
    this.#events.get(key).sort((a, b) => b.priority - a.priority)
    return () => this.off(key, handler)
  }

  once (event, handler, options) { return this.on(event, handler, { ...options, once: true }) }

  off (event, handler) {
    if (!this.#events.has(event)) return
    const handlers = this.#events.get(event)
    const updated = handler ? handlers.filter(h => h.handler !== handler) : []
    if (updated.length) this.#events.set(event, updated); else this.#events.delete(event)
  }

  async emit (event, ...args) {
    const baseEvent = event.split(':')[0]
    const chain = [event, baseEvent, '*']
    let cancelled = false
    const ctx = { event, cancel: () => { cancelled = true }, get isCancelled () { return cancelled } }
    for (const ic of this.#interceptors) { await ic(ctx, ...args); if (cancelled) return }
    for (const cur of chain) {
      if (!this.#events.has(cur)) continue
      for (const { handler, once } of [...this.#events.get(cur)]) {
        if (once) this.off(cur, handler)
        try { const r = handler(ctx, ...args); if (r?.then) await r } catch (e) { this.#handleError(e, ctx, handler) }
        if (cancelled) return
      }
    }
  }

  #handleError (error, context, handler) {
    if (this.#debug) this.#logger.error(`[EventBus] 处理 ${context.event} 事件错误:`, error)
    this.emit('error', { error, context })
  }

  addInterceptor (interceptor) { this.#interceptors.push(interceptor); return () => { this.#interceptors = this.#interceptors.filter(i => i !== interceptor) } }
  setDebug (enabled) { this.#debug = enabled }
  listenAll (handler) { return this.on('*', handler) }
  clear () { this.#events.clear(); this.#interceptors = [] }
}

window.__biliExt.EventBus = EventBus
if (!window.__biliExt.eventBus) window.__biliExt.eventBus = new EventBus()
