import { LoggerService } from '@/services/logger.service'
import { httpGet } from '@/utils/http'
import type { HttpRequestOptions, HttpResponse } from '@/utils/http'
import {
    DEFAULT_RETRY_BUDGET_MS,
    describeRequestError,
    describeRetryBudget,
    isRetryableRequestError,
    withRetryBudget
} from '@/utils/retry-policy'
import MD5 from 'md5'
/** B 站接口响应外壳（各接口字段不同，调用点用泛型声明期望形状） */
export interface BiliEnvelope<T = unknown> {
    code?: number | string
    data?: T
    result?: T
    message?: string
}
/** B 站返回的数据对象（字段随官方版本变化，消费方按需收窄） */
export type BiliData = Record<string, unknown>
/** 排队中的请求 */
interface QueuedRequest {
    fn: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
}
const logger = new LoggerService('BiliApis', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
// ========== 全局请求队列 ==========
// 所有 bilibili API 请求排队执行，避免并发触发 429
const _requestQueue: QueuedRequest[] = []
let _queueProcessing = false
const QUEUE_DELAY = 300 // 每次请求间隔 300ms
function _enqueueRequest<T> (fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        _requestQueue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (value: unknown) => void, reject })
        _processQueue()
    })
}
async function _processQueue (): Promise<void> {
    if (_queueProcessing) return
    _queueProcessing = true
    while (_requestQueue.length > 0) {
        const { fn, resolve, reject } = _requestQueue.shift()!
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
/** 接口重试：首次间隔 1 秒，退避封顶 30 秒，总预算 3 分钟（**不按次数**） */
const API_RETRY_INTERVAL_MS = 1000
const API_RETRY_BUDGET_MS = DEFAULT_RETRY_BUDGET_MS
/**
 * 发起一次接口请求，失败按「时间预算 + 递增退避」重试。
 *
 * 2026-09-24 改：原来只有超时/429 才重试且最多 3 次尝试（2 次重试），网络差时几次就永久放弃；
 * 现在在 3 分钟预算内持续重试（1s→2s→4s…最多 30s 一次），断网、超时、429、5xx 都算可重试。
 *
 * ⚠️ 每次尝试都**单独入队**：退避等待期间不占着全局请求队列，其它接口请求可以照常进行。
 */
const _fetchWithRetry = (url: string, options: HttpRequestOptions = {}): Promise<HttpResponse | undefined> =>
    withRetryBudget(
        () => _enqueueRequest(() => httpGet(url, { withCredentials: true, timeout: 15000, ...options })),
        {
            budgetMs: API_RETRY_BUDGET_MS,
            intervalMs: API_RETRY_INTERVAL_MS,
            // 确定性失败（400/403/404…）与用户主动取消：重试再久也没用，直接抛出
            shouldRetry: isRetryableRequestError,
            onRetry: ({ attempts, elapsedMs, delayMs, error }) => logger.info(`接口请求失败（${describeRequestError(error)}），${delayMs}ms 后重试（已重试 ${attempts} 次，耗时 ${Math.round(elapsedMs / 1000)} 秒）`),
            onGiveUp: ({ attempts, error }) => logger.warn(`接口请求重试已达时间预算（${describeRetryBudget(API_RETRY_BUDGET_MS)}，共尝试 ${attempts} 次），放弃：${describeRequestError(error)}`)
        }
    ) as Promise<HttpResponse | undefined>
// ========== 统一的 API 请求入口 ==========
// 所有 bilibili API 调用通过此函数：**每次尝试**单独排队（避免并发触发 429）+ 按时间预算重试
// ⚠️ 不要再在这里套一层 _enqueueRequest：_fetchWithRetry 内部已逐次入队，
//    外面再套一层会让队列一直等这个重试循环（内层入队永远排不到）→ 死锁
async function _apiRequest<T = BiliEnvelope> (url: string, options: HttpRequestOptions = {}): Promise<{ data: T; status: number; headers: Headers }> {
    return _fetchWithRetry(url, options) as Promise<{ data: T; status: number; headers: Headers }>
}
// ========== 视频信息缓存（5 分钟） ==========
const _videoInfoCache = new Map<string, Promise<unknown>>()
const VIDEO_INFO_CACHE_TTL = 5 * 60 * 1000 // 5 分钟
export const biliApis = {
    async getQueryWithWbi (originalParams: Record<string, string | number>): Promise<string> {
        const mixinKeyEncTab = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
        ]
        const getMixinKey = (orig: string): string => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)
        const encWbi = (params: Record<string, string | number>, img_key: string, sub_key: string): string => {
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
        const getWbiKeys = async (): Promise<{ img_key: string; sub_key: string }> => {
            const url = 'https://api.bilibili.com/x/web-interface/nav'
            // ⚠️ `res.data` 就是**整个响应体**（`{code, message, ttl, data:{...}}`），不是接口的 data 字段：
            // 这里曾经写成 `res.data.wbi_img`，于是永远取到 undefined 并在解构处抛错，
            // 而两个调用点都在 try/catch 里静默吞掉 —— 表现为「UP主空间投稿列表、视频搜索」永远拿不到数据
            // （2026-09-24 用真实接口核对响应形状后修正）
            const res = await _apiRequest<{ data?: { wbi_img?: { img_url?: string; sub_url?: string }}}>(url)
            const imgUrl = res.data?.data?.wbi_img?.img_url
            const subUrl = res.data?.data?.wbi_img?.sub_url
            if (!imgUrl || !subUrl) throw new Error('nav 接口未返回 wbi_img（无法签名 wbi 请求）')
            return {
                img_key: imgUrl.slice(
                    imgUrl.lastIndexOf('/') + 1
                ),
                sub_key: subUrl.slice(
                    subUrl.lastIndexOf('/') + 1
                )
            }
        }
        const { img_key, sub_key } = await getWbiKeys()
        return encWbi(originalParams, img_key, sub_key)
    },
    getCurrentVideoID (url?: string): string {
        if (!url) url = window.location.href
        let parsedUrl: URL
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
            if (match?.[1]) return match[1]
            // ss/季链接（如 /bangumi/play/ss12345）
            const ssMatch = pathname.match(/\/bangumi\/play\/ss(\d+)/)
            if (ssMatch?.[1]) {
                // 优先尝试从页面解析当前分集 ep id（精确到分集，缓存/识别更准）
                try {
                    const state = window.__INITIAL_STATE__
                    const epId = state?.epInfo?.id
                        || (Array.isArray(state?.epList) && state.epList.find(ep => ep && (ep.now === true || ep.now === 1) && ep.id)?.id)
                    if (epId) return String(epId)
                    // DOM 兜底：高亮的当前集链接（B 站番剧选集列表的激活态类名/属性并不统一，
                    // 同时检查链接自身、其父级列表项以及 aria-current）
                    const epLinks = [...document.querySelectorAll('a[href*="/bangumi/play/ep"]')]
                    const isActiveLink = (a: Element): boolean => {
                        const activeRe = /(^|\s)(active|current|on|selected|playing)(\s|$)/
                        if (activeRe.test(a.className || '')) return true
                        if (a.getAttribute('aria-current') === 'true') return true
                        const parent = a.closest('li, div')
                        return parent ? activeRe.test(parent.className || '') : false
                    }
                    const activeLink = epLinks.find(isActiveLink)
                    const domEp = activeLink?.getAttribute('href')?.match(/ep(\d+)/)?.[1]
                    if (domEp) return String(domEp)
                } catch { /* 忽略异常 */ }
                // 无法解析当前分集时，返回带 ss 前缀的季 id（调用方可走 season API）
                return 'ss' + ssMatch[1]
            }
            return 'error'
        }
        return 'error'
    },
    async getVideoInformation (pageType: string, videoId: string): Promise<unknown> {
        if (!videoId) return
        // 请求去重：同一 videoId 5 分钟内并发调用共享同一次请求
        const cacheKey = `${pageType}:${videoId}`
        if (_videoInfoCache.has(cacheKey)) return _videoInfoCache.get(cacheKey)
        const promise = this._fetchVideoInformation(pageType, videoId)
        _videoInfoCache.set(cacheKey, promise)
        // 失败不缓存，允许下次重试
        promise.catch(() => { _videoInfoCache.delete(cacheKey) })
        setTimeout(() => _videoInfoCache.delete(cacheKey), VIDEO_INFO_CACHE_TTL)
        return promise
    },
    async _fetchVideoInformation (pageType: string, videoId: string): Promise<BiliData | undefined> {
        let url: string
        if (pageType === 'video') {
            url = `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`
        } else {
            // bangumi：纯数字视为 ep_id；带 ss 前缀视为 season_id（/bangumi/play/ss 链接）
            const isSeason = typeof videoId === 'string' && videoId.startsWith('ss')
            const id = isSeason ? videoId.slice(2) : videoId
            url = `https://api.bilibili.com/pgc/view/web/season?${isSeason ? 'season_id' : 'ep_id'}=${id}`
        }
        if (pageType === 'video') {
            const res = await _apiRequest<{ code?: number | string; data?: BiliData }>(url)
            const { code, data } = res.data
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
            const res = await _apiRequest<{ code?: number | string; result?: BiliData }>(url)
            const { code, result } = res.data
            // logger.debug(pageType, videoId, result)
            if (code === 0) return result
        }
    },
    async getUserInformation (userId: string | number): Promise<BiliData | undefined> {
        const url = `https://api.bilibili.com/x/web-interface/card?mid=${userId}`
        const res = await _apiRequest<{ code?: number | string; data?: BiliData }>(url)
        const { code, data } = res.data
        if (code === 0) return data
        else if (code === -400) logger.info('获取用户基本信息丨请求错误')
        else if (code === -403) logger.info('获取用户基本信息丨权限不足')
        else if (code === -404) logger.info('获取用户基本信息丨无此用户')
        else if (code === 'ERR_BAD_REQUEST') logger.info('获取用户基本信息丨请求失败')
        else logger.warn('获取用户基本信息丨请求失败')
    },
    async getVideoSubtitles (bvid: string, cid: string | number): Promise<Array<BiliData> | null | undefined> {
        const url = `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`
        const res = await _apiRequest<{ code?: number | string; data?: { subtitle?: { subtitles?: Array<BiliData> }}}>(url)
        const { code, data } = res.data
        if (code === 0) return data?.subtitle?.subtitles
        else return null
    },
    async getSubtitleContent (subtitleUrl: string): Promise<BiliData[]> {
        // 补全协议头
        const fullUrl = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl
        try {
            // 使用原生 fetch 而非 _apiRequest，避免 withCredentials 导致 CORS 问题
            const response = await fetch(fullUrl)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            return data?.body || []
        } catch (error) {
            logger.debug('获取字幕内容失败', error)
            return []
        }
    },
    async getVideoTags (bvid: string): Promise<Array<BiliData> | null | undefined> {
        const url = `https://api.bilibili.com/x/tag/archive/tags?bvid=${bvid}`
        const res = await _apiRequest<{ code?: number | string; data?: Array<BiliData> }>(url)
        const { code, data } = res.data
        if (code === 0) return data
        else return null
    },
    async getUnreadCount (): Promise<number | undefined> {
        try {
            const url = 'https://message.bilibili.com/x/msg/unread/count'
            const res = await _apiRequest<{ code?: number | string; data?: { all_count?: number }}>(url)
            const { code, data } = res.data
            if (code === 0) return data?.all_count
            else return 0
        } catch {
            return 0
        }
    },
    async getLiveRoomStatus (roomid: string | number): Promise<boolean> {
        const url = `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomid}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { live_status?: number }}>(url)
            const { code, data } = res.data
            if (code === 0) return data?.live_status === 1
            else return false
        } catch {
            return false
        }
    },
    async getWebCreaterStatus (mid: string | number): Promise<BiliData | null> {
        const url = `https://api.bilibili.com/x/web-interface/nav?mid=${mid}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { isLogin?: unknown; uname?: unknown; official?: unknown; vip?: unknown }}>(url)
            const { code, data } = res.data
            if (code === 0) return { isLogin: data?.isLogin, uname: data?.uname, official: data?.official, vip: data?.vip }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterPinInfo (mid: string | number): Promise<BiliData | null> {
        const url = `https://api.bilibili.com/x/space/acc/info?mid=${mid}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { sign?: unknown; birthday?: unknown; sex?: unknown; face?: unknown }}>(url)
            const { code, data } = res.data
            if (code === 0) return { sign: data?.sign, birthday: data?.birthday, sex: data?.sex, face: data?.face }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterRelationInfo (mid: string | number): Promise<BiliData | null> {
        const url = `https://api.bilibili.com/x/relation/stat?vmid=${mid}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { follower?: unknown; following?: unknown }}>(url)
            const { code, data } = res.data
            if (code === 0) return { follower: data?.follower, following: data?.following }
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterUpstatInfo (mid: string | number): Promise<BiliData | null> {
        const url = `https://api.bilibili.com/x/space/upstat?mid=${mid}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { archive?: { view?: unknown }; article?: { view?: unknown }; likes?: unknown }}>(url)
            const { code, data } = res.data
            if (code === 0) return { view: data?.archive?.view, articleView: data?.article?.view, likes: data?.likes }
            else return null
        } catch {
            return null
        }
    },
    async getDynamicItems (offset: string | number): Promise<Array<BiliData> | null | undefined> {
        const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?offset=${offset}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { items?: Array<BiliData> }}>(url)
            const { code, data } = res.data
            if (code === 0) return data?.items
            else return null
        } catch {
            return null
        }
    },
    async getWebCreaterArcsDrawInfo (mid: string | number): Promise<Array<BiliData> | null | undefined> {
        try {
            // ⚠️ 必须用 wbi 端点：`x/space/arc/search` 是已弃用的非 wbi 端点（实测两个端点都会返回
            // -403 访问权限不足，但 B 站自己的空间页请求的是 `x/space/wbi/arc/search`，这里对齐它；
            // 旧版单文件脚本用的也是 wbi 端点，重构时被写错成非 wbi 端点）
            const wbiUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${await this.getQueryWithWbi({ mid, ps: 10, pn: 1 })}`
            const res = await _apiRequest<{ code?: number | string; data?: { list?: { vlist?: Array<BiliData> }}}>(wbiUrl)
            const { code, data } = res.data
            if (code === 0) return data?.list?.vlist
            else return null
        } catch {
            return null
        }
    },
    async getSearchResult (keyword: string, page = 1): Promise<Array<BiliData> | null | undefined> {
        const wbiUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${await this.getQueryWithWbi({ keyword, page, search_type: 'video' })}`
        try {
            const res = await _apiRequest<{ code?: number | string; data?: { result?: Array<BiliData> }}>(wbiUrl)
            const { code, data } = res.data
            if (code === 0) return data?.result
            else return null
        } catch {
            return null
        }
    }
}
