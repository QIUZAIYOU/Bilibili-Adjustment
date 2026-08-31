import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { aiService, initializeAIService } from '@/services/ai.service'
import { storageService } from '@/services/storage.service'
const logger = new LoggerService('VideoModule')
const AD_CACHE_API = 'https://www.asifadeaway.com/UserScripts/bilibili/api/ad-cache.php'
export const adSkipFeatures = {
    async identifyAdvertisementTimestamps () {
        // 检查自动跳广告开关是否开启
        if (!this.userConfigs.auto_skip) {
            logger.info('自动跳过广告丨功能已关闭')
            return
        }
        // 检查是否已经执行过广告识别
        if (this.advertisementIdentified) {
            logger.debug('自动跳过广告丨已执行过，跳过重复执行')
            return
        }
        // 标记广告识别已执行
        this.advertisementIdentified = true
        // 30秒后重置广告识别状态，以便在视频切换时重新执行
        setTimeout(() => {
            this.advertisementIdentified = false
        }, 30000)
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        if (!bvid || bvid === 'error') return
        // 检查 IndexedDB 本地缓存，命中则直接使用，跳过 AI 调用
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached) {
                logger.info('自动跳过广告丨命中本地缓存，跳过 AI 识别')
                this.autoSkipAdvertisementSegments(cached)
                return cached
            }
        } catch (error) {
            logger.debug('自动跳过广告丨本地缓存读取失败，继续识别', error)
        }
        // 本地缓存未命中，查询远程共享缓存
        try {
            const resp = await fetch(`${AD_CACHE_API}?bvid=${bvid}`)
            if (resp.ok) {
                const result = await resp.json()
                if (result.ok && result.data?.segments?.length > 0) {
                    const segments = result.data.segments
                    logger.info('自动跳过广告丨命中远程缓存，跳过 AI 识别')
                    // 写入本地缓存以便后续快速访问
                    try {
                        await storageService.adCacheSet(bvid, segments)
                    } catch (_) {}
                    this.autoSkipAdvertisementSegments(segments)
                    return segments
                }
            }
        } catch (error) {
            logger.debug('自动跳过广告丨远程缓存查询失败，继续识别', error)
        }
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        if (!videoInfo) return
        const cid = videoInfo.cid
        const up_mid = videoInfo.owner?.mid
        if (!cid || !up_mid) return
        const subtitle = await biliApis.getVideoSubtitle(bvid, cid, up_mid)
        // logger.info('获取视频字幕', subtitle)
        if (!subtitle || subtitle.length === 0) {
            return
        }
        const subtitlesJsonString = JSON.stringify(subtitle)
        // 初始化AI服务
        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            // logger.info('广告时间戳识别结果:', timestamps)
            // 识别结果存入本地缓存 + 远程共享缓存
            if (timestamps && timestamps.length > 0) {
                try {
                    await storageService.adCacheSet(bvid, timestamps)
                    logger.info('自动跳过广告丨识别结果已缓存到本地')
                } catch (error) {
                    logger.debug('自动跳过广告丨本地缓存写入失败', error)
                }
                try {
                    fetch(AD_CACHE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bvid, segments: timestamps })
                    })
                    logger.info('自动跳过广告丨识别结果已上传到远程缓存')
                } catch (error) {
                    logger.debug('自动跳过广告丨远程缓存上传失败', error)
                }
            }
            // 调用自动跳过广告函数
            this.autoSkipAdvertisementSegments(timestamps)
            return timestamps
        } catch (error) {
            logger.error('AI服务初始化或广告识别失败:', error)
            logger.warn('自动跳过广告功能暂时不可用，请检查AI服务配置')
            return []
        }
    },
    async autoSkipAdvertisementSegments (advertisementSegments) {
        if (!advertisementSegments || advertisementSegments.length === 0) {
            logger.info('自动跳过广告丨无广告时间段落，功能已关闭')
            return
        }
        const video = await elementSelectors.video
        if (!video) return
        // 按start时间升序排序，确保正确处理多个广告时间段
        const sortedSegments = [...advertisementSegments].sort((a, b) => a.start - b.start)
        const processedSegments = new Set()
        const handleTimeUpdate = () => {
            const currentTime = Math.floor(video.currentTime)
            // 遍历所有广告时间段，检查是否需要跳转
            for (const segment of sortedSegments) {
                const { start, end } = segment
                const segmentKey = `${start}-${end}`
                // 只处理未处理过的时间段
                if (!processedSegments.has(segmentKey)) {
                    // 当播放到start时间时，跳转到end时间
                    if (currentTime === start) {
                        logger.info(`自动跳过广告丨从 ${start}s 跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                    // 如果当前时间已经在广告时间段内，直接跳转到end时间
                    if (currentTime > start && currentTime < end) {
                        logger.info(`自动跳过广告丨当前在广告时间段 ${start}s-${end}s 内，跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                }
            }
            // 当所有广告都处理完后，移除事件监听器
            if (processedSegments.size === sortedSegments.length) {
                video.removeEventListener('timeupdate', handleTimeUpdate)
                logger.info('自动跳过广告丨所有广告已处理完成，移除事件监听器')
            }
        }
        // 添加事件监听器
        this._adVideo = video
        this._adTimeUpdateHandler = handleTimeUpdate
        video.addEventListener('timeupdate', handleTimeUpdate)
        logger.info('自动跳过广告丨已启动，共检测到', sortedSegments.length, '个广告时间段', sortedSegments)
        // 初始检查，处理当前时间已经在广告时间段内的情况
        handleTimeUpdate()
    }
}
