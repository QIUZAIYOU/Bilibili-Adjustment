/**
 * 更新说明解析（纯函数，零依赖 → 便于单测）
 */
/**
 * 把更新说明文本解析为条目数组，完全沿旧实现（原 update.service 的 generateUpdateList）规则：
 * - 先按 ';' 分割并 trim、去空；
 * - 若结果不超过 1 段，改按换行分割（并滤掉纯 -/= 的分隔行）；
 * - 每条「x.y.z：描述」拆成版本徽章 + 描述；不匹配的条目版本号为空串。
 * @param {string|Array} changelog 更新说明文本（或已是数组）
 * @returns {Array<{version: string, desc: string}>}
 */
export const parseUpdateItems = changelog => {
    let rawItems = changelog
    if (typeof changelog === 'string') {
        rawItems = changelog
            .split(';')
            .map(item => item.trim())
            .filter(item => item)
        if (rawItems.length <= 1) {
            rawItems = changelog
                .split(/\n/)
                .map(item => item.trim())
                .filter(item => item && !item.match(/^[-=]+$/))
        }
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) return []
    return rawItems.map(item => {
        const match = String(item).match(/^(\d+\.\d+\.\d+)\s*[：:]\s*([\s\S]*)$/)
        if (match) return { version: match[1], desc: match[2].trim() }
        return { version: '', desc: String(item) }
    })
}
