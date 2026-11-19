/**
 * 首页推荐流数据访问层
 *
 * 只暴露两件事：拉一页推荐、补一条视频的分区。失败一律抛 HomeFeedFetchError，
 * 由上层状态机决定「继续 / 停止 / 回退原生流」，这里不做重试，避免把风控放大。
 */
import { httpGet } from '@/utils/http'
import { LoggerService } from '@/services/logger.service'
import { getRegionName } from '@/shared/archive-regions'
import { normalizeFeedItems } from './pure'
import type { HomeFeedItem } from './pure'
const logger = new LoggerService('HomeFeed', { notify: false })
const FEED_URL = 'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd'
const VIEW_URL = 'https://api.bilibili.com/x/web-interface/view'
const CATEGORY_CACHE_KEY = 'adj.home.feed.cat.v1'
const CATEGORY_CACHE_LIMIT = 3000
const CATEGORY_CONCURRENCY = 6
/** 接口或网络失败；code 为 B 站业务码（0 表示非业务错误） */
export class HomeFeedFetchError extends Error {
    readonly code: number
    constructor (message: string, code = 0) {
        super(message)
        this.name = 'HomeFeedFetchError'
        this.code = code
    }
}
interface FeedEnvelope {
    code?: number
    message?: string
    data?: { item?: unknown }
}
interface ViewEnvelope {
    code?: number
    data?: { tid?: number, tname?: string }
}
/** 拉首页推荐第 freshIdx 页（每页 30 条），解析失败抛错 */
export const fetchFeedPage = async (freshIdx: number): Promise<HomeFeedItem[]> => {
    const index = Math.max(1, Math.floor(freshIdx))
    const url = `${FEED_URL}?ps=30&fresh_type=4&feed_version=V8&fresh_idx=${index}&fresh_idx_1h=${index}&brush=0&homepage_ver=1`
    const response = await httpGet(url, { credentials: 'include', timeout: 8000 })
    const payload = response.data as FeedEnvelope
    if (!payload || payload.code !== 0) {
        throw new HomeFeedFetchError(payload?.message || '推荐接口返回异常', Number(payload?.code ?? 0))
    }
    return normalizeFeedItems(payload.data?.item)
}
/** 单条视频的分区 id（推荐接口不返回 tid，只能按 bvid 补查） */
const fetchVideoTid = async (bvid: string): Promise<number> => {
    const response = await httpGet(`${VIEW_URL}?bvid=${encodeURIComponent(bvid)}`, { credentials: 'include', timeout: 6000 })
    const payload = response.data as ViewEnvelope
    if (!payload || payload.code !== 0) return 0
    return Number(payload.data?.tid ?? 0) || 0
}
/** 读分类缓存：bvid → tid（localStorage；坏数据直接当没有） */
const readCategoryCache = (): Map<string, number> => {
    try {
        const raw = localStorage.getItem(CATEGORY_CACHE_KEY)
        if (!raw) return new Map()
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const cache = new Map<string, number>()
        for (const [bvid, tid] of Object.entries(parsed)) {
            const value = Number(tid)
            if (value > 0) cache.set(bvid, value)
        }
        return cache
    } catch {
        return new Map()
    }
}
/** 写分类缓存：超过上限按插入顺序丢最早的，避免 localStorage 无限膨胀 */
const writeCategoryCache = (cache: Map<string, number>): void => {
    try {
        const entries = [...cache.entries()].slice(-CATEGORY_CACHE_LIMIT)
        localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
    } catch { /* 配额满时仅本次会话生效 */ }
}
/**
 * 批量补分区：先查本地缓存，缺失的按 6 并发补查后回填缓存。
 * 补查失败不影响主流程（分区退化为「其他」），但不吞风控错误，交由调用方判断。
 */
export const resolveCategories = async (items: HomeFeedItem[]): Promise<Map<string, string>> => {
    const cache = readCategoryCache()
    const result = new Map<string, string>()
    const missing: string[] = []
    for (const item of items) {
        const tid = cache.get(item.bvid)
        if (tid) result.set(item.bvid, getRegionName(tid) || item.tname || '其他')
        else if (item.tname) result.set(item.bvid, item.tname)
        else missing.push(item.bvid)
    }
    if (!missing.length) return result
    let cursor = 0
    const worker = async (): Promise<void> => {
        while (cursor < missing.length) {
            const bvid = missing[cursor++]
            try {
                const tid = await fetchVideoTid(bvid)
                if (tid > 0) {
                    cache.set(bvid, tid)
                    result.set(bvid, getRegionName(tid) || '其他')
                }
            } catch (error) {
                logger.debug('首页视频区丨补查分区失败', bvid, error)
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CATEGORY_CONCURRENCY, missing.length) }, worker))
    writeCategoryCache(cache)
    return result
}
