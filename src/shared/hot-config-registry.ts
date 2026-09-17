/**
 * 热更目标注册表（纯逻辑，零运行时依赖）
 *
 * 为什么要有这一层：热更的目标（选择器 / 正则 / 模板 / 主题 …）分散在各自模块里，
 * 而**页面模块是懒加载的**（`main.ts` 里 video/home/dynamic 都是 `import()`），
 * 所以「启动时同步应用缓存」与「目标模块何时加载」是两个独立事件，谁先谁后都要工作：
 *
 * - 先有内容、后有 target：`registerHotConfigTarget` 时**补应用**（缓存早于模块加载的常见情形）；
 * - 先有 target、后有内容：`setHotConfigEntries` 时**立即应用**（目标已加载后刷新到新内容）。
 *
 * 校验分工：本层只做「白名单 + 逐条 try/catch 丢弃」，**值本身的合法性由各 target 负责**
 * （它才掌握内置值：正则的原 flags、模板的占位符/id 契约、主题的 token 清单）。
 * 这样远端永远无法新增能力，只能修正已有项。
 */
import type { HotConfigSource } from './hot-config'
/** 一张热更表的目标：keys 是白名单（来自内置值），apply 返回 true 表示该条生效 */
export interface HotConfigTarget {
    /** 可被覆盖的 key（内置值里已有的项） */
    keys: () => string[]
    /** 应用单条覆盖：抛错或返回 false 即视为丢弃（错误信息会进日志） */
    apply: (key: string, value: unknown) => boolean
    /** 应用完成后的钩子（如主题需要重新生成 CSS 变量） */
    afterApply?: (applied: string[]) => void
}
/** 单次应用结果（日志与「只缓存生效项」都用它） */
export interface HotConfigReport {
    table: string
    source: HotConfigSource
    applied: string[]
    rejected: string[]
}
/** 日志回调（由 service 注入真实 logger，避免本模块依赖 logger 造成循环引用） */
type HotConfigReporter = (report: HotConfigReport) => void
let reporter: HotConfigReporter = () => {}
/** 注入日志实现（service 初始化时调用一次） */
export const setHotConfigReporter = (fn: HotConfigReporter): void => {
    reporter = fn
}
const targets = new Map<string, HotConfigTarget>()
const entries = new Map<string, { values: Record<string, unknown>, source: HotConfigSource }>()
/** 对某张表执行一次「白名单 + 逐条校验」的应用 */
const applyTable = (table: string): HotConfigReport | null => {
    const state = entries.get(table)
    const target = targets.get(table)
    if (!state || !target) return null
    const allowed = new Set(target.keys())
    const applied: string[] = []
    const rejected: string[] = []
    for (const [key, value] of Object.entries(state.values)) {
        if (!allowed.has(key)) {
            rejected.push(`${key}（不在白名单）`)
            continue
        }
        try {
            if (target.apply(key, value)) applied.push(key)
            else rejected.push(`${key}（值非法）`)
        } catch (error) {
            rejected.push(`${key}（${error instanceof Error ? error.message : String(error)}）`)
        }
    }
    const report: HotConfigReport = { table, source: state.source, applied, rejected }
    if (applied.length && target.afterApply) {
        try {
            target.afterApply(applied)
        } catch (error) {
            report.rejected.push(`afterApply（${error instanceof Error ? error.message : String(error)}）`)
        }
    }
    reporter(report)
    return report
}
/**
 * 记录某张表的最新内容并应用
 * 目标模块还没加载时先存着（返回 null），等它注册时会自动补应用
 */
export const setHotConfigEntries = (table: string, values: Record<string, unknown>, source: HotConfigSource): HotConfigReport | null => {
    entries.set(table, { values, source })
    return applyTable(table)
}
/** 注册（或替换）某张表的目标，并补应用已记录的内容 */
export const registerHotConfigTarget = (table: string, target: HotConfigTarget): HotConfigReport | null => {
    targets.set(table, target)
    return applyTable(table)
}
/** 真正生效的条目（写缓存用：只缓存生效项，避免每次启动重复校验垃圾；目标未注册时原样返回待其校验） */
export const getAcceptedEntries = (table: string, report: HotConfigReport | null): Record<string, unknown> => {
    const values = entries.get(table)?.values || {}
    if (!report) return values
    const accepted: Record<string, unknown> = {}
    for (const key of report.applied) accepted[key] = values[key]
    return accepted
}
/** 当前记录的条目（测试/排查用） */
export const getHotConfigEntries = (table: string): Record<string, unknown> | null => entries.get(table)?.values || null
/** 仅测试用：清空记录（target 注册保留，便于同一会话内重复验证） */
export const clearHotConfigStateForTest = (): void => {
    entries.clear()
}
