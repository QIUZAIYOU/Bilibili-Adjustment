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
/** emit 时传给 handler 的上下文 */
export interface EventContext {
    event: string
    cancel: () => void
    readonly isCancelled: boolean
    /** 兼容字段：旧实现 #handleError 会读取 context.args（实际从未写入，恒为 undefined） */
    readonly args?: unknown[]
}
/** 事件处理函数：首参为上下文，其余为 emit 负载 */
export type EventHandler = (context: EventContext, ...args: unknown[]) => unknown
/** on() 的选项 */
export interface EventOnOptions {
    /** 优先级（降序插入，默认 0） */
    priority?: number
    /** 只触发一次 */
    once?: boolean
    /** 命名空间（事件键为 `${namespace}:${event}`） */
    namespace?: string
}
/** 已注册的 handler 记录 */
interface HandlerRecord {
    handler: EventHandler
    once: boolean
    priority: number
}
/** 拦截器：在事件分发前执行，可调用 context.cancel() 阻止后续分发 */
export type EventInterceptor = (context: EventContext, ...args: unknown[]) => unknown
const ERROR_EMIT_MAX_DEPTH = 3
export class EventBus {
    #logger = new LoggerService('EventBus')
    static #instance: EventBus | undefined
    #events = new Map<string, HandlerRecord[]>()
    #interceptors: EventInterceptor[] = []
    #emitDepth = 0
    constructor () {
        if (EventBus.#instance) return EventBus.#instance
        EventBus.#instance = this
    }
    on (event: string, handler: EventHandler, options: EventOnOptions = {}): () => void {
        const { priority = 0, once = false, namespace = '' } = options
        const eventKey = namespace ? `${namespace}:${event}` : event
        if (!this.#events.has(eventKey)) {
            this.#events.set(eventKey, [])
        }
        const handlers = this.#events.get(eventKey)!
        // P1-4.1：按 priority 插入（降序），替代每次注册后整体 sort
        const record = { handler, once, priority }
        let index = handlers.length
        while (index > 0 && handlers[index - 1].priority < priority) {
            index--
        }
        handlers.splice(index, 0, record)
        return () => this.off(eventKey, handler)
    }
    once (event: string, handler: EventHandler, options?: Omit<EventOnOptions, 'once'>): () => void {
        return this.on(event, handler, { ...options, once: true })
    }
    off (event: string, handler?: EventHandler): void {
        if (!this.#events.has(event)) return
        const handlers = this.#events.get(event)!
        const newHandlers = handler ?
            handlers.filter(h => h.handler !== handler) : []
        if (newHandlers.length) {
            this.#events.set(event, newHandlers)
        } else {
            this.#events.delete(event)
        }
    }
    async emit (event: string, ...args: unknown[]): Promise<void> {
        const baseEvent = event.split(':')[0]
        const eventChain = [event, baseEvent, '*']
        let shouldStop = false
        const context: EventContext = {
            event,
            cancel: () => { shouldStop = true },
            get isCancelled () { return shouldStop }
        }
        for (const interceptor of this.#interceptors) {
            await interceptor(context, ...args)
            if (context.isCancelled) return
        }
        for (const currentEvent of eventChain) {
            if (!this.#events.has(currentEvent)) continue
            const handlers = [...this.#events.get(currentEvent)!]
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
    async emitMeasured (event: string, ...args: unknown[]): Promise<void> {
        if (!MEASURED_EVENTS.has(event)) return this.emit(event, ...args)
        perfStart(`event:${event}`)
        try {
            return await this.emit(event, ...args)
        } finally {
            perfEnd(`event:${event}`)
        }
    }
    #handleError (error: unknown, context: EventContext, handler: EventHandler): void {
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
    addInterceptor (interceptor: EventInterceptor): () => void {
        this.#interceptors.push(interceptor)
        return () => {
            this.#interceptors = this.#interceptors.filter(i => i !== interceptor)
        }
    }
    clear (): void {
        this.#events.clear()
    }
}
export const eventBus = new EventBus()
