import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_RETRY_BUDGET_MS,
    MAX_RETRY_INTERVAL_MS,
    describeRequestError,
    describeRetryBudget,
    isRetryBudgetExhausted,
    isRetryableRequestError,
    retryBackoffDelay,
    withRetryBudget
} from '@/utils/retry-policy'
/**
 * 统一重试策略的回归防线（2026-09-24 用户报「重试 3 次太少，网络不好时体验很差」）
 *
 * 旧口径是「次数」收口，几次用完就永久放弃；新口径是「时间预算 + 递增退避」，
 * 下面把退避曲线、预算判据、可重试错误分类都钉住，避免回退成次数口径。
 */
test('退避曲线：指数递增并封顶', () => {
    assert.equal(retryBackoffDelay(1, 1000), 1000, '首次重试用基准间隔')
    assert.equal(retryBackoffDelay(2, 1000), 2000)
    assert.equal(retryBackoffDelay(3, 1000), 4000)
    assert.equal(retryBackoffDelay(6, 1000), 30000, '封顶 30 秒')
    assert.equal(retryBackoffDelay(50, 1000), MAX_RETRY_INTERVAL_MS, '再多次也不会超过封顶值')
    assert.equal(retryBackoffDelay(1), 2000, '默认基准间隔 2 秒')
    assert.equal(retryBackoffDelay(0, 1000), 1000, '非法次数按第 1 次算')
})
test('预算判据：未到预算不放弃，到点即用尽；预算 ≤ 0 表示不限时', () => {
    assert.equal(isRetryBudgetExhausted(0, 1000, 999), false)
    assert.equal(isRetryBudgetExhausted(0, 1000, 1000), true)
    assert.equal(isRetryBudgetExhausted(0, 0, 10 ** 9), false, '预算 0 = 不限时')
    assert.equal(isRetryBudgetExhausted(0, Number.POSITIVE_INFINITY, 10 ** 9), false, '不限时')
    assert.equal(DEFAULT_RETRY_BUDGET_MS, 3 * 60 * 1000, '默认预算 3 分钟')
})
test('预算描述与已耗时描述（日志口径）', () => {
    assert.equal(describeRetryBudget(3 * 60 * 1000), '3 分钟')
    assert.equal(describeRetryBudget(45 * 1000), '45 秒')
    assert.equal(describeRetryBudget(0), '不限时')
    assert.equal(describeRetryBudget(Number.POSITIVE_INFINITY), '不限时')
})
test('只重试临时性失败：超时/网络错误/429/5xx 可重试，其它一律不重试', () => {
    assert.equal(isRetryableRequestError({ code: 'ECONNABORTED' }), true, '超时')
    assert.equal(isRetryableRequestError({ code: 'ERR_NETWORK' }), true, '断网等网络错误')
    assert.equal(isRetryableRequestError({ code: 'ERR_BAD_RESPONSE', response: { status: 429 }}), true, '限流')
    assert.equal(isRetryableRequestError({ code: 'ERR_BAD_RESPONSE', response: { status: 503 }}), true, '服务端故障')
    assert.equal(isRetryableRequestError({ code: 'ERR_BAD_REQUEST', response: { status: 404 }}), false, '资源不存在')
    assert.equal(isRetryableRequestError({ code: 'ERR_BAD_REQUEST', response: { status: 403 }}), false, '没权限')
    assert.equal(isRetryableRequestError({ code: 'ERR_CANCELED' }), false, '用户主动取消')
    assert.equal(isRetryableRequestError(new TypeError('Cannot read properties of undefined')), false, '代码错误不该重试')
    assert.equal(isRetryableRequestError(null), false)
})
test('错误描述：HTTP 状态 / 超时 / 错误码', () => {
    assert.equal(describeRequestError({ response: { status: 429 }}), 'HTTP 429')
    assert.equal(describeRequestError({ code: 'ECONNABORTED' }), '超时')
    assert.equal(describeRequestError({ code: 'ERR_NETWORK' }), 'ERR_NETWORK')
    assert.equal(describeRequestError(new Error('boom')), 'boom')
})
/** 用注入的时钟跑 withRetryBudget：不真实等待，退避曲线与收口完全确定 */
const runWithFakeClock = async (
    failTimes: number,
    options: { budgetMs: number, intervalMs?: number },
    hooks: { shouldRetry?: (error: unknown) => boolean } = {}
): Promise<{ attempts: number, sleeps: number[], gaveUp: boolean, elapsedMs: number }> => {
    let fakeNow = 0
    let attempts = 0
    let gaveUp = false
    const sleeps: number[] = []
    try {
        await withRetryBudget(async () => {
            attempts++
            if (attempts <= failTimes) throw new Error(`第 ${attempts} 次失败`)
            return 'ok'
        }, {
            budgetMs: options.budgetMs,
            intervalMs: options.intervalMs ?? 1000,
            shouldRetry: hooks.shouldRetry ?? ((): boolean => true),
            now: () => fakeNow,
            sleepFn: async (ms: number) => { sleeps.push(ms); fakeNow += ms },
            onGiveUp: () => { gaveUp = true }
        })
    } catch {
        // 预算用尽时把最后一次错误抛出：这里只关心统计结果
    }
    return { attempts, sleeps, gaveUp, elapsedMs: fakeNow }
}
test('withRetryBudget：预算内不按次数收口（旧实现 3 次尝试就放弃）', async () => {
    const result = await runWithFakeClock(5, { budgetMs: 60 * 1000, intervalMs: 1000 })
    assert.equal(result.attempts, 6, '重试到第 6 次成功，旧实现第 3 次就放弃了')
    assert.deepEqual(result.sleeps, [1000, 2000, 4000, 8000, 16000], '退避逐次翻倍')
    assert.equal(result.gaveUp, false)
})
test('withRetryBudget：预算用尽后放弃，并把最后一次错误抛出', async () => {
    const result = await runWithFakeClock(Number.POSITIVE_INFINITY, { budgetMs: 10000, intervalMs: 1000 })
    assert.equal(result.gaveUp, true, '应命中预算收口')
    assert.equal(result.attempts, 5, `10 秒预算内的尝试次数由预算决定：${result.attempts}`)
    assert.ok(result.elapsedMs >= 10000, '放弃时已超出预算')
    await assert.rejects(
        withRetryBudget(async () => { throw new Error('始终失败') }, {
            budgetMs: 1000,
            intervalMs: 100,
            now: (() => { let t = 0; return () => { t += 500; return t } })(),
            sleepFn: async () => {}
        }),
        /始终失败/
    )
})
test('withRetryBudget：退避封顶，不会越等越久到失控', async () => {
    const result = await runWithFakeClock(Number.POSITIVE_INFINITY, { budgetMs: 10 * 60 * 1000, intervalMs: 1000 })
    assert.ok(result.sleeps.length > 6, `应多次重试：${result.sleeps.length}`)
    assert.equal(Math.max(...result.sleeps), MAX_RETRY_INTERVAL_MS, '最长间隔封顶 30 秒')
})
test('withRetryBudget：不可重试的错误立即抛出（重试再久也没用）', async () => {
    let attempts = 0
    await assert.rejects(
        withRetryBudget(async () => { attempts++; throw new Error('404') }, {
            budgetMs: 60 * 1000,
            intervalMs: 10,
            shouldRetry: isRetryableRequestError,
            sleepFn: async () => {}
        }),
        /404/
    )
    assert.equal(attempts, 1, '确定性失败只尝试一次')
})
test('withRetryBudget：预算 ≤ 0 表示不限时（一直重试到成功）', async () => {
    const result = await runWithFakeClock(8, { budgetMs: 0, intervalMs: 10 })
    assert.equal(result.attempts, 9, '不受时间限制，重试到成功')
    assert.equal(result.gaveUp, false)
})
