/**
 * 统一重试策略：**不按次数，按「时间预算 + 递增退避」**
 *
 * 背景（2026-09-24 用户报「执行失败后重试次数 3 次太少了，网络不好时体验很差」）：
 * 旧实现用「次数」收口（功能重试队列最多 3 次、B 站接口最多 3 次尝试），网络差时页面/接口恢复得慢，
 * 几次尝试用完就永久放弃 —— 用户看到的是失败一次之后功能再也不自愈。
 * 现统一为：**在时间预算内持续重试**（默认 3 分钟），间隔按指数退避递增并封顶（最多 30 秒一次），
 * 网络恢复后仍有下一次机会；只有预算真的用完才放弃。
 *
 * 纯函数 + 常量，供 `retry-queue.ts`（功能级重试）与 `bili-apis.ts`（接口级重试）共用，
 * 保证两处的退避曲线与收口口径完全一致。
 */
/** 默认重试总时长预算：3 分钟（网络差时页面/接口恢复通常在这个量级内） */
export const DEFAULT_RETRY_BUDGET_MS = 3 * 60 * 1000
/** 默认首次重试间隔（毫秒） */
export const DEFAULT_RETRY_INTERVAL_MS = 2000
/** 退避上限：再久也不超过 30 秒重试一次，保证网络恢复后能及时自愈 */
export const MAX_RETRY_INTERVAL_MS = 30000
/**
 * 第 attempts 次失败后的等待时长（指数退避，封顶）
 * @param attempts 已失败次数（从 1 开始）
 * @param baseMs 首次重试间隔
 * @param maxMs 退避上限
 */
export const retryBackoffDelay = (attempts: number, baseMs: number = DEFAULT_RETRY_INTERVAL_MS, maxMs: number = MAX_RETRY_INTERVAL_MS): number => {
    const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : DEFAULT_RETRY_INTERVAL_MS
    const safeMax = Number.isFinite(maxMs) && maxMs > 0 ? Math.max(safeBase, maxMs) : safeBase
    const safeAttempts = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 1
    return Math.min(safeBase * 2 ** (safeAttempts - 1), safeMax)
}
/**
 * 重试预算是否已用尽
 * @param startedAt 首次尝试的时间戳
 * @param budgetMs 预算（毫秒）；≤ 0 或非有限值表示不限时
 * @param now 当前时间戳（便于测试注入）
 */
export const isRetryBudgetExhausted = (startedAt: number, budgetMs: number, now: number = Date.now()): boolean =>
    Number.isFinite(budgetMs) && budgetMs > 0 && now - startedAt >= budgetMs
/** 预算的可读描述（日志用）：180000 → 「3 分钟」 */
export const describeRetryBudget = (budgetMs: number): string => {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) return '不限时'
    const seconds = Math.max(1, Math.round(budgetMs / 1000))
    return seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60)} 分钟`
}
/** 已耗时描述（日志用，秒） */
export const describeRetryElapsed = (startedAt: number, now: number = Date.now()): string =>
    `${Math.max(0, Math.round((now - startedAt) / 1000))} 秒`
/**
 * 请求错误是否值得重试。
 *
 * 只重试「临时性」失败：超时、网络错误、429、5xx —— 这类失败等一会儿可能就好了。
 * 400/403/404 等确定性失败（参数不对、没权限、资源不存在）重试再久也没用，直接抛出。
 * 用户主动取消（ERR_CANCELED）同样不重试。
 */
export const isRetryableRequestError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false
    const httpError = error as { code?: string, response?: { status?: number }}
    if (httpError.code === 'ERR_CANCELED') return false
    const status = httpError.response?.status
    if (typeof status === 'number') return status === 429 || status >= 500
    // 没有 response 的失败来自 fetch 本身：超时（ECONNABORTED）或网络错误（ERR_NETWORK）
    return httpError.code === 'ECONNABORTED' || httpError.code === 'ERR_NETWORK'
}
/** 请求失败原因的可读描述（日志用）：HTTP 429 / 超时 / ERR_NETWORK */
export const describeRequestError = (error: unknown): string => {
    if (!error || typeof error !== 'object') return String(error)
    const httpError = error as { code?: string, message?: string, response?: { status?: number }}
    const status = httpError.response?.status
    if (typeof status === 'number') return `HTTP ${status}`
    if (httpError.code === 'ECONNABORTED') return '超时'
    return httpError.code || httpError.message || '未知错误'
}
/** 重试过程信息（日志用） */
export interface RetryProgress {
    /** 已失败次数（首次失败为 1） */
    attempts: number
    /** 距首次尝试的耗时（毫秒） */
    elapsedMs: number
    /** 失败原因 */
    error: unknown
}
/** withRetryBudget 的选项 */
export interface RetryBudgetOptions {
    /** 总时长预算（毫秒），默认 3 分钟；≤ 0 表示不限时 */
    budgetMs?: number
    /** 首次重试间隔，默认 2 秒 */
    intervalMs?: number
    /** 退避上限，默认 30 秒 */
    maxIntervalMs?: number
    /** 判断错误是否值得重试，默认全部重试 */
    shouldRetry?: (error: unknown) => boolean
    /** 每次重试前的回调（日志用） */
    onRetry?: (progress: RetryProgress & { delayMs: number }) => void
    /** 预算用尽时的回调（日志用） */
    onGiveUp?: (progress: RetryProgress) => void
    /** 注入 sleep（测试用） */
    sleepFn?: (ms: number) => Promise<void>
    /** 注入当前时间（测试用） */
    now?: () => number
}
/**
 * 「时间预算 + 递增退避」重试循环：在预算内一直重试，预算用尽才把最后一次的错误抛出。
 *
 * 与 `RetryQueue` 是同一套口径（同用 `retryBackoffDelay` / `isRetryBudgetExhausted`），
 * 区别只在驱动方式：这里适合"调用方在等结果"的同步链路（如接口请求），
 * `RetryQueue` 适合"注册完就走"的后台自愈。
 * `sleepFn` / `now` 可注入，故策略本身能在单测里毫秒级验证完整退避曲线。
 */
export const withRetryBudget = async <T>(attempt: () => Promise<T>, options: RetryBudgetOptions = {}): Promise<T> => {
    const budgetMs = options.budgetMs ?? DEFAULT_RETRY_BUDGET_MS
    const intervalMs = options.intervalMs ?? DEFAULT_RETRY_INTERVAL_MS
    const maxIntervalMs = options.maxIntervalMs ?? MAX_RETRY_INTERVAL_MS
    const shouldRetry = options.shouldRetry ?? ((): boolean => true)
    const now = options.now ?? Date.now
    const sleepFn = options.sleepFn ?? ((ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)))
    const startedAt = now()
    let attempts = 0
    for (;;) {
        try {
            return await attempt()
        } catch (error) {
            attempts++
            const progress: RetryProgress = { attempts, elapsedMs: now() - startedAt, error }
            if (!shouldRetry(error)) throw error
            if (isRetryBudgetExhausted(startedAt, budgetMs, now())) {
                options.onGiveUp?.(progress)
                throw error
            }
            const delayMs = retryBackoffDelay(attempts, intervalMs, maxIntervalMs)
            options.onRetry?.({ ...progress, delayMs })
            await sleepFn(delayMs)
        }
    }
}
