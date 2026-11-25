/**
 * 黑名单存储与 UP 基本信息查询
 *
 * **必须存脚本管理器存储（跨 B 站子域共享）**：空间页在 space.bilibili.com，
 * 首页/搜索在 www/search，IndexedDB 按源隔离 —— 存 IndexedDB 会导致「首页加的名单，空间页不认识」。
 * 键前缀 `adj.blocklist.up.<uid>`，与用户配置共用脚本存储；读取时兼容旧版 IndexedDB 键并自动迁移。
 */
import { httpGet, httpPost } from '@/utils/http'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { normalizeBlockedUp, isSelfUid, buildRelationModifyBody, parseRelationModifyResult } from './pure'
import type { BlockedUp, RelationModifyResult } from './pure'
import { regexps } from '@/shared/regexps'
const logger = new LoggerService('UpBlocklist', { notify: false })
const KEY_PREFIX = 'adj.blocklist.up.'
const LEGACY_PREFIX = 'blocked-up:'
const CARD_API = 'https://api.bilibili.com/x/web-interface/card?mid='
const blockedKey = (uid: string): string => KEY_PREFIX + uid
/** 把旧版存在 IndexedDB 的名单迁到脚本存储（一次性；迁完不删，作为回滚源） */
const migrateLegacyEntries = async (existing: BlockedUp[]): Promise<BlockedUp[]> => {
    try {
        const raw = await storageService.getAllRaw('index')
        const legacy = raw
            .filter(item => String(item.key).startsWith(LEGACY_PREFIX))
            .map(item => normalizeBlockedUp(item.value))
            .filter((item): item is BlockedUp => Boolean(item))
        if (!legacy.length) return existing
        const known = new Set(existing.map(up => up.uid))
        const adds = legacy.filter(up => !known.has(up.uid))
        if (adds.length) {
            await storageService.userBatchSet(adds.map(up => ({ key: blockedKey(up.uid), value: up })))
            logger.info('UP 主黑名单丨已迁移旧名单', `${adds.length} 位`)
        }
        return existing.concat(adds)
    } catch {
        return existing
    }
}
/** 读取全部黑名单条目（按添加时间倒序） */
export const listBlockedUps = async (): Promise<BlockedUp[]> => {
    const all = await storageService.getAll('user') as Record<string, unknown>
    const entries = Object.entries(all)
        .filter(([key]) => key.startsWith(KEY_PREFIX))
        .map(([, value]) => normalizeBlockedUp(value))
        .filter((item): item is BlockedUp => Boolean(item))
        .sort((a, b) => b.ts - a.ts)
    const merged = await migrateLegacyEntries(entries)
    return merged.sort((a, b) => b.ts - a.ts)
}
export const saveBlockedUp = async (up: BlockedUp): Promise<void> => {
    await storageService.userSet(blockedKey(up.uid), up)
}
export const removeBlockedUp = async (uid: string): Promise<void> => {
    await storageService.userRemove(blockedKey(uid))
    await storageService.batchRemove('index', [LEGACY_PREFIX + uid])
}
/**
 * 用 B 站名片接口补「基本信息」：昵称/头像/粉丝/签名。
 * 失败返回 null（调用方拒绝添加）——拿不到昵称就无法在卡片上匹配，存进去也不会生效。
 */
export const fetchUpCard = async (uid: string): Promise<BlockedUp | null> => {
    try {
        const response = await httpGet(`${CARD_API}${encodeURIComponent(uid)}`, { credentials: 'include', timeout: 8000 })
        const payload = response.data as { code?: number, data?: { card?: Record<string, unknown> }}
        if (!payload || payload.code !== 0) return null
        const card = payload.data?.card
        if (!card) return null
        return normalizeBlockedUp({
            uid: String(card.mid ?? uid),
            name: card.name,
            face: card.face,
            fans: card.fans,
            sign: card.sign,
            ts: Date.now()
        })
    } catch {
        return null
    }
}
const NAV_API = 'https://api.bilibili.com/x/web-interface/nav'
const RELATION_API = 'https://api.bilibili.com/x/relation/modify'
let selfUidPromise: Promise<string | null> | null = null
/**
 * 当前登录账号 UID（用于禁止拉黑自己）
 *
 * 每页只请求一次并缓存结果（失败也缓存 null）；未登录、超时、接口异常一律返回 null，
 * 调用方按“无法判定”处理，不影响正常添加别人。
 */
export const fetchCurrentUid = (): Promise<string | null> => {
    if (!selfUidPromise) {
        selfUidPromise = (async (): Promise<string | null> => {
            try {
                const response = await httpGet(NAV_API, { credentials: 'include', timeout: 5000 })
                const payload = response.data as { code?: number, data?: { mid?: unknown }} | null
                if (!payload || payload.code !== 0) return null
                const mid = String(payload.data?.mid ?? '')
                return regexps.common.uid.test(mid) ? mid : null
            } catch {
                return null
            }
        })()
    }
    return selfUidPromise
}
/** 只读 Cookie（官方写接口需要 bili_jct） */
const readCookie = (name: string): string => {
    try {
        const prefix = `${name}=`
        const item = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))
        return item ? decodeURIComponent(item.slice(prefix.length)) : ''
    } catch {
        return ''
    }
}
/** 调 B 站官方拉黑接口（act=5）；失败只返回原因，不影响脚本名单 */
export const blockOfficialUser = async (uid: string): Promise<RelationModifyResult> => {
    const csrf = readCookie('bili_jct')
    if (!csrf) return { ok: false, alreadyBlocked: false, message: '未登录，未同步官方拉黑' }
    try {
        const response = await httpPost(RELATION_API, buildRelationModifyBody(uid, csrf), {
            credentials: 'include',
            timeout: 8000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        const payload = response.data as { code?: unknown, message?: unknown } | null
        return parseRelationModifyResult(payload?.code, payload?.message)
    } catch (error) {
        logger.warn('黑名单丨官方拉黑请求失败', error instanceof Error ? error.message : error)
        return { ok: false, alreadyBlocked: false, message: '官方拉黑请求失败，请稍后重试' }
    }
}
export interface AddBlockedUpResult {
    ok: boolean
    message: string
    up?: BlockedUp
}
/**
 * 把 UID 加入脚本黑名单（自己/重复/名片失败都会拒绝）
 *
 * 设置页弹窗与空间弹窗共用；`syncOfficial` 为真时同时调官方拉黑，官方失败不回滚脚本名单。
 */
export const addBlockedUpByUid = async (uid: string, options: { syncOfficial?: boolean } = {}): Promise<AddBlockedUpResult> => {
    const currentUid = await fetchCurrentUid()
    if (isSelfUid(currentUid, uid)) return { ok: false, message: '这是当前登录的账号，不能加入黑名单' }
    const existing = await listBlockedUps()
    if (existing.some(up => up.uid === uid)) return { ok: false, message: '这位 UP 已经在名单里了' }
    const info = await fetchUpCard(uid)
    if (!info) return { ok: false, message: '没查到这位 UP，检查 UID 是否正确' }
    await saveBlockedUp(info)
    eventBus.emit(EVENT_NAMES.UP_BLOCKLIST_CHANGED, { uid })
    if (!options.syncOfficial) return { ok: true, message: `已添加：${info.name}`, up: info }
    const official = await blockOfficialUser(uid)
    return {
        ok: true,
        message: `已添加：${info.name}（${official.message}）`,
        up: info
    }
}
