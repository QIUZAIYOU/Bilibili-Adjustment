/**
 * 首页视频区重设计的纯逻辑（无 DOM、无网络，便于单测）
 *
 * 数据来自 B 站首页推荐接口，字段随官方版本漂移，所以解析层只信一遍：
 * 校验 `goto=av` 与 bvid 形态，其余缺失一律降级为 0/空串，不让脏数据进入渲染层。
 */
import { regexps } from '@/shared/regexps'
import { getRegionName } from '@/shared/archive-regions'
/** 卡片渲染需要的最小字段集 */
export interface HomeFeedItem {
    bvid: string
    aid: number
    cid: number
    title: string
    pic: string
    duration: number
    pubdate: number
    owner: { mid: string, name: string, face: string }
    stat: { view: number, danmaku: number, like: number }
    tid: number
    tname: string
    rcmdReason: string
    /** 补查后的分区名（推荐接口自身不带，由 resolveCategories 回填） */
    category?: string
}
/** 分区泳道 */
export interface HomeFeedRail {
    name: string
    items: HomeFeedItem[]
}
const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {})
const asNumber = (value: unknown): number => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}
const asText = (value: unknown): string => (typeof value === 'string' ? value : '')
/** pic 常以 http 返回，页面是 https，统一升级避免混合内容被拦 */
export const toHttps = (url: string): string => (url.startsWith('http://') ? 'https://' + url.slice('http://'.length) : url)
/** 解析单条推荐；非视频、缺 bvid/标题的一律丢弃 */
export const normalizeFeedItem = (raw: unknown): HomeFeedItem | null => {
    const item = asRecord(raw)
    if (item.goto !== 'av') return null
    const bvid = asText(item.bvid)
    const title = asText(item.title)
    if (!bvid || !title || !regexps.common.bvIdExact.test(bvid)) return null
    const owner = asRecord(item.owner)
    const stat = asRecord(item.stat)
    return {
        bvid,
        aid: asNumber(item.id ?? item.aid),
        cid: asNumber(item.cid),
        title,
        pic: toHttps(asText(item.pic)),
        duration: asNumber(item.duration),
        pubdate: asNumber(item.pubdate),
        owner: {
            mid: asText(String(owner.mid ?? '')),
            name: asText(owner.name) || '未知 UP',
            face: toHttps(asText(owner.face))
        },
        stat: { view: asNumber(stat.view), danmaku: asNumber(stat.danmaku), like: asNumber(stat.like) },
        tid: asNumber(item.tid),
        tname: asText(item.tname),
        rcmdReason: asText(item.rcmd_reason)
    }
}
export const normalizeFeedItems = (rawItems: unknown): HomeFeedItem[] => {
    if (!Array.isArray(rawItems)) return []
    const items: HomeFeedItem[] = []
    for (const raw of rawItems) {
        const item = normalizeFeedItem(raw)
        if (item) items.push(item)
    }
    return items
}
/** 黑名单输入：逗号/空白/中文逗号分隔的 UID，只留数字，去重，最多 limit 个 */
export const parseBlockedUids = (value: unknown, limit = 500): string[] => {
    const seen = new Set<string>()
    const source = typeof value === 'string' ? value : ''
    for (const piece of source.split(/[\s,，、]+/)) {
        if (!regexps.common.numericId.test(piece)) continue
        if (seen.has(piece)) continue
        seen.add(piece)
        if (seen.size >= limit) break
    }
    return [...seen]
}
export const filterBlockedItems = (items: HomeFeedItem[], blocked: Set<string>): HomeFeedItem[] =>
    items.filter(item => !blocked.has(item.owner.mid))
/** 追加去重：已在 seen 里的 bvid 丢弃，返回可渲染的新条目，并把它们记入 seen */
export const dedupeFeedItems = (seen: Set<string>, items: HomeFeedItem[]): HomeFeedItem[] => {
    const fresh: HomeFeedItem[] = []
    for (const item of items) {
        if (seen.has(item.bvid)) continue
        seen.add(item.bvid)
        fresh.push(item)
    }
    return fresh
}
/** 分区名：接口 tname 优先，其次内置分区表按 tid 反查 */
export const categoryOf = (item: HomeFeedItem): string => item.category || item.tname || getRegionName(item.tid) || '其他'
/** 按分区聚合：条数降序取前 maxRails 条（每道至少 minRail 条），其余归「更多推荐」 */
export const groupByCategory = (items: HomeFeedItem[], maxRails = 8, minRail = 3): { rails: HomeFeedRail[], rest: HomeFeedItem[] } => {
    const buckets = new Map<string, HomeFeedItem[]>()
    for (const item of items) {
        const name = categoryOf(item)
        const bucket = buckets.get(name)
        if (bucket) bucket.push(item)
        else buckets.set(name, [item])
    }
    const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)
    const selected = ordered
        .filter(([, bucket]) => bucket.length >= minRail)
        .slice(0, maxRails)
        .map(([name, bucket]) => ({ name, items: bucket }))
    const used = new Set(selected.map(rail => rail.name))
    // 推荐流分区很散时，可能一个区都凑不满 minRail：退化为「条数最多的 3 个区」，
    // 否则整块会只剩一条「更多推荐」，分区组合就名存实亡。
    if (selected.length === 0) {
        for (const [name, bucket] of ordered) {
            if (selected.length >= 3) break
            selected.push({ name, items: bucket })
            used.add(name)
        }
    }
    const rest = ordered.filter(([name]) => !used.has(name)).flatMap(([, bucket]) => bucket)
    return { rails: selected, rest }
}
/** 页数上限：只接受 2–20 的整数，其它值回默认 */
export const clampMaxPages = (value: unknown, fallback = 8): number => {
    const num = Math.floor(Number(value))
    if (!Number.isFinite(num)) return fallback
    return Math.min(20, Math.max(2, num))
}
/** 风控/频控：命中即停止本次采集，交给上层回退原生流 */
export const isRiskControlCode = (code: unknown): boolean => {
    const value = Number(code)
    return value === -352 || value === -412 || value === -509 || value === 412 || value === 429
}
/** 播放量/点赞数的展示口径：过万保留一位小数 */
export const formatCount = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return '0'
    if (value >= 100000000) return (value / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
    if (value >= 10000) return (value / 10000).toFixed(1).replace(/\.0$/, '') + '万'
    return String(Math.round(value))
}
/** 时长角标：秒 → m:ss / h:mm:ss */
export const formatDuration = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number): string => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
