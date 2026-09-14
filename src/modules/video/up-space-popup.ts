import { LoggerService } from '@/services/logger.service'
import { openAdjustmentDialog } from '@/components/popover-dialog'
const logger = new LoggerService('VideoModule')
const UP_SPACE_POPUP_FLAG = 'bili-adjustment-popup'
// 关闭后保留弹窗的缓存时长：期间再次打开直接复用已加载的 iframe（不重新加载，
// 且保留浏览位置）；超过此时长未再打开才销毁，避免重型空间页 iframe 常驻内存
const UP_SPACE_POPUP_CACHE_MS = 10 * 60 * 1000
let upSpaceFrame: HTMLIFrameElement | null = null
const createUpSpaceFrame = (body: HTMLElement): void => {
    if (!upSpaceFrame) {
        upSpaceFrame = document.createElement('iframe')
        upSpaceFrame.className = 'up-space-popover-frame'
        upSpaceFrame.allowFullscreen = true
        upSpaceFrame.style.cssText = 'width:100%;height:calc(86vh - 150px);border:none;display:block;'
    }
    body.appendChild(upSpaceFrame)
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UpSpacePopupContext {
    userConfigs: Record<string, unknown>
    _upSpaceDialog?: { body: HTMLElement; destroy: () => void } | null
    openUpSpacePopup: (mid: string | number) => Promise<void>
}
export const upSpacePopupFeatures = {
    // 路由：按设置项决定新标签页或弹窗
    async openUpSpace (this: UpSpacePopupContext, mid: string | number): Promise<void> {
        if (!mid) return
        if (this.userConfigs.open_author_space_mode === 'popup') {
            await this.openUpSpacePopup(mid)
        } else {
            window.open(`https://space.bilibili.com/${mid}`, '_blank')
        }
    },
    async openUpSpacePopup (this: UpSpacePopupContext, mid: string | number): Promise<void> {
        if (!mid) return
        const dialog = openAdjustmentDialog({
            key: 'up-space',
            keepAliveMs: UP_SPACE_POPUP_CACHE_MS,
            title: 'UP主空间',
            width: 'min(1100px, 94vw)',
            className: 'up-space-dialog',
            content: createUpSpaceFrame
        })
        this._upSpaceDialog = dialog
        // 标记参数供 iframe 内的脚本识别并隐藏站点头部
        const targetSrc = `https://space.bilibili.com/${mid}?${UP_SPACE_POPUP_FLAG}=1`
        const frame = dialog.body.querySelector('iframe') as HTMLIFrameElement | null
        // 已加载相同地址（缓存复用）则不重设，保留 iframe 浏览位置
        if (frame && frame.src !== targetSrc) frame.src = targetSrc
        logger.debug('UP主空间弹窗丨已打开')
    },
    destroyUpSpacePopup (this: UpSpacePopupContext): void {
        this._upSpaceDialog?.destroy()
        this._upSpaceDialog = null
        upSpaceFrame = null
        logger.debug('UP主空间弹窗丨已销毁')
    }
}
