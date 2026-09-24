import { LoggerService } from '@/services/logger.service'
import {
    DEFAULT_RETRY_BUDGET_MS,
    DEFAULT_RETRY_INTERVAL_MS,
    describeRetryBudget,
    describeRetryElapsed,
    isRetryBudgetExhausted,
    retryBackoffDelay
} from '@/utils/retry-policy'
// notify:false —— 重试是后台自愈行为，每次尝试都弹通知条会打扰用户；日志（info/warn）已足够可感知
const logger = new LoggerService('RetryQueue', { notify: false })
/** 单个待重试任务 */
interface RetryTask {
    id: string
    retryFn: () => Promise<void> | void
    /** 已尝试次数（含首次） */
    attempts: number
    /** 注册时间：重试预算从这里开始计时 */
    registeredAt: number
    /** 本任务的重试预算（毫秒）；≤ 0 表示不限时 */
    budgetMs: number
    /** 下一次允许尝试的时间点（退避用） */
    nextAt: number
}
/** register 的可选策略 */
export interface RetryOptions {
    /** 重试预算（毫秒），默认 3 分钟；传 0 表示不限时（一直重试到成功或页面离开） */
    budgetMs?: number
}
/** 单次 drain 的结果条目 */
export interface RetryResult {
    id: string
    success: boolean
    error?: Error
}
/**
 * 通用重试队列：功能执行失败时注册，之后**由队列自己按间隔重试**。
 *
 * 收口口径（2026-09-24 起）：**不按次数，按时间预算**。默认在 3 分钟内持续重试，
 * 间隔指数退避（2s → 4s → … 最多 30s），网络差时不会尝试几次就永久放弃；
 * 只有预算真的用完才出队并记一条 warn。
 *
 * ⚠️ 历史坑（2026-09-21 用户报"提示已加入重试队列但永远不重试"）：
 * 旧实现只提供 `drain()`，靠 `executeFunctionsSequentially` 的 `onAfterChunk` 回调驱动。
 * 但 `autoSelectPlayerMode()` 是在那批函数**全部执行完之后**才调用的，它失败时注册任务后
 * 再也没有"下一批"来触发 drain → 任务永远躺在队列里。
 * 现在改为 `register()` 即自行安排一次延迟 drain，并在 drain 后仍有任务时继续安排下一轮，
 * 外部 pump（`onAfterChunk`）保留但只作为"更早一次"的额外机会，不再是唯一驱动。
 *
 * ⚠️ 另一处历史坑（2026-09-24 起）：`drain()` 现在只跑**已到点**的任务（退避未到点的跳过），
 * 因此外部 pump 提前调用不会打断退避节奏，也不会让退避形同虚设。
 */
export class RetryQueue {
    /** 首次重试间隔（毫秒）；测试可传更小值 */
    readonly intervalMs: number
    /** 默认重试预算（毫秒）；单个任务可通过 `register` 的 options 覆盖 */
    readonly budgetMs: number
    private readonly _tasks = new Map<string, RetryTask>()
    /** 已安排的下一轮 drain（每次重排都会先清掉，避免重复排队） */
    private _drainTimer: ReturnType<typeof setTimeout> | null = null
    /** 并发保护：同一时刻只跑一轮 drain，避免重复累加 attempts */
    private _draining = false
    constructor (options: { intervalMs?: number, budgetMs?: number } = {}) {
        this.intervalMs = options.intervalMs ?? DEFAULT_RETRY_INTERVAL_MS
        this.budgetMs = options.budgetMs ?? DEFAULT_RETRY_BUDGET_MS
    }
    /**
     * 注册一个失败任务用于重试（重复注册同 id 会被忽略；注册即安排重试）
     * @param id 任务唯一标识
     * @param retryFn 重试函数（async）；**失败必须抛错**，正常返回即视为成功并出队
     * @param options 重试策略（`budgetMs` 覆盖默认的 3 分钟预算）
     */
    register (id: string, retryFn: () => Promise<void> | void, options: RetryOptions = {}): void {
        if (this._tasks.has(id)) return
        const now = Date.now()
        const budgetMs = options.budgetMs ?? this.budgetMs
        this._tasks.set(id, { id, retryFn, attempts: 0, registeredAt: now, budgetMs, nextAt: now + this.intervalMs })
        logger.debug(`注册重试任务：${id}（预算 ${describeRetryBudget(budgetMs)}，${this.intervalMs}ms 后开始）`)
        this.scheduleDrain()
    }
    /** 安排下一轮 drain：取所有任务中最早到点的时间（队列空则取消安排） */
    private scheduleDrain (): void {
        if (this._drainTimer !== null) {
            clearTimeout(this._drainTimer)
            this._drainTimer = null
        }
        if (this._tasks.size === 0) return
        const now = Date.now()
        let delay = Infinity
        for (const task of this._tasks.values()) delay = Math.min(delay, Math.max(0, task.nextAt - now))
        this._drainTimer = setTimeout(() => {
            this._drainTimer = null
            void this.drain()
        }, delay)
    }
    /**
     * 执行所有**已到点**的待重试任务：成功即出队；预算用尽才放弃并出队；失败按退避推迟到下次。
     * 仍有剩余任务会自动安排下一轮（自己驱动，不依赖外部 pump）。
     */
    async drain (): Promise<RetryResult[]> {
        if (this._draining) return []
        this._draining = true
        const results: RetryResult[] = []
        const now = Date.now()
        try {
            for (const [id, task] of [...this._tasks]) {
                // 退避未到点：本轮跳过，交给下一轮（外部 pump 提前调用也不会打断节奏）
                if (task.nextAt > now) continue
                // 预算用尽（首次仍给一次机会）：放弃并出队，避免永久占用后台
                if (task.attempts > 0 && isRetryBudgetExhausted(task.registeredAt, task.budgetMs, now)) {
                    logger.warn(`重试任务 ${id}：已重试 ${task.attempts} 次、耗时 ${describeRetryElapsed(task.registeredAt, now)}，超出预算 ${describeRetryBudget(task.budgetMs)}，放弃`)
                    this._tasks.delete(id)
                    results.push({ id, success: false, error: new Error('retry budget exhausted') })
                    continue
                }
                task.attempts++
                // 每次尝试都打到 info：用户/排查时能在控制台看到"确实在重试"
                logger.info(`重试任务 ${id}：第 ${task.attempts} 次尝试（已耗时 ${describeRetryElapsed(task.registeredAt)}，预算 ${describeRetryBudget(task.budgetMs)}）`)
                try {
                    await task.retryFn()
                    logger.info(`重试任务 ${id}：第 ${task.attempts} 次成功`)
                    this._tasks.delete(id)
                    results.push({ id, success: true })
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    task.nextAt = Date.now() + retryBackoffDelay(task.attempts, this.intervalMs)
                    logger.warn(`重试任务 ${id}：第 ${task.attempts} 次失败（${message}），下次间隔 ${Math.round((task.nextAt - Date.now()) / 1000)} 秒`)
                    results.push({ id, success: false, error: error instanceof Error ? error : new Error(String(error)) })
                }
            }
        } finally {
            this._draining = false
        }
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
