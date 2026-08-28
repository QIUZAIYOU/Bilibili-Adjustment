import { LoggerService } from '@/services/logger.service'
import { getTemplates } from '@/shared/templates'
import { createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
const logger = new LoggerService('VideoModule')
const UP_SPACE_POPUP_FLAG = 'bili-adjustment-popup'
export const upSpacePopupFeatures = {
    // 路由：按设置项决定新标签页或弹窗
    async openUpSpace (mid) {
        if (!mid) return
        if (this.userConfigs.open_author_space_mode === 'popup') {
            await this.openUpSpacePopup(mid)
        } else {
            window.open(`https://space.bilibili.com/${mid}`, '_blank')
        }
    },
    async openUpSpacePopup (mid) {
        if (!mid) return
        let popup = document.getElementById('UpSpacePopover')
        if (!popup) {
            popup = createElementAndInsert(getTemplates.upSpacePopup, document.body)
            addEventListenerToElement(popup.querySelector('#UpSpacePopoverCloseButton'), 'click', () => popup.hidePopover())
            // 关闭时整个移除弹窗：display:none 只是隐藏，popup 元素仍留在 DOM 中，
            // iframe 内的空间页也继续存活；移除元素并释放 light-dismiss 的
            // document 级监听器，下次打开时整体重建
            addEventListenerToElement(popup, 'toggle', e => {
                if (e.newState === 'closed') {
                    this._upSpacePopupDismissCleanup?.()
                    this._upSpacePopupDismissCleanup = null
                    popup.remove()
                }
            })
            // 点击外部/ESC 关闭；模块卸载时若弹窗仍开着，由 uninstall 释放监听器
            this._upSpacePopupDismissCleanup = enablePopoverLightDismiss(popup)
        }
        const frame = popup.querySelector('#UpSpacePopoverFrame')
        // 标记参数供 iframe 内的脚本识别并隐藏站点头部
        const targetSrc = `https://space.bilibili.com/${mid}?${UP_SPACE_POPUP_FLAG}=1`
        if (frame.src !== targetSrc) frame.src = targetSrc
        if (!popup.matches(':popover-open')) popup.showPopover()
        logger.debug('UP主空间弹窗丨已打开')
    }
}
