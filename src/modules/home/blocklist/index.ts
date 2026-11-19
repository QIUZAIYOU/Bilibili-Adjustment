/**
 * UP 主黑名单功能入口（默认关闭）
 *
 * 开启后：首页右下角出现屏蔽按钮（打开名单弹窗），首页推荐卡片按名单昵称隐藏。
 * 关闭/卸载时移除按钮、关闭弹窗、恢复被隐藏的卡片。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { LoggerService } from '@/services/logger.service'
import { addEventListenerToElement } from '@/utils/common'
import { retryQueue } from '@/utils/retry-queue'
import { listBlockedUps } from './store'
import { createBlockedCardFilter } from './filter'
import { createBlocklistPanel } from './panel'
import type { CardFilterHandle } from './filter'
import type { BlocklistPanelHandle } from './panel'
const logger = new LoggerService('UpBlocklist', { notify: false })
const BUTTON_CLASS = 'adj-palette-blocklist-btn'
const SHIELD_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-2.9 8.3-7 9.8C7.9 19.3 5 15.4 5 11V6l7-3z"/><path d="M9.5 12.5l1.7 1.7 3.5-3.5"/></svg>'
export interface UpBlocklistContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _upBlocklistFilter?: CardFilterHandle | null
    _upBlocklistPanel?: BlocklistPanelHandle | null
    _upBlocklistButton?: HTMLElement | null
    initUpBlocklist: () => Promise<void>
    destroyUpBlocklist: () => void
}
/** 插入首页右下角的黑名单入口按钮（幂等） */
const insertBlocklistButton = (onClick: () => void): HTMLElement | null => {
    const wrap = elementSelectors.get('homePaletteButtonWrap')
    if (!wrap) return null
    const existing = wrap.querySelector(`.${BUTTON_CLASS}`)
    if (existing) return existing as HTMLElement
    const button = document.createElement('div')
    button.className = BUTTON_CLASS
    button.title = 'UP 主黑名单'
    button.setAttribute('role', 'button')
    button.setAttribute('tabindex', '0')
    button.setAttribute('aria-label', '打开 UP 主黑名单')
    button.innerHTML = SHIELD_ICON
    wrap.prepend(button)
    addEventListenerToElement(button, 'click', (event: Event) => {
        event.stopPropagation()
        onClick()
    })
    return button
}
export const upBlocklistFeatures = {
    async initUpBlocklist (this: UpBlocklistContext): Promise<void> {
        this.destroyUpBlocklist()
        if (!this.userConfigs.up_blocklist_enabled) return
        if (!elementSelectors.get('homePaletteButtonWrap')) {
            logger.warn('UP 主黑名单丨首页悬浮按钮组未就绪，已加入重试队列')
            retryQueue.register('upBlocklistEntry', async () => {
                if (!elementSelectors.get('homePaletteButtonWrap')) throw new Error('悬浮按钮组仍未就绪')
                await this.initUpBlocklist()
            })
            return
        }
        let names = new Set((await listBlockedUps()).map(up => up.name))
        const filter = createBlockedCardFilter(() => names)
        this._upBlocklistFilter = filter
        const panel = createBlocklistPanel({
            onChange: async () => {
                names = new Set((await listBlockedUps()).map(up => up.name))
                filter.rescan()
            }
        })
        this._upBlocklistPanel = panel
        this._upBlocklistButton = insertBlocklistButton(() => panel.show())
        logger.info('UP 主黑名单丨已启用', `当前 ${names.size} 位`)
    },
    destroyUpBlocklist (this: UpBlocklistContext): void {
        this._upBlocklistFilter?.stop()
        this._upBlocklistFilter = null
        this._upBlocklistPanel?.destroy()
        this._upBlocklistPanel = null
        this._upBlocklistButton?.remove()
        this._upBlocklistButton = null
    }
}
