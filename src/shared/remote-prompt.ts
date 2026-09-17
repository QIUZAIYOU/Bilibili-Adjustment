/**
 * 远程提示词的载荷解析与校验（纯函数，零依赖 → 便于单测）
 *
 * 背景：提示词属于「可随时调整的配置」，不该每改一次就让用户更新脚本。
 * 因此脚本运行时优先拉取服务器上的提示词文件（发布时由 `npm run build` 生成、`scripts/upload.py` 上传），
 * 拉不到/内容异常时回退到**内置提示词**（`src/shared/ad-detection-prompt.ts`，永不删除）。
 *
 * 校验为什么必要：远程内容会直接作为 system 消息驱动模型行为，必须确认它「像一份完整的广告识别提示词」，
 * 否则宁可用内置的 —— 服务器返回半截内容、错误页 HTML、或被中间层改写，都会让识别行为莫名其妙。
 */
/** 远程提示词文件（JSON，扩展名用 .js 仅为命中服务器既有的 CORS 规则） */
export interface RemotePromptPayload {
    /** 提示词正文 */
    prompt: string
    /** 发布时的脚本版本号（仅用于日志对照） */
    version: string
    /** 提示词内容哈希（前 12 位，改词后可变，用于判断「这份提示词是哪一版」） */
    hash: string
    /** 生成时间（ISO 字符串） */
    updatedAt: string
}
/** 提示词正文的最小长度与必备标记：低于此值或缺少标记视为「不是一份完整提示词」 */
export const MIN_PROMPT_LENGTH = 800
export const PROMPT_MARKER = '# 视频广告识别专家提示词'
/**
 * 解析并校验远程提示词载荷
 * @param {unknown} text 服务器返回的原文
 * @returns {RemotePromptPayload | null} 非法/不完整时返回 null（调用方回退内置提示词）
 */
export const parsePromptPayload = (text: unknown): RemotePromptPayload | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return null
    }
    if (!data || typeof data !== 'object') return null
    const raw = data as Record<string, unknown>
    const prompt = typeof raw.prompt === 'string' ? raw.prompt : ''
    if (prompt.length < MIN_PROMPT_LENGTH || !prompt.includes(PROMPT_MARKER)) return null
    return {
        prompt,
        version: typeof raw.version === 'string' ? raw.version : '',
        hash: typeof raw.hash === 'string' ? raw.hash : '',
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    }
}
/** 本地缓存条目（localStorage；仅在远程拉取失败时兜底，不设过期时间——过期与否由「能否拉到远程」决定） */
export interface CachedPromptPayload extends RemotePromptPayload {
    /** 拉取成功的时间戳（ms） */
    fetchedAt: number
}
/**
 * 解析本地缓存的提示词（同样做完整性校验，防止把半截内容当缓存用）
 * @param {unknown} text localStorage 原文
 * @returns {CachedPromptPayload | null}
 */
export const parseCachedPrompt = (text: unknown): CachedPromptPayload | null => {
    const payload = parsePromptPayload(text)
    if (!payload) return null
    try {
        const fetchedAt = (JSON.parse(String(text)) as { fetchedAt?: unknown }).fetchedAt
        return { ...payload, fetchedAt: typeof fetchedAt === 'number' ? fetchedAt : 0 }
    } catch {
        return null
    }
}
/** 提示词来源（日志/排查用） */
export type PromptSource = 'remote' | 'cache' | 'embedded'
/** 组装一行来源说明，便于在控制台确认「这次识别用的是哪一版提示词」 */
export const describePromptSource = (source: PromptSource, payload: { version?: string, hash?: string, updatedAt?: string } | null, chars: number): string =>
    `来源=${source}` +
    (payload?.version ? ` v${payload.version}` : '') +
    (payload?.hash ? ` #${payload.hash}` : '') +
    (payload?.updatedAt ? ` (${payload.updatedAt})` : '') +
    ` ${chars} 字`
