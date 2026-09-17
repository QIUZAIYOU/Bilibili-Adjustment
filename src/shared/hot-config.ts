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
// ==================== 专项校验（纯函数，规则与「发布侧校验脚本」共用） ====================
/** 正则源串长度上限（正常解析正则不会这么长，超长多为误填） */
export const MAX_REGEX_LENGTH = 500
/** 模板 HTML 长度上限（最大模板约 4KB，留足余量） */
export const MAX_TEMPLATE_LENGTH = 20000
/** 单个 CSS 值（色值/阴影）长度上限 */
export const MAX_CSS_VALUE_LENGTH = 120
/** 模板里的占位符（渲染时被替换，如 [[TEXT]]）——覆盖后必须原样保留，否则渲染出字面占位符 */
export const extractTemplatePlaceholders = (html: string): string[] =>
    Array.from(new Set(html.match(/\[\[[A-Z0-9_]+\]\]/g) || []))
/** 模板里声明的 id —— 调用点按 id 取元素，覆盖后必须保留，否则功能静默失效 */
export const extractTemplateIds = (html: string): string[] =>
    Array.from(new Set(Array.from(html.matchAll(/id="([^"]+)"/g), match => match[1])))
/**
 * 模板覆盖的契约校验（返回拒绝原因；null = 通过）
 * 契约 = 内置模板的**占位符**与**id** 必须全部保留；另外拦掉脚本/事件处理器等可执行内容
 */
export const checkTemplateOverride = (html: unknown, builtIn: string): string | null => {
    if (typeof html !== 'string') return '不是字符串'
    const trimmed = html.trim()
    if (!trimmed) return '空内容'
    if (trimmed.length > MAX_TEMPLATE_LENGTH) return `长度超限（>${MAX_TEMPLATE_LENGTH}）`
    if (/<\s*(script|iframe|object|embed|link|meta|base)\b/i.test(trimmed)) return '含被禁止的标签'
    if (/\son[a-z]+\s*=/i.test(trimmed)) return '含内联事件处理器'
    if (/javascript:/i.test(trimmed)) return '含 javascript: 协议'
    const missingPlaceholders = extractTemplatePlaceholders(builtIn).filter(token => !trimmed.includes(token))
    if (missingPlaceholders.length) return `缺少占位符 ${missingPlaceholders.join(' ')}`
    const missingIds = extractTemplateIds(builtIn).filter(id => !trimmed.includes(`id="${id}"`))
    if (missingIds.length) return `缺少必需 id ${missingIds.join(' ')}`
    return null
}
/**
 * CSS 值安全校验：远端值最终会被拼进 `--adj-xxx:<值>` 的样式表文本，
 * 因此必须挡住「逃出声明」与「引入外部资源」的写法（分号/花括号/注释/url()/尖括号/控制字符）。
 */
export const isSafeCssValue = (value: unknown, maxLength = MAX_CSS_VALUE_LENGTH): boolean => {
    if (typeof value !== 'string') return false
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > maxLength) return false
    if (/[;{}<>\\]/.test(trimmed)) return false
    if (/\/\*|\*\//.test(trimmed)) return false
    if (/url\s*\(/i.test(trimmed)) return false
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false
    return true
}
/** 色值校验：只认 #hex / rgb()·rgba()·hsl()·hsla()（纯数值）/ `r,g,b` 裸三元组（`*-rgb` token 用） */
export const isSafeCssColor = (value: unknown): boolean => {
    if (!isSafeCssValue(value)) return false
    const trimmed = String(value).trim()
    if (/^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(trimmed)) return true
    if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%/\s-]*\)$/i.test(trimmed)) return true
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(trimmed)) return true
    return false
}
/**
 * 正则「灾难性回溯」（ReDoS）启发式检查（返回拒绝原因；null = 通过）
 *
 * 判定口径（保守，只挡经典形态）：一个**无上限量词**作用于分组时，若分组满足任一条件即拒绝 ——
 * ① 分组内部（任意深度）含无上限量词（`(a+)+`、`(\w+\s?)*`）；
 * ② 分组可匹配空串（`(a?)*`、`(a*)*`）；
 * ③ 分组的分支之间存在前缀包含（`(a|aa)+`）。
 * 这是**启发式**而非证明：它挡的是最常见的一类，长度上限与「只允许覆盖已知 key」才是主护栏；
 * 真正的兜底是**不放大用户输入**（这些正则作用于 B 站页面文本，输入规模有限）。
 */
export const analyzeRegexSource = (source: unknown): string | null => {
    if (typeof source !== 'string') return '不是字符串'
    const pattern = source
    if (!pattern.trim()) return '空内容'
    if (pattern.length > MAX_REGEX_LENGTH) return `长度超限（>${MAX_REGEX_LENGTH}）`
    /** 分组帧：分组内部是否含无上限量词 / 是否可匹配空串 / 各分支原文与当前分支起点 */
    interface Frame { unbounded: boolean; canBeEmpty: boolean; branches: string[]; branchStart: number }
    const frames: Frame[] = []
    const top = (): Frame | undefined => frames[frames.length - 1]
    /** 分支间存在「一个是另一个的前缀」→ 无上限重复时回溯会爆炸（如 `(a|aa)+`） */
    const prefixOverlap = (branches: string[]): boolean => {
        const distinct = Array.from(new Set(branches.map(branch => branch.trim()).filter(Boolean)))
        return distinct.some(a => distinct.some(b => a !== b && b.startsWith(a)))
    }
    /** 读取 at 处的量词；无（或不是量词）时 end === at */
    const readQuantifier = (at: number): { unbounded: boolean; canBeEmpty: boolean; end: number } => {
        const char = pattern[at]
        if (char === '*') return { unbounded: true, canBeEmpty: true, end: at + 1 }
        if (char === '+') return { unbounded: true, canBeEmpty: false, end: at + 1 }
        if (char === '?') return { unbounded: false, canBeEmpty: true, end: at + 1 }
        if (char === '{') {
            const match = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(at))
            if (match) {
                const min = Number(match[1])
                const max = match[2] === undefined ? min : (match[2] === '' ? Infinity : Number(match[2]))
                return { unbounded: max === Infinity, canBeEmpty: min === 0, end: at + match[0].length }
            }
        }
        return { unbounded: false, canBeEmpty: false, end: at }
    }
    /** 把「一个原子（+其量词）」的信息并入当前分组 */
    const applyAtom = (quantifier: { unbounded: boolean; canBeEmpty: boolean }, atomCanBeEmpty: boolean): void => {
        const frame = top()
        if (!frame) return
        if (quantifier.unbounded) frame.unbounded = true
        // 无上限量词作用于「本身可空」的原子（如反向引用 `\1*`）→ 分组也可匹配空串
        if (quantifier.canBeEmpty || (quantifier.unbounded && atomCanBeEmpty)) frame.canBeEmpty = true
    }
    let i = 0
    let inClass = false
    /** 刚结束的原子是否可匹配空串（供量词判断；仅为反向引用/零宽断言时为 true） */
    let lastAtomCanBeEmpty = false
    while (i < pattern.length) {
        const char = pattern[i]
        if (char === '\\') {
            lastAtomCanBeEmpty = /[1-9]/.test(pattern[i + 1] || '')
            i += 2
            continue
        }
        if (inClass) {
            if (char === ']') inClass = false
            i++
            continue
        }
        if (char === '[') {
            inClass = true
            lastAtomCanBeEmpty = false
            i++
            continue
        }
        if (char === '|') {
            const frame = top()
            if (frame) {
                frame.branches.push(pattern.slice(frame.branchStart, i))
                frame.branchStart = i + 1
            }
            lastAtomCanBeEmpty = true
            i++
            continue
        }
        if (char === '(') {
            let start = i + 1
            let zeroWidth = false
            if (pattern[i + 1] === '?') {
                const kind = pattern[i + 2]
                if (kind === ':' || kind === '=' || kind === '!') {
                    zeroWidth = kind !== ':'
                    start = i + 3
                } else if (kind === '<') {
                    const behind = pattern[i + 3] === '=' || pattern[i + 3] === '!'
                    zeroWidth = behind
                    start = behind ? i + 4 : pattern.indexOf('>', i + 3) + 1
                } else {
                    start = i + 2
                }
            }
            frames.push({ unbounded: false, canBeEmpty: zeroWidth, branches: [], branchStart: start })
            i = start
            continue
        }
        if (char === ')') {
            const frame = frames.pop()
            const quantifier = readQuantifier(i + 1)
            const hasQuantifier = quantifier.end > i + 1
            if (frame && hasQuantifier && quantifier.unbounded) {
                const branches = frame.branches.concat([pattern.slice(frame.branchStart, i)])
                if (frame.unbounded) return '分组内部含无上限量词（嵌套量词，易灾难性回溯）'
                if (frame.canBeEmpty) return '分组可匹配空串却又被无上限量词重复（易灾难性回溯）'
                if (prefixOverlap(branches)) return '分组的分支存在前缀包含却又被无上限量词重复（易灾难性回溯）'
            }
            const canBeEmpty = Boolean(frame?.canBeEmpty) || Boolean(hasQuantifier && quantifier.canBeEmpty)
            if (hasQuantifier) applyAtom(quantifier, Boolean(frame?.canBeEmpty))
            else if (frame?.unbounded) {
                const parent = top()
                if (parent) parent.unbounded = true
            }
            if (!hasQuantifier && frame?.canBeEmpty) {
                const parent = top()
                if (parent) parent.canBeEmpty = true
            }
            lastAtomCanBeEmpty = canBeEmpty
            i = hasQuantifier ? quantifier.end : i + 1
            continue
        }
        const quantifier = readQuantifier(i)
        if (quantifier.end > i) {
            applyAtom(quantifier, lastAtomCanBeEmpty)
            lastAtomCanBeEmpty = lastAtomCanBeEmpty && quantifier.unbounded
            i = quantifier.end
            continue
        }
        lastAtomCanBeEmpty = false
        i++
    }
    return null
}
