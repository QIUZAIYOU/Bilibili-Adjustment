/**
 * 首页卡片按黑名单昵称过滤
 *
 * 为什么按昵称：B 站首页卡片 DOM 里没有 UID（也没有 bvid），只有作者昵称文本；
 * 名单仍以 UID 为主键存储，昵称在添加时由名片接口写入，过滤只做「昵称 → 隐藏」。
 * 昵称匹配是精确匹配（含空格），不会命中「名字里包含」的误伤。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('UpBlocklist', { notify: false })
const HIDDEN_ATTR = 'data-adj-blocklist-hidden'
const SCAN_DELAY = 200
export interface CardFilterHandle {
    rescan: () => void
    stop: () => void
}
/** 读取卡片上的作者昵称：title 属性最完整，退化为文本 */
const readAuthorName = (card: Element, selector: string): string => {
    if (!selector) return ''
    const author = card.querySelector(selector)
    if (!(author instanceof HTMLElement)) return ''
    return (author.getAttribute('title') || author.textContent || '').trim()
}
/**
 * 卡片的外层网格占位：B 站首页是 `.feed-card`（推荐格）/ `.bili-feed-card`（信息流）
 * 包着 `.bili-video-card`，只藏内层会留下一个空格子，所以优先藏外层。
 */
const resolveHideTarget = (card: Element, wrapperSelector: string): Element => {
    if (!wrapperSelector) return card
    const wrapper = card.closest(wrapperSelector)
    return wrapper && wrapper !== card ? wrapper : card
}
const setHidden = (target: Element, hidden: boolean): void => {
    const element = target as HTMLElement
    if (hidden) {
        if (element.hasAttribute(HIDDEN_ATTR)) return
        element.setAttribute(HIDDEN_ATTR, '1')
        element.style.display = 'none'
        return
    }
    if (!element.hasAttribute(HIDDEN_ATTR)) return
    element.removeAttribute(HIDDEN_ATTR)
    element.style.display = ''
}
export const createBlockedCardFilter = (getNames: () => Set<string>): CardFilterHandle => {
    let observer: MutationObserver | null = null
    let timer: number | null = null
    let stopped = false
    const scan = (): void => {
        if (stopped) return
        const names = getNames()
        const authorSelector = elementSelectors.CSS('homeNativeCardAuthor') as string
        const wrapperSelector = elementSelectors.CSS('homeFeedNativeCardWrapper') as string
        let hidden = 0
        for (const card of elementSelectors.queryAll('homeFeedNativeCard')) {
            const name = readAuthorName(card, authorSelector)
            const shouldHide = Boolean(name) && names.has(name)
            if (shouldHide) hidden += 1
            setHidden(resolveHideTarget(card, wrapperSelector), shouldHide)
        }
        if (hidden > 0) logger.debug(`UP 主黑名单丨已隐藏 ${hidden} 张卡片`)
    }
    const schedule = (): void => {
        if (stopped || timer !== null) return
        timer = window.setTimeout(() => {
            timer = null
            scan()
        }, SCAN_DELAY)
    }
    scan()
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    logger.info('UP 主黑名单丨首页过滤已启用')
    return {
        rescan: scan,
        stop: (): void => {
            stopped = true
            if (timer !== null) window.clearTimeout(timer)
            observer?.disconnect()
            observer = null
            for (const card of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
                card.removeAttribute(HIDDEN_ATTR)
                ;(card as HTMLElement).style.display = ''
            }
            logger.info('UP 主黑名单丨首页过滤已关闭')
        }
    }
}
