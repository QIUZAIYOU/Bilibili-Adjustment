import { LoggerService } from '@/services/logger.service'
// notify:false —— 重试是后台自愈行为，每次尝试都弹通知条会打扰用户；日志（info/warn）已足够可感知
const logger = new LoggerService('RetryQueue', { notify: false })
/** 单个待重试任务 */
interface RetryTask {
    id: string
    retryFn: () => Promise<void> | void
    retries: number
    maxRetries: number
}
/** 单次 drain 的结果条目 */
export interface RetryResult {
    id: string
    success: boolean
    error?: Error
}
/** 默认重试间隔：失败多是"元素尚未就绪/布局未稳定"，给页面一点时间再试 */
export const DEFAULT_RETRY_INTERVAL_MS = 2000
/**
 * 通用重试队列：功能执行失败时注册，之后**由队列自己按间隔重试**。
 *
 * ⚠️ 历史坑（2026-09-21 用户报"提示已加入重试队列但永远不重试"）：
 * 旧实现只提供 `drain()`，靠 `executeFunctionsSequentially` 的 `onAfterChunk` 回调驱动。
 * 但 `autoSelectPlayerMode()` 是在那批函数**全部执行完之后**才调用的，它失败时注册任务后
 * 再也没有"下一批"来触发 drain → 任务永远躺在队列里。
 * 现在改为 `register()` 即自行安排一次延迟 drain，并在 drain 后仍有任务时继续安排下一轮，
 * 外部 pump（`onAfterChunk`）保留但只作为"更早一次"的额外机会，不再是唯一驱动。
 */
export class RetryQueue {
    /** 重试间隔（毫秒）；测试可传更小值 */
    readonly intervalMs: number
    private readonly _tasks = new Map<string, RetryTask>()
    /** 已安排的下一轮 drain（避免重复排队） */
    private _drainTimer: ReturnType<typeof setTimeout> | null = null
    /** 并发保护：同一时刻只跑一轮 drain，避免重复累加 retries */
    private _draining = false
    constructor (options: { intervalMs?: number } = {}) {
        this.intervalMs = options.intervalMs ?? DEFAULT_RETRY_INTERVAL_MS
    }
    /**
     * 注册一个失败任务用于重试（重复注册同 id 会被忽略；注册即安排重试）
     * @param id 任务唯一标识
     * @param retryFn 重试函数（async）；**失败必须抛错**，正常返回即视为成功并出队
     * @param maxRetries 最大重试次数（默认 3）
     */
    register (id: string, retryFn: () => Promise<void> | void, maxRetries = 3): void {
        if (this._tasks.has(id)) return
        this._tasks.set(id, { id, retryFn, retries: 0, maxRetries })
        logger.debug(`注册重试任务：${id}（最多 ${maxRetries} 次，${this.intervalMs}ms 后开始）`)
        this.scheduleDrain()
    }
    /** 安排一轮延迟 drain（已有安排或队列为空时不重复安排） */
    private scheduleDrain (): void {
        if (this._drainTimer !== null || this._tasks.size === 0) return
        this._drainTimer = setTimeout(() => {
            this._drainTimer = null
            void this.drain()
        }, this.intervalMs)
    }
    /**
     * 执行所有待重试任务：成功则出队，超过最大次数则放弃并记录；仍有剩余会自动安排下一轮
     */
    async drain (): Promise<RetryResult[]> {
        if (this._draining) return []
        this._draining = true
        const results: RetryResult[] = []
        try {
            for (const [id, task] of [...this._tasks]) {
                if (task.retries >= task.maxRetries) {
                    logger.warn(`重试任务 ${id} 已达最大次数 ${task.maxRetries}，放弃`)
                    this._tasks.delete(id)
                    results.push({ id, success: false, error: new Error('max retries exceeded') })
                    continue
                }
                task.retries++
                // 每次尝试都打到 info：用户/排查时能在控制台看到"确实在重试"
                logger.info(`重试任务 ${id}：第 ${task.retries}/${task.maxRetries} 次尝试`)
                try {
                    await task.retryFn()
                    logger.info(`重试任务 ${id}：第 ${task.retries} 次成功`)
                    this._tasks.delete(id)
                    results.push({ id, success: true })
                } catch (error) {
                    logger.warn(`重试任务 ${id}：第 ${task.retries} 次失败（${error instanceof Error ? error.message : String(error)}）`)
                    results.push({ id, success: false, error: error instanceof Error ? error : new Error(String(error)) })
                }
            }
        } finally {
            this._draining = false
        }
        // 还有未成功且未超限的任务 → 继续安排下一轮（自己驱动，不依赖外部 pump）
        this.scheduleDrain()
        return results
    }
    /** 是否有待重试任务 */
    get pending (): boolean {
        return this._tasks.size > 0
    }
    /** 清空队列（同时取消已安排的重试） */
    clear (): void {
        this._tasks.clear()
        if (this._drainTimer !== null) {
            clearTimeout(this._drainTimer)
            this._drainTimer = null
        }
    }
}
export const retryQueue = new RetryQueue()
