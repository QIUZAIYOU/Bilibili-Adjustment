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
 * UID 上限 20 位：B 站新账号已出现 16 位 mid，按 12 位截断会漏掉整批新 UP。
 * 空间链接常见形态：https://space.bilibili.com/12345、//space.bilibili.com/12345?x=1
 */
export const parseUidInput = (raw: unknown): string => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    if (regexps.common.uid.test(text)) return text
    const fromUrl = text.match(regexps.common.spaceUid)
    return fromUrl ? fromUrl[1] : ''
}
/** 当前登录账号不能被拉黑：两侧都有 UID 且相等才算命中 */
export const isSelfUid = (currentUid: string | null | undefined, targetUid: string): boolean =>
    Boolean(currentUid) && String(currentUid) === String(targetUid)
/** B 站官方拉黑接口的请求体（application/x-www-form-urlencoded，act=5 拉黑，re_src=11 空间来源） */
export const buildRelationModifyBody = (uid: string, csrf: string): string =>
    new URLSearchParams({ fid: String(uid), act: '5', re_src: '11', csrf: String(csrf) }).toString()
export interface RelationModifyResult {
    ok: boolean
    alreadyBlocked: boolean
    message: string
}
/** 归一化官方拉黑接口返回值：22003 视为已在黑名单（成功），其它 code 原样给失败原因 */
export const parseRelationModifyResult = (code: unknown, message?: unknown): RelationModifyResult => {
    const numeric = Number(code)
    const serverMessage = typeof message === 'string' && message.trim() ? message.trim() : ''
    if (numeric === 0) return { ok: true, alreadyBlocked: false, message: '已同步官方拉黑' }
    if (numeric === 22003) return { ok: true, alreadyBlocked: true, message: '官方黑名单已包含该用户' }
    if (numeric === -101) return { ok: false, alreadyBlocked: false, message: '未登录，未同步官方拉黑' }
    if (numeric === -111) return { ok: false, alreadyBlocked: false, message: 'csrf 校验失败，请刷新页面重试' }
    if (numeric === 22001) return { ok: false, alreadyBlocked: false, message: '不能把当前账号拉黑' }
    return { ok: false, alreadyBlocked: false, message: serverMessage || `官方拉黑失败（code ${String(code ?? 'unknown')}）` }
}
/** 粉丝数展示：与 B 站口径一致，过万保留一位小数 */export const formatFansCount = (value: unknown): string => {
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
