import { LoggerService } from '@/services/logger.service'
import { getTemplates } from '@/shared/templates'
import { createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
const logger = new LoggerService('VideoModule')
const UP_SPACE_POPUP_FLAG = 'bili-adjustment-popup'
// 关闭后保留弹窗的缓存时长：期间再次打开直接复用已加载的 iframe（不重新加载，
// 且保留浏览位置）；超过此时长未再打开才销毁，避免重型空间页 iframe 常驻内存
const UP_SPACE_POPUP_CACHE_MS = 10 * 60 * 1000
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
            // 关闭后不立即销毁：移除元素会使 iframe 重新加载，改为进入缓存期，
            // 再次打开直接复用；缓存期内未再打开则延迟销毁
            addEventListenerToElement(popup, 'toggle', e => {
                if (e.newState !== 'closed') return
                clearTimeout(this._upSpacePopupDestroyTimer)
                this._upSpacePopupDestroyTimer = setTimeout(() => this.destroyUpSpacePopup(), UP_SPACE_POPUP_CACHE_MS)
            })
            // 点击外部/ESC 关闭；模块卸载时无论弹窗状态如何都完整释放
            this._upSpacePopupDismissCleanup = enablePopoverLightDismiss(popup)
            this._cleanup.push(() => this.destroyUpSpacePopup())
        }
        // 打开即取消缓存期销毁
        clearTimeout(this._upSpacePopupDestroyTimer)
        this._upSpacePopupDestroyTimer = null
        const frame = popup.querySelector('#UpSpacePopoverFrame')
        // 标记参数供 iframe 内的脚本识别并隐藏站点头部
        const targetSrc = `https://space.bilibili.com/${mid}?${UP_SPACE_POPUP_FLAG}=1`
        if (frame.src !== targetSrc) frame.src = targetSrc
        if (!popup.matches(':popover-open')) popup.showPopover()
        logger.debug('UP主空间弹窗丨已打开')
    },
    destroyUpSpacePopup () {
        clearTimeout(this._upSpacePopupDestroyTimer)
        this._upSpacePopupDestroyTimer = null
        this._upSpacePopupDismissCleanup?.()
        this._upSpacePopupDismissCleanup = null
        document.getElementById('UpSpacePopover')?.remove()
        logger.debug('UP主空间弹窗丨已销毁')
    }
}
