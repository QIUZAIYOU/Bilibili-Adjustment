/**
 * filter 模式：保留 B 站原生布局，只隐藏广告卡与黑名单 UP 的卡
 *
 * 原生卡片没有 data-*、也没有 <a>，拿不到 bvid/uid；广告卡可靠外链识别，
 * 黑名单只能「标题 → UP」映射做尽力而为（拿不到就放行，绝不误杀）。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { LoggerService } from '@/services/logger.service'
import { fetchFeedPage } from './api'
const logger = new LoggerService('HomeFeed', { notify: false })
const HIDDEN_ATTR = 'data-adj-home-feed-hidden'
const SCAN_DELAY = 200
export interface AdFilterHandle {
    stop: () => void
}
/** 原生卡片隐藏/恢复（只动我们自己加过的标记） */
const hideCard = (card: Element): void => {
    if (card.hasAttribute(HIDDEN_ATTR)) return
    card.setAttribute(HIDDEN_ATTR, '1')
    ;(card as HTMLElement).style.display = 'none'
}
export const createAdFilter = (blocked: Set<string>): AdFilterHandle => {
    let observer: MutationObserver | null = null
    let timer: number | null = null
    let stopped = false
    const titleToUid = new Map<string, string>()
    /** 拉两页推荐建「标题 → UP」映射；只在配置了黑名单时跑一次，失败不影响去广告 */
    const loadTitleMap = async (): Promise<void> => {
        if (!blocked.size) return
        try {
            const pages = await Promise.all([fetchFeedPage(1), fetchFeedPage(2)])
            for (const item of pages.flat()) {
                if (item.title && item.owner.mid) titleToUid.set(item.title, item.owner.mid)
            }
        } catch (error) {
            logger.debug('首页视频区丨过滤模式黑名单映射失败（本轮放行）', error)
        }
    }
    const scan = (): void => {
        if (stopped) return
        const adSelector = elementSelectors.CSS('homeFeedNativeAdLink') as string
        const titleSelector = elementSelectors.CSS('indexRecommendCardTitle') as string
        for (const card of elementSelectors.queryAll('homeFeedNativeCard')) {
            if (card.hasAttribute(HIDDEN_ATTR)) continue
            let hide = Boolean(adSelector && card.querySelector(adSelector))
            if (!hide && blocked.size) {
                const title = (card.querySelector(titleSelector) as HTMLElement | null)?.textContent?.trim()
                    || (card.querySelector(titleSelector) as HTMLElement | null)?.title
                const uid = title ? titleToUid.get(title) : ''
                if (uid && blocked.has(uid)) hide = true
            }
            if (hide) hideCard(card)
        }
    }
    const schedule = (): void => {
        if (stopped || timer !== null) return
        timer = window.setTimeout(() => {
            timer = null
            scan()
        }, SCAN_DELAY)
    }
    const start = async (): Promise<void> => {
        // 先去广告（不等网络），再补黑名单映射并重扫一次
        scan()
        observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true })
        logger.info('首页视频区丨过滤模式已启用')
        await loadTitleMap()
        scan()
    }
    void start()
    return {
        stop: (): void => {
            stopped = true
            if (timer !== null) window.clearTimeout(timer)
            observer?.disconnect()
            observer = null
            for (const card of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
                card.removeAttribute(HIDDEN_ATTR)
                ;(card as HTMLElement).style.display = ''
            }
            logger.info('首页视频区丨过滤模式已关闭')
        }
    }
}
