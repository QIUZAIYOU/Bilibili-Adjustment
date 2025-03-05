import { LoggerService } from '@/services/logger.service'
export class EventBus {
    #logger = new LoggerService('EventBus')
    static #instance
    #events = new Map() // 存储事件处理器 {event: Array<{handler, once, priority}>}
    #interceptors = [] // 全局拦截器
    #debug = false
    constructor() {
        if (EventBus.#instance) return EventBus.#instance
        EventBus.#instance = this
    }
    // 基础监听方法
    on(event, handler, options = {}) {
        const { priority = 0, once = false, namespace = '' } = options
        const eventKey = namespace ? `${namespace}:${event}` : event
        if (!this.#events.has(eventKey)) {
            this.#events.set(eventKey, [])
        }
        this.#events.get(eventKey).push({ handler, once, priority })
        // 按优先级降序排列
        this.#events.get(eventKey).sort((a, b) => b.priority - a.priority)
        return () => this.off(eventKey, handler) // 返回取消订阅函数
    }
    // 一次性监听
    once(event, handler, options) {
        return this.on(event, handler, { ...options, once: true })
    }
    // 取消监听
    off(event, handler) {
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
    // 触发事件（支持异步）
    async emit(event, ...args) {
        const baseEvent = event.split(':')[0]
        const eventChain = [event,
                            baseEvent,
                            '*'] // 处理通配符
        let shouldStop = false
        const context = {
            event,
            cancel: () => shouldStop = true,
            get isCancelled() { return shouldStop }
        }
        // 执行拦截器
        for (const interceptor of this.#interceptors) {
            await interceptor(context, ...args)
            if (context.isCancelled) return
        }
        for (const currentEvent of eventChain) {
            if (!this.#events.has(currentEvent)) continue
            const handlers = [...this.#events.get(currentEvent)] // 创建副本防止循环时修改
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
    // 错误处理
    #handleError(error, context, handler) {
        if (this.#debug) {
            this.#logger.error(`[EventBus] Error in handler for ${context.event}:`, {
                error,
                handler: handler.name || 'anonymous',
                args: context.args
            })
        }
        this.emit('error', { error, context })
    }
    // 添加拦截器
    addInterceptor(interceptor) {
        this.#interceptors.push(interceptor)
        return () => {
            this.#interceptors = this.#interceptors.filter(i => i !== interceptor)
        }
    }
    // 调试模式
    setDebug(enabled) {
        this.#debug = enabled
    }
    // 通配符监听所有事件
    listenAll(handler) {
        return this.on('*', handler)
    }
    // 清除所有监听
    clear() {
        this.#events.clear()
    }
}
// 导出一个单例实例
export const eventBus = new EventBus()
