/**
 * UP 主黑名单的纯逻辑（解析/格式化，无 DOM、无网络）
 *
 * 屏蔽以 UID 为主键；首页卡片 DOM 不暴露 UID，过滤时按保存下来的昵称匹配，
 * 所以「添加时拿到昵称」是功能能否生效的前提——拿不到信息就明确拒绝添加。
 */
import { regexps } from '@/shared/regexps'
/** 黑名单条目（存 IndexedDB 的 index 库，键 blocked-up:<uid>） */
export interface BlockedUp {
    uid: string
    name: string
    face: string
    fans: number
    sign: string
    ts: number
}
/**
 * 解析用户输入：纯 UID 或 UP 主空间链接都接受，其它一律返回空串。
 * 空间链接常见形态：https://space.bilibili.com/12345、//space.bilibili.com/12345?x=1
 */
export const parseUidInput = (raw: unknown): string => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    if (regexps.common.uid.test(text)) return text
    const fromUrl = text.match(regexps.common.spaceUid)
    return fromUrl ? fromUrl[1] : ''
}
/** 粉丝数展示：与 B 站口径一致，过万保留一位小数 */
export const formatFansCount = (value: unknown): string => {
    const fans = Number(value)
    if (!Number.isFinite(fans) || fans <= 0) return '0'
    if (fans >= 100000000) return (fans / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
    if (fans >= 10000) return (fans / 10000).toFixed(1).replace(/\.0$/, '') + '万'
    return String(Math.round(fans))
}
/** 存储值 → 条目；脏数据返回 null，不让坏行进列表 */
export const normalizeBlockedUp = (value: unknown): BlockedUp | null => {
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const uid = String(record.uid ?? '')
    if (!regexps.common.uid.test(uid)) return null
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) return null
    const face = typeof record.face === 'string' && record.face.startsWith('https://') ? record.face : ''
    return {
        uid,
        name,
        face,
        fans: Number(record.fans) || 0,
        sign: typeof record.sign === 'string' ? record.sign : '',
        ts: Number(record.ts) || 0
    }
}
