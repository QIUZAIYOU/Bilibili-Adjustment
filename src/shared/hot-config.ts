/**
 * 热更配置表（远程覆盖表）的解析与校验（纯函数，零依赖 → 便于单测）
 *
 * 用途：把脚本里「会随外部变化而过期的配置」放到服务器上，改配置不必让用户更新脚本。
 * 目前两类：`selectors`（元素选择器覆盖）、`ai-providers`（AI 提供商端点与默认模型）。
 *
 * **安全边界（关键）**：远端内容会直接改变脚本行为，因此
 * 1) 只允许覆盖**已存在的 key**（选择器名必须在注册表里、provider 必须在内置表里）——
 *    远端无法新增能力，只能修正已有项；
 * 2) 值的类型/长度都做校验，非法项**逐条丢弃**（不是整表作废），并在日志里报出丢弃数；
 * 3) 拉不到/解析失败时回退本地缓存，再不行就什么都不覆盖（内置值照常工作）。
 */
/** 远端覆盖表载荷 */
export interface HotConfigPayload {
    /** 表名（与文件名一致，便于排查） */
    table: string
    /** 覆盖项：key → 值（字符串或对象） */
    entries: Record<string, unknown>
    /** 生成时间（ISO） */
    updatedAt: string
}
/** 单条字符串覆盖值的长度上限（选择器再长也不会超过它） */
export const MAX_OVERRIDE_VALUE_LENGTH = 500
/**
 * 解析覆盖表原文（文件扩展名是 .js，内容其实是 JSON）
 * @param {unknown} text 服务器返回原文
 * @param {string} expectedTable 期望的表名（与载荷内的 table 不一致时视为非法，防串文件）
 * @returns {HotConfigPayload | null}
 */
export const parseHotConfigPayload = (text: unknown, expectedTable: string): HotConfigPayload | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return null
    }
    if (!data || typeof data !== 'object') return null
    const raw = data as Record<string, unknown>
    // table 字段可选，但一旦声明就必须与文件名一致
    if (typeof raw.table === 'string' && raw.table && raw.table !== expectedTable) return null
    const entries = raw.overrides
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null
    return {
        table: expectedTable,
        entries: entries as Record<string, unknown>,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    }
}
/** 挑出可用的字符串覆盖（key 必须在白名单里，值必须是非空且不过长的字符串） */
export const pickStringOverrides = (
    entries: Record<string, unknown>,
    isAllowed: (key: string) => boolean
): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(entries)) {
        if (!isAllowed(key)) continue
        if (typeof value !== 'string') continue
        const trimmed = value.trim()
        if (!trimmed || trimmed.length > MAX_OVERRIDE_VALUE_LENGTH) continue
        result[key] = trimmed
    }
    return result
}
/** 挑出可用的 provider 覆盖（只认白名单 provider，只取 baseURL / defaultModel 两个字符串字段） */
export const pickProviderOverrides = (
    entries: Record<string, unknown>,
    isAllowed: (key: string) => boolean
): Record<string, { baseURL?: string, defaultModel?: string }> => {
    const result: Record<string, { baseURL?: string, defaultModel?: string }> = {}
    for (const [key, value] of Object.entries(entries)) {
        if (!isAllowed(key)) continue
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const raw = value as Record<string, unknown>
        const override: { baseURL?: string, defaultModel?: string } = {}
        for (const field of ['baseURL', 'defaultModel'] as const) {
            const fieldValue = raw[field]
            if (typeof fieldValue !== 'string') continue
            const trimmed = fieldValue.trim()
            if (!trimmed || trimmed.length > MAX_OVERRIDE_VALUE_LENGTH) continue
            override[field] = trimmed
        }
        if (Object.keys(override).length) result[key] = override
    }
    return result
}
/** 提示词类表格：整体取值（用于 ad-detection-prompt 这类"一整份文本"的表） */
export const readPromptEntry = (entries: Record<string, unknown>): string =>
    typeof entries.prompt === 'string' ? entries.prompt : ''
/** 热更来源（日志用） */
export type HotConfigSource = 'remote' | 'cache' | 'none'
/** 一行来源说明：表名 + 来源 + 生效条数 */
export const describeHotConfig = (table: string, source: HotConfigSource, applied: number, updatedAt = ''): string =>
    `热更配置 ${table}：来源=${source} 生效 ${applied} 项` + (updatedAt ? `（远端生成于 ${updatedAt}）` : '')
