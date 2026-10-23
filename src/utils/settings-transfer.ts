/**
 * 设置项导入/导出的纯逻辑（零依赖 → 便于单测）
 *
 * 背景：设置面板的「导出/导入」直接读写 IndexedDB，判定逻辑混在宿主（settings-dialog.ts）里，
 * 出问题只能靠手点复现。这里把「解析文件 → 区分当前版本认识/不认识的键 → 生成导出载荷 →
 * 组织提示文案」抽成纯函数，宿主只负责文件与存储的 IO，回归见 test/settings-transfer.test.ts。
 *
 * 两条设计约束（都是踩过的坑）：
 * 1. **导入不得静默丢数据**：当前版本不认识的键（用户从更高版本导出、或手改了文件）仍然原样写入
 *    本地库 —— 当前版本不读它，但用户降级/升级回来还能找回；只是必须明确告诉用户「有几项没生效」。
 * 2. **导出与导入必须对称**：导出只写当前 schema 认识的键，导入端的白名单来自同一份 schema
 *    （ConfigService.DEFAULT_VALUES 由 settings-config 派生），保证「导出→导入」能完整回写。
 */
/** 单条配置项（与 IndexedDB 里 {key, value} 的形态一致） */
export interface SettingsTransferEntry {
    key: string
    value: unknown
}
/** 解析结果 */
export interface ParsedSettingsPayload {
    /** 文件里的全部合法条目（按键去重，保留出现顺序） */
    entries: SettingsTransferEntry[]
    /** 文件不是合法的配置载荷（JSON 解析失败或顶层结构不对） */
    malformed: boolean
    /** 条目数超过上限（异常文件，不导入） */
    tooLarge: boolean
}
/** 导入条目上限：超过则判定为异常文件，避免把海量垃圾键写进本地库 */
export const MAX_IMPORT_ENTRIES = 500
/**
 * 取**本地**日期（YYYY-MM-DD）。
 * 导出文件名原来用 `new Date().toISOString().slice(0, 10)`，那是 UTC 日期 —— 东八区凌晨 0 点到
 * 8 点之间会写成「昨天」，用户按文件名判断导出于哪天会差一天。
 */
export const formatLocalDateStamp = (date: Date = new Date()): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}
/**
 * 解析设置导出文件内容。
 * 兼容两种格式：新版 {key: value} 与旧版 [{key, value, timestamp}]。
 * 键做去重与空值剔除（空串/纯空白/非字符串），值原样保留（类型归一化由 ConfigService 负责）。
 */
export const parseSettingsPayload = (text: string): ParsedSettingsPayload => {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return { entries: [], malformed: true, tooLarge: false }
    }
    const entries: SettingsTransferEntry[] = []
    const seen = new Set<string>()
    const push = (key: unknown, value: unknown): void => {
        if (typeof key !== 'string') return
        const name = key.trim()
        if (!name || seen.has(name)) return
        seen.add(name)
        entries.push({ key: name, value })
    }
    if (Array.isArray(data)) {
        // 旧版格式：[{key, value, timestamp}]
        for (const item of data) {
            if (!item || typeof item !== 'object') continue
            const record = item as { key?: unknown; value?: unknown }
            push(record.key, record.value)
        }
    } else if (typeof data === 'object' && data !== null) {
        // 新版格式：{key: value}
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            push(key, value)
        }
    } else {
        return { entries: [], malformed: true, tooLarge: false }
    }
    if (entries.length > MAX_IMPORT_ENTRIES) {
        return { entries: [], malformed: false, tooLarge: true }
    }
    return { entries, malformed: false, tooLarge: false }
}
/**
 * 按当前 schema 认识的键拆分条目。
 * - knownEntries：会被立即应用；
 * - unknownKeys：当前版本不识别，仍会原样保留写入（不丢数据），但必须提示用户「没生效」。
 */
export const splitKnownEntries = (entries: SettingsTransferEntry[], knownKeys: Iterable<string>): { knownEntries: SettingsTransferEntry[]; unknownKeys: string[] } => {
    const known = new Set(knownKeys)
    const knownEntries: SettingsTransferEntry[] = []
    const unknownKeys: string[] = []
    for (const entry of entries) {
        if (known.has(entry.key)) knownEntries.push(entry)
        else unknownKeys.push(entry.key)
    }
    return { knownEntries, unknownKeys }
}
/**
 * 生成导出载荷：默认值为底、已存值覆盖，保证每一项设置都被导出。
 * 只导出当前 schema 认识的键 —— 与导入端的白名单对称，避免导出一堆无法回写的键。
 * 存值为 null/undefined 视为「没存过」而回落默认值，与 ConfigService.initializeDefaults 的口径一致。
 */
export const buildSettingsExportPayload = (stored: Record<string, unknown> | null | undefined, defaults: Iterable<[string, unknown]>): Record<string, unknown> => {
    const payload: Record<string, unknown> = {}
    for (const [key, defaultValue] of defaults) {
        const storedValue = stored?.[key]
        payload[key] = storedValue === undefined || storedValue === null ? defaultValue : storedValue
    }
    return payload
}
/** 导入结果文案：已知项立即生效，未知项原样保留但当前版本不生效，必须说清楚 */
export const formatImportSummary = (knownCount: number, unknownKeys: string[]): string => {
    if (!unknownKeys || unknownKeys.length === 0) return `成功导入 ${knownCount} 项配置`
    const preview = unknownKeys.slice(0, 5).join('、')
    const suffix = unknownKeys.length > 5 ? ' 等' : ''
    return `成功导入 ${knownCount} 项配置，另有 ${unknownKeys.length}${suffix} 项当前版本不识别（已原样保留：${preview}）`
}
