import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { aiService, initializeAIService } from '@/services/ai.service'
import { storageService } from '@/services/storage.service'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { createApp } from 'vue'
import SkipManagerMainPanel from './skip-manager/SkipManagerMainPanel.vue'
import BangumiSkipManager from './skip-manager/BangumiSkipManager.vue'
import { SKIP_CACHE_API, createCacheEntry, getCurrentUid, mergeSegments } from './skip-manager/pure'
const logger = new LoggerService('VideoModule')
export const adSkipFeatures = {
    async identifyAdvertisementTimestamps () {
        // 本函数负责「无缓存时用 AI 识别补全广告片段」：需总开关与 AI 识别子开关均开启
        if (!this.userConfigs.auto_skip || !this.userConfigs.ai_auto_identify) {
            logger.info('自动跳过广告丨功能已关闭（需开启「跳过片段」与「AI 自动识别广告」）')
            return
        }
        if (this.advertisementIdentified) {
            logger.debug('自动跳过广告丨已执行过，跳过重复执行')
            return
        }
        this.advertisementIdentified = true
        setTimeout(() => {
            this.advertisementIdentified = false
        }, 30000)
        // 缓存片段已由 loadCachedSkipSegments 应用过，避免重复绑定跳过监听
        if (this._skipCacheApplied) return
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        // ss/季链接无法确定具体分集，跳过自动识别（可在片段管理弹窗内按集手动操作）
        if (!bvid || bvid === 'error' || (typeof bvid === 'string' && bvid.startsWith('ss'))) return
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached) {
                logger.info('自动跳过广告丨命中本地缓存')
                const segments = cached.segments || cached
                this.autoSkipAdvertisementSegments(segments)
                return segments
            }
        } catch (error) {
            logger.debug('自动跳过广告丨本地缓存读取失败', error)
        }
        try {
            const resp = await fetch(`${SKIP_CACHE_API}?bvid=${bvid}`)
            if (resp.ok) {
                const result = await resp.json()
                if (result.ok && result.data) {
                    const segments = result.data.segments || []
                    logger.info('自动跳过广告丨命中远程缓存')
                    try {
                        await storageService.adCacheSet(bvid, result.data)
                    } catch { /* 忽略异常 */ }
                    this.autoSkipAdvertisementSegments(segments)
                    return segments
                }
            }
        } catch (error) {
            logger.debug('自动跳过广告丨远程缓存查询失败', error)
        }
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        if (!videoInfo) return
        const cid = videoInfo.cid
        const up_mid = videoInfo.owner?.mid
        if (!cid || !up_mid) return
        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
        if (!subtitles || subtitles.length === 0) return
        const chineseSubtitle = subtitles.find(s => s.lan === 'ai-zh')
        if (!chineseSubtitle) {
            logger.debug('自动跳过广告丨未找到中文AI字幕')
            return
        }
        const subtitleContent = await biliApis.getSubtitleContent(chineseSubtitle.subtitle_url)
        if (!subtitleContent || subtitleContent.length === 0) {
            logger.debug('自动跳过广告丨字幕内容为空')
            return
        }
        const formattedSubtitles = subtitleContent.map(item => ({
            start: item.from,
            end: item.to,
            text: item.content
        }))
        const subtitlesJsonString = JSON.stringify(formattedSubtitles)
        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            const adSegments = timestamps || []
            if (adSegments.length === 0) {
                logger.info('自动跳过广告丨无广告时间段落，功能已关闭')
            }
            const uid = getCurrentUid()
            const cacheEntry = createCacheEntry(bvid, adSegments, uid)
            try {
                await fetch(SKIP_CACHE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cacheEntry)
                })
                logger.info('自动跳过广告丨识别结果已上传到远程缓存')
            } catch (error) {
                logger.debug('自动跳过广告丨远程缓存上传失败', error)
            }
            try {
                await storageService.adCacheSet(bvid, cacheEntry)
                logger.info('自动跳过广告丨识别结果已缓存到本地')
            } catch (error) {
                logger.debug('自动跳过广告丨本地缓存写入失败', error)
            }
            this.autoSkipAdvertisementSegments(timestamps)
            return timestamps
        } catch (error) {
            logger.error('AI服务初始化或广告识别失败:', error)
            logger.warn('自动跳过广告功能暂时不可用，请检查AI服务配置')
            return []
        }
    },
    async autoSkipAdvertisementSegments (advertisementSegments) {
        if (!advertisementSegments || advertisementSegments.length === 0) return
        const video = elementSelectors.get('video')
        if (!video) return
        const sortedSegments = mergeSegments(advertisementSegments)
        const processedSegments = new Set()
        const handleTimeUpdate = () => {
            const currentTime = Math.floor(video.currentTime)
            for (const segment of sortedSegments) {
                const { start, end } = segment
                const segmentKey = `${start}-${end}`
                if (!processedSegments.has(segmentKey)) {
                    if (currentTime === start) {
                        logger.info(`自动跳过广告丨从 ${start}s 跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                    if (currentTime > start && currentTime < end) {
                        logger.info(`自动跳过广告丨当前在广告时间段 ${start}s-${end}s 内，跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                }
            }
            if (processedSegments.size === sortedSegments.length) {
                video.removeEventListener('timeupdate', handleTimeUpdate)
                logger.info('自动跳过广告丨所有广告已处理完成，移除事件监听器')
            }
        }
        this._adVideo = video
        this._adTimeUpdateHandler = handleTimeUpdate
        video.addEventListener('timeupdate', handleTimeUpdate)
        logger.info('自动跳过广告丨已启动，共检测到', sortedSegments.length, '个广告时间段', sortedSegments)
        handleTimeUpdate()
    },
    // Vue 版「跳过片段管理」入口（对外契约保持 showSkipSegmentManager(bvid)，内部按页面类型分发组件）
    async showSkipSegmentManager (bvid) {
        const isBangumi = this.userConfigs?.page_type === 'bangumi'
        const env = {
            storage: storageService,
            fetchImpl: fetch,
            apiUrl: SKIP_CACHE_API,
            uidProvider: getCurrentUid,
            biliApis,
            log: {
                info: (...args) => logger.info(...args),
                debug: (...args) => logger.debug(...args),
                error: (...args) => logger.error(...args)
            },
            recognize: async id => this.recognizeSkipSegments(id),
            lockCache: async (id, entry, locked) => this.setCacheLocked(id, entry, locked),
            season: async id => biliApis.getVideoInformation('bangumi', id),
            // 提交成功后复位识别状态并预识别（与旧命令式提交行为一致；番剧视图不调用）
            afterCommit: async () => {
                this.advertisementIdentified = false
                await this.identifyAdvertisementTimestamps().catch(() => {})
            }
        }
        const Panel = isBangumi ? BangumiSkipManager : SkipManagerMainPanel
        const dialog = openAdjustmentDialog({
            key: 'skip-manager',
            title: '跳过片段管理',
            titleTag: '测试',
            width: 500,
            className: 'skip-manager-dialog',
            content: bodyEl => {
                const holder = document.createElement('div')
                bodyEl.appendChild(holder)
                const app = createApp(Panel, { bvid: String(bvid), env })
                app.mount(holder)
                return () => {
                    app.unmount()
                    holder.remove()
                }
            }
        })
        return dialog
    },
    // 番剧页专用：仅从缓存加载跳过片段（片头片尾等），不执行AI识别
    async loadCachedSkipSegments () {
        if (!this.userConfigs.auto_skip) return
        if (this._skipCacheApplied) return
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        // ss/季链接无法确定具体分集，跳过自动识别（可在片段管理弹窗内按集手动操作）
        if (!bvid || bvid === 'error' || (typeof bvid === 'string' && bvid.startsWith('ss'))) return
        // 先查本地缓存
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached?.segments?.length > 0) {
                logger.info('跳过片段丨命中本地缓存，共', cached.segments.length, '个片段')
                this._markSkipCacheApplied()
                this.autoSkipAdvertisementSegments(cached.segments)
                return cached.segments
            }
        } catch (error) {
            logger.debug('跳过片段丨本地缓存读取失败', error)
        }
        // 再查远程缓存
        try {
            const resp = await fetch(`${SKIP_CACHE_API}?bvid=${bvid}`)
            if (resp.ok) {
                const result = await resp.json()
                if (result.ok && result.data) {
                    const segments = result.data.segments || []
                    if (segments.length > 0) {
                        logger.info('跳过片段丨命中远程缓存，共', segments.length, '个片段')
                        try { await storageService.adCacheSet(bvid, result.data) } catch { /* 忽略异常 */ }
                        this._markSkipCacheApplied()
                        this.autoSkipAdvertisementSegments(segments)
                        return segments
                    }
                }
            }
        } catch (error) {
            logger.debug('跳过片段丨远程缓存查询失败', error)
        }
        logger.debug('跳过片段丨未找到缓存数据')
    },
    // 标记「缓存片段已应用」：30 秒后自动复位，供本页新增片段后再次应用；SPA 切集时由 video.module 显式复位
    _markSkipCacheApplied () {
        this._skipCacheApplied = true
        setTimeout(() => { this._skipCacheApplied = false }, 30000)
    },
    async recognizeSkipSegments (bvid) {
        const result = { segments: [], error: null, bvid }
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        if (!videoInfo) {
            result.error = '无法获取视频信息'
            return result
        }
        const cid = videoInfo.cid
        if (!cid) {
            result.error = '无法获取视频信息'
            return result
        }
        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
        if (!subtitles || subtitles.length === 0) {
            result.error = '视频无字幕，无法识别'
            return result
        }
        const chineseSubtitle = subtitles.find(s => s.lan === 'ai-zh')
        if (!chineseSubtitle) {
            result.error = '视频无中文字幕，无法识别'
            return result
        }
        const subtitleContent = await biliApis.getSubtitleContent(chineseSubtitle.subtitle_url)
        if (!subtitleContent || subtitleContent.length === 0) {
            result.error = '字幕内容为空，无法识别'
            return result
        }
        const formattedSubtitles = subtitleContent.map(item => ({
            start: item.from,
            end: item.to,
            text: item.content
        }))
        const subtitlesJsonString = JSON.stringify(formattedSubtitles)
        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            result.segments = timestamps || []
        } catch (error) {
            logger.error('跳过片段管理丨AI服务初始化失败:', error)
            result.error = 'AI服务不可用，请检查配置'
        }
        return result
    },
    // 锁定/解锁片段缓存（仅上传者本人操作）：locked=1 后他人无法修改，上传者解锁后可继续编辑
    async setCacheLocked (bvid, cacheEntry, locked) {
        if (!cacheEntry) return null
        const entry = { ...cacheEntry, locked: locked ? 1 : 0 }
        try {
            await storageService.adCacheSet(bvid, entry)
        } catch (error) {
            logger.error('跳过片段管理丨缓存锁定状态本地保存失败', error)
            return null
        }
        try {
            await fetch(SKIP_CACHE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            })
            logger.info('跳过片段管理丨缓存已' + (locked ? '锁定' : '解锁'))
        } catch (error) {
            logger.debug('跳过片段管理丨缓存锁定状态远程同步失败', error)
        }
        return entry
    }
}
