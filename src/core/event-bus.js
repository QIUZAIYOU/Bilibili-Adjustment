import { LoggerService } from '@/services/logger.service'
import { perfStart, perfEnd } from '@/shared/perf'
// P1-4.1：可并行 emit 的事件白名单 —— 这些事件的 handler 之间无先后依赖，
// 用 allSettled 并行避免单个慢 handler 头阻塞。
// 注意：config:changed 等会串改共享状态/UI 顺序的事件**不能**并行，保持串行。
const PARALLEL_EVENTS = new Set([
    'app:ready',
    'logger:show'
])
// 需要输出耗时 metric 的关键事件（APP_READY / 系统初始化）
const MEASURED_EVENTS = new Set([
    'app:ready',
    'system:init-start',
    'system:init-success',
    'system:init-fail'
])
// error 事件嵌套深度上限：防止 handler 抛错 → emit('error') → 再抛错形成递归风暴
const ERROR_EMIT_MAX_DEPTH = 3
export class EventBus {
    #logger = new LoggerService('EventBus')
    static #instance
    #events = new Map()
    #interceptors = []
    #debug = false
    #emitDepth = 0
    constructor () {
        if (EventBus.#instance) return EventBus.#instance
        EventBus.#instance = this
    }
    on (event, handler, options = {}) {
        const { priority = 0, once = false, namespace = '' } = options
        const eventKey = namespace ? `${namespace}:${event}` : event
        if (!this.#events.has(eventKey)) {
            this.#events.set(eventKey, [])
        }
        const handlers = this.#events.get(eventKey)
        // P1-4.1：按 priority 插入（降序），替代每次注册后整体 sort
        const record = { handler, once, priority }
        let index = handlers.length
        while (index > 0 && handlers[index - 1].priority < priority) {
            index--
        }
        handlers.splice(index, 0, record)
        return () => this.off(eventKey, handler)
    }
    once (event, handler, options) {
        return this.on(event, handler, { ...options, once: true })
    }
    off (event, handler) {
        if (!this.#events.has(event)) return
        const handlers = this.#events.get(event)
        const newHandlers = handler ?
            handlers.filter(h => h.handler !== handler) : []
        if (newHandlers.length) {
            this.#events.set(event, newHandlers)
        } else {
            this.#events.delete(event)
        }
    }
    async emit (event, ...args) {
        const baseEvent = event.split(':')[0]
        const eventChain = [event, baseEvent, '*']
        let shouldStop = false
        const context = {
            event,
            cancel: () => shouldStop = true,
            get isCancelled () { return shouldStop }
        }
        for (const interceptor of this.#interceptors) {
            await interceptor(context, ...args)
            if (context.isCancelled) return
        }
        for (const currentEvent of eventChain) {
            if (!this.#events.has(currentEvent)) continue
            const handlers = [...this.#events.get(currentEvent)]
            // P1-4.1：白名单事件并行（allSettled），其余保持串行以保证顺序敏感语义
            if (this.#emitDepth === 0 && PARALLEL_EVENTS.has(currentEvent)) {
                const results = await Promise.allSettled(handlers.map(({ handler, once }) => {
                    if (once) this.off(currentEvent, handler)
                    try {
                        return Promise.resolve(handler(context, ...args))
                    } catch (error) {
                        return Promise.reject(error)
                    }
                }))
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        this.#handleError(result.reason, context, handlers[index].handler)
                    }
                })
                if (context.isCancelled) return
                continue
            }
            for (const { handler, once } of handlers) {
                if (once) this.off(currentEvent, handler)
                try {
                    const result = handler(context, ...args)
                    if (result instanceof Promise) await result
                } catch (error) {
                    this.#handleError(error, context, handler)
                }
                if (context.isCancelled) return
            }
        }
    }
    /**
     * 统一的 emit 入口计时（P1-4.2）
     * @param {string} event
     * @param  {...any} args
     */
    async emitMeasured (event, ...args) {
        if (!MEASURED_EVENTS.has(event)) return this.emit(event, ...args)
        perfStart(`event:${event}`)
        try {
            return await this.emit(event, ...args)
        } finally {
            perfEnd(`event:${event}`)
        }
    }
    #handleError (error, context, handler) {
        if (this.#debug) {
            this.#logger.error(`[EventBus] 处理 ${context.event} 事件时发生错误:`, {
                error,
                handler: handler.name || '匿名函数',
                args: context.args
            })
        }
        // error 事件嵌套防护：handler 抛错上报时若再次抛错，深度超限即丢弃，避免递归风暴
        if (this.#emitDepth >= ERROR_EMIT_MAX_DEPTH) {
            this.#logger.error(`[EventBus] error 事件嵌套过深（>${ERROR_EMIT_MAX_DEPTH}），已丢弃`)
            return
        }
        this.#emitDepth++
        this.emit('error', { error, context, handler: handler?.name || '匿名函数' })
            .catch(() => { /* 上报失败时静默，避免再次触发 error 链 */ })
            .finally(() => { this.#emitDepth-- })
    }
    addInterceptor (interceptor) {
        this.#interceptors.push(interceptor)
        return () => {
            this.#interceptors = this.#interceptors.filter(i => i !== interceptor)
        }
    }
    setDebug (enabled) {
        this.#debug = enabled
    }
    listenAll (handler) {
        return this.on('*', handler)
    }
    clear () {
        this.#events.clear()
    }
}
export const eventBus = new EventBus()
