/**
 * 首页视频预览的纯逻辑（零副作用 → 便于单测）
 *
 * URL 结构判据一律取 `regexps` 注册表（可热更），别在这里写死 `/video/(BV…)` 之类的正则。
 */
import { regexps } from '@/shared/regexps'
/** 播放地址模板里的占位符 */
export const PREVIEW_BVID_PLACEHOLDER = '[[BVID]]'
/** 默认音量（用户没调过时用） */
export const DEFAULT_PREVIEW_VOLUME = 0.8
/** 记住上次音量的存储键 */
export const VOLUME_CONFIG_KEY = 'home_preview_volume'
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
/**
 * 音量归一：夹到 [0, 1]，非法值回落到默认音量
 * @param value 待归一的值（来自配置/输入框，可能是字符串）
 * @param fallback 默认音量
 */
export const normalizePreviewVolume = (value: unknown, fallback = DEFAULT_PREVIEW_VOLUME): number => {
    if (value === null || value === undefined) return fallback
    // 空串/纯空白会被 Number 当成 0，必须当作"没有设置"回落到默认值
    const text = typeof value === 'number' ? '' : String(value).trim()
    if (typeof value !== 'number' && text === '') return fallback
    const parsed = typeof value === 'number' ? value : Number(text)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(1, Math.max(0, parsed))
}
