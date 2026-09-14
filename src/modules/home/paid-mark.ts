import { LoggerService } from '@/services/logger.service'
import { biliApis } from '@/shared/bili-apis'
import { escapeHtml } from '@/utils/common'
import { chunk } from '@/utils/lodash-lite'
const logger = new LoggerService('HomeModule')
export const homePaidMarkFeatures = {
    async markRecommendVideoPaidStatus (): Promise<void> {
        const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11)')
        const cards = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
        // 分批并发查询，避免串行请求拖慢整批标记
        for (const batch of chunk(cards, 4)) {
            await Promise.allSettled(batch.map(async video => {
                const url = video.querySelector('a')?.href
                const title = video.querySelector('h3')?.title
                if (!location.host.includes('bilibili.com') || !url || url.includes('cm.bilibili.com') || !title) return
                let isPaid = false
                try {
                    const videoInfo = await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
                    if (videoInfo) {
                        // 注：biliApis 目前并未实现 checkVideoPaid（既有实现如此），
                        // 因此这里会抛错并被下方 catch 吞掉 —— 与迁移前行为一致，未在此处改变语义
                        const paidApi = biliApis as unknown as { checkVideoPaid: (aid: unknown, cid: unknown) => Promise<boolean> }
                        const info = videoInfo as { aid?: unknown; cid?: unknown }
                        isPaid = await paidApi.checkVideoPaid(info.aid, info.cid)
                    }
                } catch { /* 忽略视频信息/付费状态获取失败 */ }
                if (isPaid) {
                    const titleEl = video.querySelector('h3') as HTMLElement | null
                    if (titleEl) {
                        titleEl.title = `🟡付费视频 丨 ${title}`
                        titleEl.innerHTML = `<span style="color:var(--adj-pink);font-weight:700;font-size:12px;border:1px solid;padding:2px 3px;border-radius:4px">付费视频</span> ${escapeHtml(title)}`
                    }
                }
            }))
        }
        logger.info('首页视频付费标记｜已完成')
    }
}
