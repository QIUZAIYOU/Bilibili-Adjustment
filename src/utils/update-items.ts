/**
 * 更新说明解析（纯函数，零依赖 → 便于单测）
 */
/** 单条更新条目：`version` 为空串表示该条无版本号（不渲染版本徽章） */
export interface UpdateItem {
    version: string
    desc: string
}
/**
 * 把更新说明文本解析为条目数组，完全沿旧实现（原 update.service 的 generateUpdateList）规则：
 * - 先按 ';' 分割并 trim、去空；
 * - 若结果不超过 1 段，改按换行分割（并滤掉纯 -/= 的分隔行）；
 * - 每条「x.y.z：描述」拆成版本徽章 + 描述；不匹配的条目版本号为空串。
 * @param changelog 更新说明文本（或已是数组）
 */
export const parseUpdateItems = (changelog?: string | unknown[] | null): UpdateItem[] => {
    let rawItems: unknown = changelog
    if (typeof changelog === 'string') {
        const bySemicolon = changelog
            .split(';')
            .map(item => item.trim())
            .filter(item => item)
        rawItems = bySemicolon.length <= 1
            ? changelog
                .split(/\n/)
                .map(item => item.trim())
                .filter(item => item && !item.match(/^[-=]+$/))
            : bySemicolon
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) return []
    return rawItems.map(item => {
        const match = String(item).match(/^(\d+\.\d+\.\d+)\s*[：:]\s*([\s\S]*)$/)
        if (match) return { version: match[1], desc: match[2].trim() }
        return { version: '', desc: String(item) }
    })
}
