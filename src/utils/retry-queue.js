import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('RetryQueue')
/**
 * 通用重试队列：功能执行失败时注册，后续功能执行间隙自动尝试重试。
 * 用法：
 *   import { retryQueue } from '@/utils/retry-queue'
 *   retryQueue.register('featureId', retryFn, maxRetries)
 *   // 在主执行流中调用
 *   await retryQueue.drain()
 */
class RetryQueue {
    constructor () {
        this._tasks = new Map()
    }
    /**
     * 注册一个失败任务用于重试
     * @param {string} id - 任务唯一标识（重复注册同 id 会被忽略）
     * @param {Function} retryFn - 重试函数（async）
     * @param {number} maxRetries - 最大重试次数（默认 3）
     */
    register (id, retryFn, maxRetries = 3) {
        if (this._tasks.has(id)) return
        this._tasks.set(id, { id, retryFn, retries: 0, maxRetries })
        logger.debug(`注册重试任务：${id}（最多 ${maxRetries} 次）`)
    }
    /**
     * 执行所有待重试任务，成功则移除，超过最大次数则放弃并记录
     * @returns {Promise<Array<{id: string, success: boolean, error?: Error}>>}
     */
    async drain () {
        const results = []
        for (const [id, task] of [...this._tasks]) {
            if (task.retries >= task.maxRetries) {
                logger.warn(`重试任务 ${id} 已达最大次数 ${task.maxRetries}，放弃`)
                this._tasks.delete(id)
                results.push({ id, success: false, error: new Error('max retries exceeded') })
                continue
            }
            task.retries++
            try {
                await task.retryFn()
                logger.debug(`重试任务 ${id}（第 ${task.retries} 次）成功`)
                this._tasks.delete(id)
                results.push({ id, success: true })
            } catch (error) {
                logger.debug(`重试任务 ${id}（第 ${task.retries} 次）失败：${error.message}`)
                results.push({ id, success: false, error })
            }
        }
        return results
    }
    /** 是否有待重试任务 */
    get pending () {
        return this._tasks.size > 0
    }
    /** 清空队列 */
    clear () {
        this._tasks.clear()
    }
}
export const retryQueue = new RetryQueue()
