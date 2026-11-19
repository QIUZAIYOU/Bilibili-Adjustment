/**
 * 黑名单存储与 UP 基本信息查询
 *
 * 存 IndexedDB 的 index 库（键 blocked-up:<uid>），与「首页推荐历史」同库不同前缀：
 * 配置导入导出不涉及这里，名单是设备级数据。
 */
import { httpGet } from '@/utils/http'
import { storageService } from '@/services/storage.service'
import { normalizeBlockedUp } from './pure'
import type { BlockedUp } from './pure'
const KEY_PREFIX = 'blocked-up:'
const CARD_API = 'https://api.bilibili.com/x/web-interface/card?mid='
const blockedKey = (uid: string): string => KEY_PREFIX + uid
/** 读取全部黑名单条目（按添加时间倒序） */
export const listBlockedUps = async (): Promise<BlockedUp[]> => {
    const raw = await storageService.getAllRaw('index')
    return raw
        .filter(item => String(item.key).startsWith(KEY_PREFIX))
        .map(item => normalizeBlockedUp(item.value))
        .filter((item): item is BlockedUp => Boolean(item))
        .sort((a, b) => b.ts - a.ts)
}
export const saveBlockedUp = async (up: BlockedUp): Promise<void> => {
    await storageService.set('index', blockedKey(up.uid), up)
}
export const removeBlockedUp = async (uid: string): Promise<void> => {
    await storageService.batchRemove('index', [blockedKey(uid)])
}
/**
 * 用 B 站名片接口补「基本信息」：昵称/头像/粉丝/签名。
 * 失败返回 null（调用方拒绝添加）——拿不到昵称就无法在首页卡片上匹配，存进去也不会生效。
 */
export const fetchUpCard = async (uid: string): Promise<BlockedUp | null> => {
    try {
        const response = await httpGet(`${CARD_API}${encodeURIComponent(uid)}`, { credentials: 'include', timeout: 8000 })
        const payload = response.data as { code?: number, data?: { card?: Record<string, unknown> }}
        if (!payload || payload.code !== 0) return null
        const card = payload.data?.card
        if (!card) return null
        const info = normalizeBlockedUp({
            uid: String(card.mid ?? uid),
            name: card.name,
            face: card.face,
            fans: card.fans,
            sign: card.sign,
            ts: Date.now()
        })
        return info
    } catch {
        return null
    }
}
