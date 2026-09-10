/**
 * 跳过片段（Skip Manager）纯逻辑与常量。
 * 从 ad-skip.js 顶部抽取，供命令式逻辑与 Vue 组件/store 共用，避免双实现漂移。
 * 均为同步纯函数，可在 Node 环境单测。
 */
/** 远程共享缓存 API */
export const SKIP_CACHE_API = 'https://www.asifadeaway.com/UserScripts/bilibili/api/ad-cache.php'
/** 创建标准缓存数据结构 */
export const createCacheEntry = (bvid, segments, uid = null) => ({
    bvid,
    segments: segments || [],
    uploader_uid: uid,
    verified_by: uid ? [uid] : [],
    version: 1,
    last_updated: Date.now(),
    locked: false
})
/** 获取当前用户 UID（从 B 站 cookie 解析） */
export const getCurrentUid = () => {
    try {
        const match = document.cookie.match(/DedeUserID=(\d+)/)
        return match ? parseInt(match[1]) : null
    } catch {
        return null
    }
}
/**
 * 校验新片段是否与已有片段冲突
 * @param {{start:number,end:number}} newSeg
 * @param {Array<{start:number,end:number}>} existingSegments
 * @returns {string|null} 冲突原因，无冲突返回 null
 */
export const validateSegment = (newSeg, existingSegments) => {
    for (const seg of existingSegments) {
        if (newSeg.start === seg.start && newSeg.end === seg.end) {
            return '与已有片段完全重叠'
        }
        if (newSeg.start >= seg.start && newSeg.end <= seg.end) {
            return '已包含在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
        if (newSeg.start <= seg.start && newSeg.end >= seg.end) {
            return '已包含已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end)
        }
        if (newSeg.start > seg.start && newSeg.start < seg.end) {
            return '开始时间落在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
        if (newSeg.end > seg.start && newSeg.end < seg.end) {
            return '结束时间落在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
    }
    return null
}
/** 合并重叠或相邻的片段 */
export const mergeSegments = segments => {
    if (!Array.isArray(segments)) return []
    if (segments.length <= 1) return segments
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const merged = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1]
        const curr = sorted[i]
        if (curr.start <= last.end) {
            last.end = Math.max(last.end, curr.end)
        } else {
            merged.push(curr)
        }
    }
    return merged
}
/** 判断是否有权限更新缓存 */
export const canUpdateCache = (cached, currentUid) => {
    if (!cached) return true
    if (cached.locked) return false
    if (!currentUid) return true
    if (cached.uploader_uid === currentUid) return true
    return false
}
/** 格式化时间为 M:SS */
export const formatTime = seconds => {
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return min + ':' + (sec < 10 ? '0' : '') + sec
}
/** 解析时间字符串为秒数（支持 M:SS 或秒数） */
export const parseTime = str => {
    const parts = str.split(':').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1]
    }
    if (parts.length === 1 && !isNaN(parts[0])) {
        return parts[0]
    }
    return null
}
/** 解析跳过时长字符串为秒数（支持 "1m30s"、"30s"、"90" 等格式） */
export const parseDuration = str => {
    str = str.trim().toLowerCase()
    // 优先匹配 m+s 组合（如 "1m30s"），避免被下方 endsWith('s') 分支误截
    const minuteMatch = str.match(/^(\d+)m(\d+)s?$/)
    if (minuteMatch) {
        return parseInt(minuteMatch[1]) * 60 + parseInt(minuteMatch[2])
    }
    // "30s" 格式
    if (str.endsWith('s')) {
        const num = parseFloat(str.slice(0, -1))
        return isNaN(num) ? null : num
    }
    // 纯数字
    const num = parseFloat(str)
    return isNaN(num) ? null : num
}
/** 片段起点容差（秒）：timeupdate 约 4Hz + 倍速/丢帧，等值比较必然漏跳（P0-2） */
export const SKIP_EPSILON = 0.25
/**
 * 创建跳过片段匹配器（P0-2）
 *
 * 替代 `Math.floor(currentTime) === start` 的整数等值判断：
 * 1) 窗口匹配：`t + epsilon >= start && t < end`，容忍小数起点与 seek 落在 start 之后；
 * 2) 单调状态：同一片段只跳一次（lastSkippedKey），跳过后时间轴前移，不会重复触发；
 * 3) 回跳重置：用户把进度拖回上一个已跳片段之前时，允许再次触发（避免"拖回去就不跳了"）；
 * 4) 倍速/丢帧安全：只要时间戳仍落在段内就会命中，不依赖恰好命中 start 的那一帧。
 *
 * 纯函数 + 闭包状态，可在 Node 环境单测（见 test/skip-matcher.test.js）。
 * @param {Array<{start:number,end:number}>} segments 片段（内部会 mergeSegments 归一）
 * @param {{epsilon?:number}} [options]
 */
export const createSkipMatcher = (segments, options = {}) => {
    const epsilon = typeof options.epsilon === 'number' ? options.epsilon : SKIP_EPSILON
    const skipBackTolerance = typeof options.skipBackTolerance === 'number' ? options.skipBackTolerance : 1
    const sortedSegments = mergeSegments(segments || [])
    const lastEnd = sortedSegments.length ? sortedSegments[sortedSegments.length - 1].end : 0
    let lastSkippedKey = null
    let lastSkippedStart = -1
    const reset = () => {
        lastSkippedKey = null
        lastSkippedStart = -1
    }
    return {
        sortedSegments,
        lastEnd,
        /**
         * 求当前时刻应跳转的目标
         * @param {number} currentTime 当前播放时间（秒，可为小数）
         * @returns {{start:number,end:number,skipTo:number,key:string}|null}
         */
        match (currentTime) {
            if (!sortedSegments.length) return null
            // 用户把进度拖回「本次已跳片段起点」之前 → 解除已跳过状态，允许再次触发；
            // 用起点（而非终点）判定，避免段内小幅回退导致重复 seek
            if (lastSkippedStart >= 0 && currentTime < lastSkippedStart - skipBackTolerance) {
                reset()
            }
            for (const segment of sortedSegments) {
                const key = `${segment.start}-${segment.end}`
                if (key === lastSkippedKey) continue
                if (currentTime + epsilon >= segment.start && currentTime < segment.end) {
                    lastSkippedKey = key
                    lastSkippedStart = segment.start
                    return { start: segment.start, end: segment.end, skipTo: segment.end, key }
                }
            }
            return null
        },
        /** 时间轴已越过最后一个片段：调用方据此移除监听 */
        isFinishedAt (currentTime) {
            return sortedSegments.length > 0 && currentTime > lastEnd
        },
        /** 已跳过的片段 key 列表（诊断用） */
        get skippedKey () {
            return lastSkippedKey
        }
    }
}
/**
 * 归一化 AI / 用户输入的片段集合（报告 §4.6：结果经校验后再缓存与上传）
 *
 * 1) 丢弃非对象、缺字段、非数值、end <= start 的非法项；
 * 2) 数值统一为 Number（AI 偶尔返回字符串）；
 * 3) 合并重叠/相邻片段，保证缓存与上传数据干净。
 * @param {Array<{start:any,end:any,summary?:string}>} segments
 * @returns {Array<{start:number,end:number,summary?:string}>}
 */
export const sanitizeSegments = segments => {
    const valid = (Array.isArray(segments) ? segments : [])
        .filter(seg => seg && Number.isFinite(Number(seg.start)) && Number.isFinite(Number(seg.end)))
        .map(seg => ({ ...seg, start: Number(seg.start), end: Number(seg.end) }))
        .filter(seg => seg.end > seg.start)
    return mergeSegments(valid)
}
