/**
 * 性能埋点（Sprint 0）
 *
 * 统一约定：所有关键路径用 `adj:<name>` 前缀的 Performance mark/measure，
 * 开发模式输出耗时，生产保留 measure 供 DevTools Performance 面板查看。
 * 目的：任何优化先有 baseline，再谈收益（见 docs/performance-guardrails.md）。
 */
const PREFIX = 'adj:'
const canUsePerformance = typeof performance !== 'undefined' && typeof performance.mark === 'function'
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
const isDev = (() => {
    try {
        return Boolean(import.meta.env && import.meta.env.DEV)
    } catch {
        return false
    }
})()
const started = new Map()
const records = []
/** 打一个瞬时 mark（不产生耗时记录） */
export const perfMark = name => {
    if (!canUsePerformance) return
    try {
        performance.mark(PREFIX + name)
    } catch { /* 忽略：performance 缓冲区满或不可用 */ }
}
/** 开始计时（可与 perfEnd 配对，支持异步/跨函数计时） */
export const perfStart = name => {
    started.set(name, now())
    if (canUsePerformance) {
        try {
            performance.mark(`${PREFIX}${name}:start`)
        } catch { /* 忽略 */ }
    }
}
/** 结束计时：返回耗时（ms，保留 1 位小数），并记录 measure */
export const perfEnd = (name, meta) => {
    const startAt = started.get(name)
    if (startAt === undefined) return null
    started.delete(name)
    const duration = Math.round((now() - startAt) * 10) / 10
    records.push({ name, duration, meta: meta || null, at: Date.now() })
    if (canUsePerformance) {
        try {
            performance.mark(`${PREFIX}${name}:end`)
            performance.measure(`${PREFIX}${name}`, `${PREFIX}${name}:start`, `${PREFIX}${name}:end`)
        } catch { /* 忽略 */ }
    }
    if (isDev) console.debug(`[perf] ${name}: ${duration}ms`, meta || '')
    return duration
}
/** 计时包裹：同步/异步均可，异常时仍结束计时 */
export const perfTime = async (name, fn, meta) => {
    perfStart(name)
    try {
        return await fn()
    } finally {
        perfEnd(name, meta)
    }
}
/** 全部埋点记录（排障用，生产不输出） */
export const getPerfRecords = () => records.slice()
/** 汇总：同名多次取最近一次，便于一次性打印 */
export const getPerfSummary = () => {
    const summary = new Map()
    for (const record of records) summary.set(record.name, record.duration)
    return Array.from(summary, ([name, duration]) => ({ name, duration }))
}
try {
    // 共享 window 环境下暴露只读入口，便于手动排障（沙盒受限时静默跳过）
    if (isDev) window.BA_PERF = { getPerfRecords, getPerfSummary }
} catch { /* 忽略沙盒限制 */ }
