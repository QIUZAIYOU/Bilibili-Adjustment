import { LoggerService } from '@/services/logger.service'
export class EventBus {
    #logger = new LoggerService('EventBus')
    static #instance
    #events = new Map()
    #interceptors = []
    #debug = false
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
        this.#events.get(eventKey).push({ handler, once, priority })
        this.#events.get(eventKey).sort((a, b) => b.priority - a.priority)
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
    #handleError (error, context, handler) {
        if (this.#debug) {
            this.#logger.error(`[EventBus] Error in handler for ${context.event}:`, {
                error,
                handler: handler.name || 'anonymous',
                args: context.args
            })
        }
        this.emit('error', { error, context })
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
