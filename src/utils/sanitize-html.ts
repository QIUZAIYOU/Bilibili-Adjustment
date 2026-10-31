/**
 * HTML 片段白名单消毒（叶子模块：不依赖任何其它模块，可被任意位置引用）
 *
 * 背景（2026-10-23 审查发现）：
 * 设置项的提示文本（`src/config/settings-config.ts` 的 `tips`）会把**配置值**插进去
 * （例如「播放器的自然位置是距文档顶部 ${configs.player_offset_top}px」），
 * 而配置值可以来自用户导入的配置文件。
 * 提示最终走 `src/components/tooltip-component.ts` 的 `tooltip.innerHTML = content`，
 * 于是导入一份 `{"player_offset_top": "<img src=x onerror=…>"}` 就会在 `bilibili.com` 源下执行脚本。
 *
 * 这里把「不可信 HTML 片段」收敛成安全 HTML：
 * - 文本一律转义（`<` `>` `&` `"` `'`）；
 * - 只放行两个标签：`<br>`（换行）与 `<a href="http(s)://…">`（外链）；
 * - 其它标签（`<img>` `<script>` `<svg>` `<iframe>` …）连标签带属性**整段丢弃**，
 *   只保留标签之外的文本（不会把攻击载荷当成标签解析）。
 *
 * 放行 `<a>` 时会强制补 `target="_blank" rel="noopener noreferrer"`，
 * 并用 `new URL()` 校验协议（`javascript:` / `data:` 一律拒绝）。
 */
import { escapeHtml } from '@/utils/text'
/** 允许出现在提示里的标签 */
const ALLOWED_INLINE_TAGS = new Set(['br', 'a'])
/** 从标签属性串里取指定属性（只认双引号/单引号/无引号三种写法） */
const extractAttribute = (attrText: string, name: string): string => {
    // ⚠️ 不能用  前缀： 在 data-href 的 - 与 h 之间也成立，
    // 于是 data-href="http://evil" 会被当成 href 取走（审查 W11）。
    // 属性名前必须是空白或标签名结束，故用 (?:^|[\s/])。
    // 注意：这是模板字符串再交给 RegExp，反斜杠要写两个 —— 单个 `\s` 在模板字符串里会退化成
    // 普通字母 s（2026-10-31 写这段时踩过，会让 `href =` 之外的 `hsref` 之类误判）
    const re = new RegExp(`(?:^|[\\s/])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
    const matched = attrText.match(re)
    if (!matched) return ''
    return matched[1] ?? matched[2] ?? matched[3] ?? ''
}
/** 只接受绝对的 http(s) 链接（相对链接与 javascript:/data: 一律拒绝） */
const isSafeExternalUrl = (raw: string): string => {
    const value = String(raw ?? '').trim()
    if (!value) return ''
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
    } catch {
        return ''
    }
}
/**
 * 把可能是「不可信内容 + 少量允许标签」的 HTML 片段收敛成安全 HTML
 * @param {string} raw 原始片段
 * @returns {string} 可安全赋给 innerHTML 的 HTML 字符串
 */
export const sanitizeTooltipHtml = (raw: unknown): string => {
    const source = String(raw ?? '')
    let result = ''
    let index = 0
    // 只匹配「像标签」的片段：<tag ...> / </tag>；裸的 "<" 走文本分支并被转义
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g
    let matched: RegExpExecArray | null
    while ((matched = tagRe.exec(source)) !== null) {
        result += escapeHtml(source.slice(index, matched.index))
        index = matched.index + matched[0].length
        const isClosing = matched[1] === '/'
        const tagName = matched[2].toLowerCase()
        if (!ALLOWED_INLINE_TAGS.has(tagName)) continue
        if (isClosing) {
            if (tagName === 'a') result += '</a>'
            continue
        }
        if (tagName === 'br') {
            result += '<br>'
            continue
        }
        const href = isSafeExternalUrl(extractAttribute(matched[3] ?? '', 'href'))
        if (!href) continue
        result += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
    }
    result += escapeHtml(source.slice(index))
    return result
}
