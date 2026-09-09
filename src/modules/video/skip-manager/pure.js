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
