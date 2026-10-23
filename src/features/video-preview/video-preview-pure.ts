/**
 * 视频卡片预览的纯逻辑（零副作用 → 便于单测）
 *
 * URL 结构判据一律取 `regexps` 注册表（可热更），别在这里写死 `/video/(BV…)` 之类的正则。
 */
import { regexps } from '@/shared/regexps'
/** 播放地址模板里的占位符 */
export const PREVIEW_BVID_PLACEHOLDER = '[[BVID]]'
/** 预览按钮自身的类名（事件委托、样式、清理都按它定位） */
export const PREVIEW_BUTTON_CLASS = 'adj-video-preview-btn'
/**
 * 封面容器上打的类名，两个用途：
 * ① 作为预览按钮绝对定位的参照系；
 * ② 作为「悬浮封面才显示按钮」的显现规则（跨页通用，不绑定任何页型的类名）。
 */
export const PREVIEW_COVER_CLASS = 'adj-video-preview-cover'
/**
 * 从卡片链接里取 bvid（取不到返回 null → 该卡片不注入预览按钮）
 * @param href 卡片 `<a>` 的 href（可以是相对/绝对地址）
 */
export const extractPreviewBvid = (href: unknown): string | null => {
    if (typeof href !== 'string' || !href) return null
    const matched = href.match(regexps.common.bvidInUrl)
    if (matched?.[1]) return matched[1]
    const queryMatched = href.match(regexps.common.bvidInQuery)
    return queryMatched?.[1] || null
}
/**
 * 用模板拼播放地址（模板里的 `[[BVID]]` 会被替换）
 * @param template 播放地址模板（来自 templates 注册表，可热更）
 * @param bvid 视频 id
 */
export const buildPreviewUrl = (template: string, bvid: string): string => {
    if (typeof template !== 'string' || !template) return ''
    return template.split(PREVIEW_BVID_PLACEHOLDER).join(encodeURIComponent(bvid))
}
/** 视频标题兜底文案（卡片标题取不到时用） */
export const FALLBACK_PREVIEW_TITLE = '视频预览'
/**
 * 卡片标题清洗：去掉多余空白与时长等尾部噪音（B 站标题节点里可能带空格换行）
 * @param raw 标题节点的 textContent
 */
export const normalizePreviewTitle = (raw: unknown): string => {
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    return text || FALLBACK_PREVIEW_TITLE
}
