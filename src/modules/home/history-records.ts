/**
 * 首页推荐历史的记录整理（纯函数，零依赖 → 便于单测）
 */
/** 同一视频的规范身份（去重用）：同一视频在任何链接形态/批次下必须得到同一个值 */
export const historyIdentity = (record: Record<string, unknown>): string => {
    const rawKey = record._key === undefined || record._key === null ? '' : String(record._key)
    // 存储 key 形如 `${bvid || aid || url}::${sessionTimestamp}`：前缀就是 API 返回的 bvid/aid，
    // 比解析 URL 更可靠（同一视频在不同批次可能一个走 bvid 链接、一个走 av 链接）
    const keyId = rawKey.split('::')[0]
    if (/^BV[0-9A-Za-z]+$/.test(keyId)) return `video:${keyId.toLowerCase()}`
    if (/^\d+$/.test(keyId)) return `aid:${keyId}`
    const url = typeof record.url === 'string' ? record.url : ''
    const bvid = url.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1] || url.match(/[?&]bvid=(BV[0-9A-Za-z]+)/i)?.[1]
    if (bvid) return `video:${bvid.toLowerCase()}`
    const aid = url.match(/\/video\/av(\d+)/i)?.[1]
    if (aid) return `aid:${aid}`
    // 番剧：ep（单集）/ss（季）分别归一，忽略 ?ep= 之类的定位参数
    const episode = url.match(/\/bangumi\/play\/((?:ep|ss)\d+)/i)?.[1]
    if (episode) return `bangumi:${episode.toLowerCase()}`
    // 无视频 id：去掉查询串/哈希/尾斜杠后比较（tracking 参数不同不算不同页面）
    const stripped = url.split(/[?#]/)[0].replace(/\/+$/, '')
    if (stripped) return `url:${stripped}`
    return `key:${keyId}`
}
/**
 * 归一化 + 排序：批次时间倒序（最新批次在最前）→ 批次内按页面顺序升序
 * @param {Array<{key: string, value: object}>} rawList storageService.getAllRaw('index') 的结果
 * @returns {Array<object>} 每项带 _key/_order/_sessionTimestamp
 */
const normalizeHistoryRecords = (rawList: unknown): Array<Record<string, unknown>> => {
    const list = Array.isArray(rawList) ? rawList : []
    return list
        .map((raw): Record<string, unknown> => {
            const item = raw as { key?: string; value?: Record<string, unknown> }
            const value = item.value ?? {}
            return {
                ...value,
                _key: item.key,
                _order: (value.order as number | undefined) ?? 0,
                _sessionTimestamp: (value.sessionTimestamp as number | undefined) ?? 0
            }
        })
        .sort((a, b) => ((b._sessionTimestamp as number) - (a._sessionTimestamp as number)) || ((a._order as number) - (b._order as number)))
}
/**
 * 排序并去重首页推荐历史记录：
 * 同一视频在多次「换一换」后会落到多个批次（存储 key 带 sessionTimestamp），只保留最新一条，
 * 否则列表会重复展示同一视频。
 *
 * 去重按**视频身份**（historyIdentity）而不是 url 字符串：同一视频在不同批次拿到的链接可能
 * 带不同 tracking 参数（`?spm_id_from=` / `?vd_source=`）、带不带尾斜杠、`?p=` 分 P 不同，
 * 甚至一次是 bvid 链接、一次是 av 链接 —— 按 url 比会全部漏掉，于是列表里出现同名重复项。
 * @param {Array<{key: string, value: object}>} rawList storageService.getAllRaw('index') 的结果
 * @returns {Array<object>} 去重并排序后的记录（每项带 _key/_order/_sessionTimestamp）
 */
export const sortAndDedupeHistoryRecords = (rawList: unknown): Array<Record<string, unknown>> => {
    const seenVideos = new Set<string>()
    return normalizeHistoryRecords(rawList).filter(item => {
        const identity = historyIdentity(item)
        if (seenVideos.has(identity)) return false
        seenVideos.add(identity)
        return true
    })
}
/** 待清理的重复记录（同一视频只保留最新一条，其余为待删项） */
export interface DuplicateHistoryRecord {
    /** IndexedDB 主键（删除用） */
    key: string
    /** 视频身份（historyIdentity 的结果） */
    identity: string
    title: string
    url: string
    /** 保留项的键与批次时间（用于日志里说明「为什么这两条算同一个视频」） */
    keptKey: string
    keptSessionTimestamp: number
}
/**
 * 找出库中「同一视频的旧记录」，交给调用方删除（纯函数，不碰 IndexedDB）
 * 保留规则与 sortAndDedupeHistoryRecords 完全一致：批次时间最新、同批次内页面顺序靠前的那条。
 * @param {Array<{key: string, value: object}>} rawList storageService.getAllRaw('index') 的结果
 * @returns {Array<DuplicateHistoryRecord>} 待删除记录（无 key 的记录无法删除，会被忽略）
 */
export const findDuplicateHistoryRecords = (rawList: unknown): DuplicateHistoryRecord[] => {
    const kept = new Map<string, Record<string, unknown>>()
    const duplicates: DuplicateHistoryRecord[] = []
    for (const item of normalizeHistoryRecords(rawList)) {
        const identity = historyIdentity(item)
        const first = kept.get(identity)
        if (!first) {
            kept.set(identity, item)
            continue
        }
        const key = item._key === undefined || item._key === null ? '' : String(item._key)
        if (!key) continue
        duplicates.push({
            key,
            identity,
            title: typeof item.title === 'string' ? item.title : '',
            url: typeof item.url === 'string' ? item.url : '',
            keptKey: first._key === undefined || first._key === null ? '' : String(first._key),
            keptSessionTimestamp: (first._sessionTimestamp as number | undefined) ?? 0
        })
    }
    return duplicates
}
