/**
 * 全站视频卡片按黑名单过滤
 *
 * 匹配优先级：卡片里的 UP 空间链接（能拿到精确 UID）→ 作者昵称（拿不到 UID 的卡片兜底）。
 * 首页是网格布局，隐藏时要连外层格子一起藏；其它页面没有这层包装，隐藏卡片本身即可。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { regexps } from '@/shared/regexps'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('UpBlocklist', { notify: false })
const HIDDEN_ATTR = 'data-adj-blocklist-hidden'
const SCAN_DELAY = 200
export interface BlockedLookup {
    uids: Set<string>
    names: Set<string>
}
export interface CardFilterHandle {
    rescan: () => void
    stop: () => void
}
/** 从卡片里的空间链接取 UID；没有链接返回空串 */
const readUid = (card: Element, selector: string): string => {
    if (!selector) return ''
    const link = card.querySelector(selector)
    const href = link?.getAttribute('href') || ''
    return href.match(regexps.common.spaceUid)?.[1] || ''
}
/** 读取卡片上的作者昵称：title 属性最完整，退化为文本 */
const readAuthorName = (card: Element, selector: string): string => {
    if (!selector) return ''
    for (const author of card.querySelectorAll(selector)) {
        if (!(author instanceof HTMLElement)) continue
        const name = (author.getAttribute('title') || author.textContent || '').trim()
        if (name) return name
    }
    return ''
}
/** 隐藏目标：首页优先连外层网格格子一起藏，其它页面退回卡片本身 */
const resolveHideTarget = (card: Element): Element => {
    const outer = elementSelectors.CSS('homeFeedNativeCardWrapper') as string
    if (outer) {
        const wrapper = card.closest(outer)
        if (wrapper && wrapper !== card) return wrapper
    }
    const inner = elementSelectors.CSS('homeFeedNativeCardWrapperInner') as string
    if (inner) {
        const wrapper = card.closest(inner)
        if (wrapper && wrapper !== card) return wrapper
    }
    return card
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
export const createBlockedCardFilter = (getBlocked: () => BlockedLookup): CardFilterHandle => {
    let observer: MutationObserver | null = null
    let timer: number | null = null
    let stopped = false
    const scan = (): void => {
        if (stopped) return
        const { uids, names } = getBlocked()
        const uidSelector = elementSelectors.CSS('videoCardUidLink') as string
        const authorSelector = elementSelectors.CSS('videoCardAuthorAny') as string
        let hidden = 0
        for (const card of elementSelectors.queryAll('videoCardContainer')) {
            const uid = readUid(card, uidSelector)
            const name = readAuthorName(card, authorSelector)
            const shouldHide = (uid && uids.has(uid)) || (!uid && name && names.has(name))
            const target = resolveHideTarget(card)
            if (shouldHide) {
                hidden += 1
                setHidden(target, true)
            } else if (target.hasAttribute(HIDDEN_ATTR)) {
                setHidden(target, false)
            }
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
    logger.info('UP 主黑名单丨全站过滤已启用')
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
            logger.info('UP 主黑名单丨全站过滤已关闭')
        }
    }
}
