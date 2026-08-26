/* global _ */
import { LoggerService } from '@/services/logger.service'
import { biliApis } from '@/shared/bili-apis'
import { escapeHtml } from '@/utils/common'
const logger = new LoggerService('HomeModule')
export const homePaidMarkFeatures = {
    async markRecommendVideoPaidStatus () {
        const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11)')
        const cards = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
        // 分批并发查询，避免串行请求拖慢整批标记
        for (const batch of _.chunk(cards, 4)) {
            await Promise.allSettled(batch.map(async video => {
                const url = video.querySelector('a')?.href
                const title = video.querySelector('h3')?.title
                if (!location.host.includes('bilibili.com') || !url || url.includes('cm.bilibili.com') || !title) return
                let isPaid = false
                try {
                    const videoInfo = await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
                    if (videoInfo) {
                        isPaid = await biliApis.checkVideoPaid(videoInfo.aid, videoInfo.cid)
                    }
                } catch { /* 忽略视频信息/付费状态获取失败 */ }
                if (isPaid) {
                    const titleEl = video.querySelector('h3')
                    if (titleEl) {
                        titleEl.title = `🟡付费视频 丨 ${title}`
                        titleEl.innerHTML = `<span style="color:#fb7299;font-weight:700;font-size:12px;border:1px solid;padding:2px 3px;border-radius:4px">付费视频</span> ${escapeHtml(title)}`
                    }
                }
            }))
        }
        logger.info('首页视频付费标记｜已完成')
    }
}
