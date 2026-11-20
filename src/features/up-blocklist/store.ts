/**
 * 黑名单存储与 UP 基本信息查询
 *
 * **必须存脚本管理器存储（跨 B 站子域共享）**：空间页在 space.bilibili.com，
 * 首页/搜索在 www/search，IndexedDB 按源隔离 —— 存 IndexedDB 会导致「首页加的名单，空间页不认识」。
 * 键前缀 `adj.blocklist.up.<uid>`，与用户配置共用脚本存储；读取时兼容旧版 IndexedDB 键并自动迁移。
 */
import { httpGet } from '@/utils/http'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { normalizeBlockedUp } from './pure'
import type { BlockedUp } from './pure'
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
