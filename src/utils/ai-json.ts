/**
 * AI 返回内容的 JSON 解析工具（纯函数）。
 *
 * 抽成独立模块的原因：
 *   1. 这些函数不依赖任何运行环境，是**适合单测**的形态（见 test/ai-json.test.js）；
 *   2. 原先放在 ai.service.js 里是模块内私有，既无法直接测试，
 *      也让整个大模块承担了解析职责，职责不清。
 */
/**
 * 从模型输出中提取一个 JSON 数组。
 *
 * 旧实现用贪婪正则，会一直匹配到**最后一个** `]`：
 * 只要模型在 JSON 之后还说了句话、或正文里还有别的中括号，就会多带一截尾巴，
 * 导致 JSON.parse 失败——而日志只打印前 200 字符，肉眼根本看不出问题在哪。
 *
 * 这里改为**括号配平**扫描：正确跳过字符串字面量里的括号与转义，
 * 取第一个完整的数组；不配平（多半被 max_tokens 截断）时返回 null。
 */
export const extractJsonArray = (text: string): string | null => {
    const start = text.indexOf('[')
    if (start === -1) return null
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (ch === '\\') escaped = true
            else if (ch === '"') inString = false
            continue
        }
        if (ch === '"') inString = true
        else if (ch === '[') depth++
        else if (ch === ']') {
            depth--
            if (depth === 0) return text.slice(start, i + 1)
        }
    }
    return null
}
/** 把模型偶尔输出的中文/全角引号、以及不可见控制字符规整掉（只在常规解析失败后兜底尝试） */
export const sanitizeJsonText = (text: unknown): string => String(text)
    .replace(/[\u201c\u201d\u2033]/g, String.fromCharCode(34))
    .replace(/[\u2018\u2019]/g, String.fromCharCode(39))
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/,\s*([}\]])/g, '$1')
/** 截断补全：把缺的 ] } 补齐（模型被 max_tokens 截断时很常见） */
export const repairTruncated = (text: string): string => {
    let out = text.trim()
    const opens: string[] = []
    let inString = false
    let escaped = false
    for (const ch of out) {
        if (inString) {
            if (escaped) escaped = false
            else if (ch === '\\') escaped = true
            else if (ch === '"') inString = false
            continue
        }
        if (ch === '"') inString = true
        else if (ch === '[' || ch === '{') opens.push(ch)
        else if (ch === ']' || ch === '}') opens.pop()
    }
    if (inString) out += '"'
    while (opens.length) out += opens.pop() === '[' ? ']' : '}'
    return out
}
/**
 * 渐进式解析出 JSON 数组：原样 → 括号配平提取 → 常见格式修复 → 截断补全，逐个尝试。
 * 全部失败时返回最后一次报错，供调用方决定是否用更大输出预算重试。
 * @param {string} text 模型输出的原始内容（已去掉 Markdown 围栏）
 * @returns {{parsed: Array<Record<string, unknown>> | null, error: Error | null}}
 */
export const parseJsonArrayLoose = (text: string): { parsed: Array<Record<string, unknown>> | null, error: Error | null } => {
    const jsonStr = extractJsonArray(text) || text
    let error: Error | null = null
    for (const candidate of [jsonStr, repairTruncated(jsonStr), sanitizeJsonText(jsonStr), repairTruncated(sanitizeJsonText(jsonStr))]) {
        try {
            const attempt = JSON.parse(candidate)
            if (Array.isArray(attempt)) return { parsed: attempt as Array<Record<string, unknown>>, error: null }
            error = error || new Error('解析结果不是数组')
        } catch (parseError) {
            error = parseError instanceof Error ? parseError : new Error(String(parseError))
        }
    }
    return { parsed: null, error }
}
