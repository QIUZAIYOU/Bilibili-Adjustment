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
    }
}
