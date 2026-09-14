/**
 * 跳过片段管理面板的共享类型（V3 Vue 面板）
 * 结构对齐同目录的 `pure.js` / `skip-manager-service.js`（两者尚未迁移到 .ts）；
 * 它们迁移后应改为从那里导出这些类型，本文件随之删除（避免两处漂移）。
 */
/** 片段与缓存条目类型的事实源是 pure.ts，这里仅为历史 import 路径再导出 */
export type { SkipSegment, SkipCacheEntry } from './pure'
/** 剧集信息（番剧页）：字段来自 B 站 season API，按需收窄 */
export interface SkipEpisode {
    id?: string | number
    ep_id?: string | number
    cid?: string | number | null
    bvid?: string
    title?: string
    long_title?: string
    [key: string]: unknown
}
/**
 * 面板注入环境（由 `src/modules/video/ad-skip.js` 装配）
 * 字段契约见 `skip-manager-service.js` 头注释；service 层仍是 .js（参数为 any），故此处以面板实际用到的字段为准。
 */
export interface SkipManagerEnv {
    /** 本地缓存存取（storageService 的 adCache* 子集） */
    storage: {
        adCacheGet: (id: string) => Promise<SkipCacheEntry | null>
        adCacheSet: (id: string, entry: SkipCacheEntry) => Promise<unknown>
    }
    fetchImpl: typeof fetch
    apiUrl: string
    /** 当前用户 UID（未登录返回 null） */
    uidProvider: () => number | null
    /** B 站接口封装（biliApis 的子集，服务层据此探测字幕） */
    biliApis?: {
        getVideoInformation: (pageType: string, videoId: string) => Promise<{ cid?: string | number } | null | undefined>
        getVideoSubtitles: (bvid: string, cid: string | number) => Promise<unknown[] | null | undefined>
    }
    log: {
        info: (...args: unknown[]) => void
        debug: (...args: unknown[]) => void
        error: (...args: unknown[]) => void
        /** 可选：ad-skip 装配的 log 未提供 warn，调用点用可选链（缺失时静默） */
        warn?: (...args: unknown[]) => void
    }
    /** 触发一次广告/片段识别（ad-skip 的 recognizeSkipSegments） */
    recognize?: (id: string) => Promise<{ error?: string; segments?: SkipSegment[] } | null>
    /** 锁定/解锁远端缓存（返回更新后的条目） */
    lockCache?: (id: string, entry: SkipCacheEntry, locked: boolean) => Promise<SkipCacheEntry | null>
    /** 番剧季信息（biliApis.getVideoInformation('bangumi', id)） */
    season?: (id: string) => Promise<{ episodes?: SkipEpisode[] } | null>
    afterCommit?: () => Promise<void>
}
