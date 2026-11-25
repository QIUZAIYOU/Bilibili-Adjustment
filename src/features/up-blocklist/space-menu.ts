/**
 * UP 主空间页原生菜单里的「加入黑名单（脚本）」
 *
 * B 站空间页的「⋯」菜单结构：`.menu-popover__panel` 里依次是「加入黑名单」「举报」。
 * 我们在官方「加入黑名单」上方插一项，点击写入脚本黑名单（可选同步官方拉黑）。
 *
 * 只跑在 `space.bilibili.com`：空间弹窗是跨源 iframe，父页面碰不到其 DOM，
 * 但用户脚本同样注入 iframe 文档，因此在 iframe 里也能正常注入。
 */
import { ConfigService } from '@/services/config.service'
import { LoggerService } from '@/services/logger.service'
import { regexps } from '@/shared/regexps'
import { addBlockedUpByUid } from './store'
import { SPACE_BLOCK_ATTR, injectSpaceBlockItem as injectItem } from './space-menu-pure'
const logger = new LoggerService('UpBlocklist', { notify: false })
const PANEL_SELECTOR = '.menu-popover__panel'
const OUR_ATTR = SPACE_BLOCK_ATTR
let observer: MutationObserver | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null
/** 从空间页路径取 UID（/123/、/123/video 都命中） */
const readSpaceUid = (): string => {
    const matched = location.pathname.match(regexps.common.spacePageUid)
    return matched?.[1] || ''
}
const handleClick = (item: HTMLElement, uid: string): void => {
    if (item.dataset.busy === '1') return
    const original = '加入黑名单（脚本）'
    item.dataset.busy = '1'
    item.textContent = '添加中…'
    void (async () => {
        try {
            const syncOfficial = Boolean(await ConfigService.getValue('up_blocklist_official_sync'))
            const result = await addBlockedUpByUid(uid, { syncOfficial })
            item.textContent = result.ok ? '已加入黑名单' : result.message
            window.setTimeout(() => {
                item.textContent = original
                delete item.dataset.busy
            }, result.ok ? 1500 : 2400)
        } catch (error) {
            logger.warn('空间菜单丨加入黑名单失败', error instanceof Error ? error.message : error)
            item.textContent = '添加失败'
            window.setTimeout(() => {
                item.textContent = original
                delete item.dataset.busy
            }, 2000)
        }
    })()
}
const scan = (): void => {
    const uid = readSpaceUid()
    if (!uid) return
    document.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
        injectItem(panel as HTMLElement, uid, targetUid => {
            const item = panel.querySelector(`[${OUR_ATTR}]`) as HTMLElement | null
            if (item) handleClick(item, targetUid)
        })
    })
}
const scheduleScan = (): void => {
    if (scanTimer) return
    scanTimer = window.setTimeout(() => {
        scanTimer = null
        scan()
    }, 80)
}
/** 启动菜单注入（幂等）；只应在 space.bilibili.com 调用 */
export const initSpaceMenuFeature = (): void => {
    if (observer) return
    scan()
    observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, { childList: true, subtree: true })
    logger.debug('空间菜单丨快捷拉黑已启用')
}
export const destroySpaceMenuFeature = (): void => {
    observer?.disconnect()
    observer = null
    if (scanTimer) {
        clearTimeout(scanTimer)
        scanTimer = null
    }
    document.querySelectorAll(`[${OUR_ATTR}]`).forEach(item => item.remove())
}
