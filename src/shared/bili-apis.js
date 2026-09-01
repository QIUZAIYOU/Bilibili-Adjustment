import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import axios from 'axios'
import MD5 from 'md5'
const logger = new LoggerService('BiliApis')

// ========== 全局请求队列 ==========
// 所有 bilibili API 请求排队执行，避免并发触发 429
const _requestQueue = []
let _queueProcessing = false
const QUEUE_DELAY = 300 // 每次请求间隔 300ms

function _enqueueRequest (fn) {
    return new Promise((resolve, reject) => {
        _requestQueue.push({ fn, resolve, reject })
        _processQueue()
    })
}

async function _processQueue () {
    if (_queueProcessing) return
    _queueProcessing = true
    while (_requestQueue.length > 0) {
        const { fn, resolve, reject } = _requestQueue.shift()
        try {
            const result = await fn()
            resolve(result)
        } catch (err) {
            reject(err)
        }
        // 请求间隔，避免触发频率限制
        if (_requestQueue.length > 0) {
            await new Promise(r => setTimeout(r, QUEUE_DELAY))
        }
    }
    _queueProcessing = false
}

// ========== 带重试的请求 ==========
const _fetchWithRetry = async (url, options = {}, retries = 2, delay = 1000) => {
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, { withCredentials: true, ...options })
        } catch (err) {
            const is429 = err?.response?.status === 429
            if (is429 && i < retries) {
                const wait = delay * Math.pow(2, i) // 1s, 2s
                logger.info(`请求被限流(429)，${wait}ms 后重试 (${i + 1}/${retries})`)
                await new Promise(r => setTimeout(r, wait))
                continue
            }
            throw err
        }
    }
}

// ========== 统一的 API 请求入口 ==========
// 所有 bilibili API 调用通过此函数，自动排队 + 重试
async function _apiRequest (url, options = {}) {
    return _enqueueRequest(() => _fetchWithRetry(url, options))
}

// ========== 视频信息缓存（5 分钟） ==========
const _videoInfoCache = new Map()
const VIDEO_INFO_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

export const biliApis = {
    async getQueryWithWbi (originalParams) {
        const mixinKeyEncTab = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
        ]
        const getMixinKey = orig => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)
        const encWbi = (params, img_key, sub_key) => {
            const mixin_key = getMixinKey(img_key + sub_key),
                curr_time = Math.round(Date.now() / 1000),
                chr_filter = /[!'()*]/g
            Object.assign(params, { wts: curr_time })
            const query = Object.keys(params).sort().map(key => {
                const value = params[key].toString().replace(chr_filter, '')
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            }).join('&')
            const wbi_sign = MD5(query + mixin_key)
            return query + '&w_rid=' + wbi_sign
        }
        const getWbiKeys = async () => {
            const url = 'https://api.bilibili.com/x/web-interface/nav'
            const res = await _apiRequest(url)
            const { data: { wbi_img: { img_url, sub_url }}} = res.data
            return {
                img_key: img_url.slice(
                    img_url.lastIndexOf('/') + 1,
                ),
                sub_key: sub_url.slice(
                    sub_url.lastIndexOf('/') + 1,
                )
            }
        }
        const { img_key, sub_key } = await getWbiKeys()
        return encWbi(originalParams, img_key, sub_key)
    },
    getCurrentVideoID (url) {
        if (!url) url = window.location.href
        let parsedUrl
        try {
            parsedUrl = new URL(url)
        } catch {
            return 'error'
        }
        const { pathname } = parsedUrl
        if (pathname.startsWith('/video/') || pathname.startsWith('/list/')) {
            const match = pathname.match(/\/video\/(BV\w+)/)
            return match?.[1] || parsedUrl.searchParams.get('bvid') || 'error'
        } else if (pathname.startsWith('/bangumi/')) {
            const match = pathname.match(/\/bangumi\/play\/ep(\d+)/)
            return match?.[1] || 'error'
        }
        return 'error'
    },
    async getVideoInformation (pageType, videoId) {
        if (!videoId) return
        // 请求去重：同一 videoId 5 分钟内并发调用共享同一次请求
        const cacheKey = `${pageType}:${videoId}`
        if (_videoInfoCache.has(cacheKey)) return _videoInfoCache.get(cacheKey)
        const promise = this._fetchVideoInformation(pageType, videoId)
        _videoInfoCache.set(cacheKey, promise)
        setTimeout(() => _videoInfoCache.delete(cacheKey), VIDEO_INFO_CACHE_TTL)
        return promise
    },
    async _fetchVideoInformation (pageType, videoId) {
        const url = pageType === 'video' ? `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}` : `https://api.bilibili.com/pgc/view/web/season?ep_id=${videoId}`
        if (pageType === 'video') {
            const { data: { code, data }} = await _apiRequest(url)
            // logger.debug(pageType, videoId, data)
            if (code === 0) return data
            else if (code === -400) logger.info('获取视频基本信息丨请求错误')
            else if (code === -403) logger.info('获取视频基本信息丨权限不足')
            else if (code === -404) logger.info('获取视频基本信息丨无视频')
            else if (code === 62002) logger.info('获取视频基本信息丨稿件不可见')
            else if (code === 62004) logger.info('获取视频基本信息丨稿件审核中')
            else if (code === 'ERR_BAD_REQUEST') logger.info('获取视频基本信息丨请求失败')
            else logger.warn('获取视频基本信息丨请求错误')
        } else {
            const { data: { code, result }} = await _apiRequest(url)
            // logger.debug(pageType, videoId, result)
            if (code === 0) return result
        }
    },
    async getUserInformation (userId) {
        const url = `https://api.bilibili.com/x/web-interface/card?mid=${userId}`
        const { data: { code, data }} = await _apiRequest(url)
        if (code === 0) return data
        else if (code === -400) logger.info('获取用户基本信息丨请求错误')
        else if (code === -403) logger.info('获取用户基本信息丨权限不足')
        else if (code === -404) logger.info('获取用户基本信息丨无此用户')
        else if (code === 'ERR_BAD_REQUEST') logger.info('获取用户基本信息丨请求失败')
        else logger.warn('获取用户基本信息丨请求失败')
    },
    async getVideoSubtitles (bvid, cid) {
        const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`
        const { data: { code, data }} = await _apiRequest(url)
        if (code === 0) return data?.subtitle?.subtitles
        else return null
    },
    async getVideoTags (bvid) {
        const url = `https://api.bilibili.com/x/tag/archive/tags?bvid=${bvid}`
        const { data: { code, data }} = await _apiRequest(url)
        if (code === 0) return data
        else return null
    },
    async getUnreadCount () {
        try {
            const url = 'https://message.bilibili.com/x/msg/unread/count'
            const { data: { code, data: { all_count }}} = await _apiRequest(url)
            if (code === 0) return all_count
            else return 0
        } catch {
            return 0
        }
    },
    async getLiveRoomStatus (roomid) {
        const url = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomid}`
        try {
            const { data: { code, data: { live_status }}} = await _apiRequest(url)
            if (code === 0) return live_status === 1
            else return false
        } catch {
            return false
        }
    },
    async getWebCreaterStatus (mid) {
        const url = `https://api.bilibili.com/x/web-interface/nav?mid=${mid}`
        try {
            const { data: { code, data: { isLogin, uname, official, vip }} } = await _apiRequest(url)
            if (code === 0) return { isLogin, uname, official, vip }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterPinInfo (mid) {
        const url = `https://api.bilibili.com/x/space/acc/info?mid=${mid}`
        try {
            const { data: { code, data: { sign, birthday, sex, face }} } = await _apiRequest(url)
            if (code === 0) return { sign, birthday, sex, face }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterRelationInfo (mid) {
        const url = `https://api.bilibili.com/x/relation/stat?vmid=${mid}`
        try {
            const { data: { code, data: { follower, following }}} = await _apiRequest(url)
            if (code === 0) return { follower, following }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterUpstatInfo (mid) {
        const url = `https://api.bilibili.com/x/space/upstat?mid=${mid}`
        try {
            const { data: { code, data: { archive: { view }, article: { view: articleView }, likes }}} = await _apiRequest(url)
            if (code === 0) return { view, articleView, likes }
            else return null
        } catch {
            return null
        }
    },
    async getDynamicItems (offset) {
        const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?offset=${offset}`
        try {
            const { data: { code, data: { items }}} = await _apiRequest(url)
            if (code === 0) return items
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterArcsDrawInfo (mid) {
        const url = `https://api.bilibili.com/x/space/wbi/arc/search?mid=${mid}&ps=10&pn=1`
        try {
            const wbiUrl = `https://api.bilibili.com/x/space/arc/search?${await this.getQueryWithWbi({ mid, ps: 10, pn: 1 })}`
            const { data: { code, data: { list: { vlist }}} = { data: {} } } = await _apiRequest(wbiUrl)
            if (code === 0) return vlist
            else return null
        } catch {
            return null
        }
    },
    async getSearchResult (keyword, page = 1) {
        const wbiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${await this.getQueryWithWbi({ keyword, page, search_type: 'video' })}`
        try {
            const { data: { code, data: { result }}} = await _apiRequest(wbiUrl)
            if (code === 0) return result
            else return null
        } catch {
            return null
        }
    }
}
