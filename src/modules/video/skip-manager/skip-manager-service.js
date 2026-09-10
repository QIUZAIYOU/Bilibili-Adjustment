/**
 * 跳过片段管理（主面板）异步服务层：依赖注入的缓存加载/提交编排。
 * 行为与 ad-skip.js showSkipSegmentManager 主面板逻辑等价，
 * env 由调用方（ad-skip 的 feature 上下文）装配，便于单测 mock。
 *
 * env = {
 *   storage: storageService（adCacheGet/adCacheSet）,
 *   fetchImpl: fetch,
 *   uidProvider: () => number|null,
 *   log: logger（info/debug/error）,
 *   apiUrl: SKIP_CACHE_API,
 *   afterCommit: async () => void  // 提交成功后复位识别状态并预识别（可空）
 * }
 */
import { canUpdateCache } from './pure'
/** 读取某视频缓存：本地优先，未命中回退远程（命中写本地）。返回统一装载结果 */
export const loadCache = async (env, bvid) => {
    const { storage, log } = env
    const local = await storage.adCacheGet(bvid).catch(() => null)
    if (local && Array.isArray(local.segments)) {
        log?.info('跳过片段管理丨命中本地缓存')
        return { cached: local, segments: [...local.segments], fromRemote: false }
    }
    let remote = null
    try {
        const resp = await env.fetchImpl(`${env.apiUrl}?bvid=${bvid}`)
        if (resp.ok) {
            const result = await resp.json()
            if (result.ok && result.data && Array.isArray(result.data.segments) && result.data.segments.length > 0) {
                remote = result.data
            }
        }
    } catch (error) {
        log?.debug('跳过片段管理丨远程缓存查询失败', error)
    }
    if (remote) {
        log?.info('跳过片段管理丨命中远程缓存')
        await storage.adCacheSet(bvid, remote).catch(() => {})
        return { cached: remote, segments: [...remote.segments], fromRemote: true }
    }
    return { cached: null, segments: [], fromRemote: false }
}
/** 批量读取多个视频本地缓存（番剧多集预览用）。返回 Map<episodeId, cached|null> */
export const loadEpisodesCache = async (env, episodeIds) => {
    const result = new Map()
    await Promise.all(episodeIds.map(async id => {
        try {
            result.set(id, await env.storage.adCacheGet(id))
        } catch {
            result.set(id, null)
        }
    }))
    return result
}
/**
 * 批量提交：把每集（已有缓存 + 追加片段）或（仅覆盖片段）合并后写入本地与远程。
 * 供「更新全部缓存」（追加/覆盖）与批量清空使用。
 * @param {Array<{episodeId:string, cached:any, addSegments:any[], replaceSegments:any[]|null}>} items
 *        replaceSegments 为 null 表示追加模式；提供则整体替换（清空=[]）。
 */
export const commitBatch = async (env, items) => {
    let success = 0
    for (const item of items) {
        const { episodeId, cached } = item
        const existing = cached && cached.segments ? cached.segments : []
        const addSegments = Array.isArray(item.addSegments) ? item.addSegments : []
        const useReplace = item.replaceSegments !== undefined && item.replaceSegments !== null
        const base = useReplace ? item.replaceSegments : existing
        const merged = [...base, ...(useReplace ? [] : addSegments)].sort((a, b) => a.start - b.start)
        if (merged.length === 0 && !useReplace && (!existing || existing.length === 0)) continue
        await commitCache(env, episodeId, cached, merged)
        success++
    }
    return success
}
/** 检查视频是否有可用字幕（控制「重新识别」可见性） */
export const detectSubtitles = async (env, bvid) => {
    const { biliApis } = env
    if (!biliApis) return false
    try {
        const videoInfo = await biliApis.getVideoInformation('video', bvid)
        const cid = videoInfo?.cid
        if (!cid) return false
        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
        return !!(subtitles && subtitles.length > 0)
    } catch (error) {
        env.log?.debug('跳过片段管理丨检测字幕失败', error)
        return false
    }
}
/** 提交缓存：本地 + 远程，返回新缓存条目 */
export const commitCache = async (env, bvid, previousCached, finalSegments) => {
    const uid = env.uidProvider()
    const merged = [...finalSegments].sort((a, b) => a.start - b.start)
    const entry = {
        bvid,
        segments: merged,
        uploader_uid: uid,
        verified_by: uid ? [uid] : [],
        version: (previousCached?.version || 0) + 1,
        last_updated: Date.now(),
        locked: previousCached ? Boolean(previousCached.locked) : false
    }
    if (previousCached?.verified_by) {
        entry.verified_by = [...new Set([...previousCached.verified_by, uid].filter(Boolean))]
    }
    await env.storage.adCacheSet(bvid, entry)
    env.log?.info('跳过片段管理丨已更新本地缓存')
    try {
        const resp = await env.fetchImpl(env.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        })
        if (resp && resp.ok === false) {
            // 服务端拒绝（423 锁定 / 409 版本冲突）：本地已保存，远程未同步，留可定位日志
            let detail = ''
            try {
                const payload = await resp.json()
                detail = payload && payload.error ? `：${payload.error}` : ''
            } catch { /* 响应非 JSON，忽略解析 */ }
            env.log?.warn(`跳过片段管理丨远程缓存未更新（HTTP ${resp.status}${detail}），本地已保存`)
        } else {
            env.log?.info('跳过片段管理丨已更新远程缓存')
        }
    } catch (error) {
        env.log?.debug('跳过片段管理丨远程缓存上传失败', error)
    }
    return { cached: entry, segments: merged, canUpdate: canUpdateCache(entry, uid) }
}
