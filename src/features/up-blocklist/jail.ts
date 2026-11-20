/**
 * 空间页「监狱门」遮罩
 *
 * 命中黑名单的 UP 空间：先把页面内容整体隐藏，再盖一层铺满视口的铁门遮罩，
 * 中间是铆钉铭牌与「临时查看」。临时查看写 sessionStorage（默认 30 分钟），
 * 期间刷新/站内跳转都不再上锁；彻底解除去设置里的黑名单移除。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { regexps } from '@/shared/regexps'
const UNLOCK_PREFIX = 'adj.jail.unlock.'
export const JAIL_UNLOCK_TTL_MS = 30 * 60 * 1000
/** 当前页面是不是空间页；是则返回 UID，否则空串 */
export const getSpaceUid = (host: string, pathname: string): string => {
    if (!/(^|\.)space\.bilibili\.com$/i.test(host)) return ''
    return pathname.match(regexps.common.spacePageUid)?.[1] || ''
}
const readUnlockExpiry = (uid: string): number => {
    try {
        return Number(sessionStorage.getItem(UNLOCK_PREFIX + uid)) || 0
    } catch {
        return 0
    }
}
export const isJailUnlocked = (uid: string, now = Date.now()): boolean => readUnlockExpiry(uid) > now
export const unlockJail = (uid: string, ttl = JAIL_UNLOCK_TTL_MS): void => {
    try {
        sessionStorage.setItem(UNLOCK_PREFIX + uid, String(Date.now() + ttl))
    } catch { /* 隐私模式下仅本次页面生效：遮罩已经移除 */ }
}
export interface JailHandle {
    destroy: () => void
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}
const LOCK_ICON = '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><circle cx="12" cy="15.4" r="1.4"/><path d="M12 16.8v1.6"/></svg>'
/** 盖上监狱门遮罩；返回的 destroy 用于还原页面 */
export const showJail = (uid: string, onTempView: () => void): JailHandle => {
    const app = elementSelectors.get('spaceAppContent') as HTMLElement | null
    const previousVisibility = app?.style.visibility || ''
    const previousOverflow = document.body.style.overflow
    if (app) app.style.visibility = 'hidden'
    document.body.style.overflow = 'hidden'
    const root = el('div', 'adj-jail')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '该 UP 主已被您拉黑')
    root.dataset.uid = uid
    const door = el('div', 'adj-jail-door')
    door.appendChild(el('div', 'adj-jail-bars'))
    const plate = el('div', 'adj-jail-plate')
    for (const position of ['top:10px;left:10px', 'top:10px;right:10px', 'bottom:10px;left:10px', 'bottom:10px;right:10px']) {
        const bolt = el('span', 'adj-jail-bolt')
        bolt.setAttribute('style', position)
        plate.appendChild(bolt)
    }
    const lock = el('div', 'adj-jail-lock')
    lock.innerHTML = LOCK_ICON
    plate.appendChild(lock)
    plate.appendChild(el('p', 'adj-jail-title', '该 UP 主已被您拉黑'))
    plate.appendChild(el('p', 'adj-jail-desc', '这个空间已上锁'))
    const temp = el('button', 'adj-jail-temp', '临时查看')
    temp.type = 'button'
    temp.addEventListener('click', () => {
        unlockJail(uid)
        onTempView()
    })
    plate.appendChild(temp)
    plate.appendChild(el('p', 'adj-jail-hint', '临时解锁 30 分钟；想彻底解除，请到设置 → 黑名单里移除'))
    door.appendChild(plate)
    root.appendChild(door)
    document.body.appendChild(root)
    temp.focus()
    return {
        destroy: (): void => {
            root.remove()
            if (app) app.style.visibility = previousVisibility
            document.body.style.overflow = previousOverflow
        }
    }
}
