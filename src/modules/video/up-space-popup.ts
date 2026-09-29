import { LoggerService } from '@/services/logger.service'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { getTemplates } from '@/shared/templates'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { UP_SPACE_POPUP_FLAG } from '@/shared/constants'
import { createElementAndInsert } from '@/utils/common'
const logger = new LoggerService('VideoModule')
// 关闭后保留弹窗的缓存时长：期间再次打开直接复用已加载的 iframe（不重新加载，
// 且保留浏览位置）；超过此时长未再打开才销毁，避免重型空间页 iframe 常驻内存
const UP_SPACE_POPUP_CACHE_MS = 10 * 60 * 1000
let upSpaceFrame: HTMLIFrameElement | null = null
let upSpaceLoading: HTMLElement | null = null
const createUpSpaceFrame = (body: HTMLElement): void => {
    if (!upSpaceFrame) {
        upSpaceFrame = document.createElement('iframe')
        upSpaceFrame.className = 'up-space-popover-frame'
        upSpaceFrame.allowFullscreen = true
        upSpaceFrame.style.cssText = 'width:100%;height:calc(86vh - 150px);border:none;display:block;'
    }
    body.appendChild(upSpaceFrame)
    if (!upSpaceLoading) {
        // 骨架屏盖在 iframe 上（容器 position 由 .up-space-dialog 的样式给定），load 事件后揭开
        upSpaceLoading = createElementAndInsert(getTemplates.loadingOverlay, body) as HTMLElement | null
        const loadingTextField = queryTemplateTextField(upSpaceLoading)
        if (loadingTextField) loadingTextField.textContent = '空间加载中'
    } else {
        body.appendChild(upSpaceLoading)
    }
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UpSpacePopupContext {
    userConfigs: Record<string, unknown>
    _upSpaceDialog?: { body: HTMLElement; destroy: () => void } | null
    openUpSpacePopup: (mid: string | number) => Promise<void>
    watchUpSpaceFrame: (frame: HTMLIFrameElement) => void
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
        // 标记参数供 iframe 内的脚本识别：应用弹窗专用样式（隐藏站点头部、内容区顶上去铺满）
        const targetSrc = `https://space.bilibili.com/${mid}?${UP_SPACE_POPUP_FLAG}=1`
        const frame = dialog.body.querySelector('iframe') as HTMLIFrameElement | null
        // 已加载相同地址（缓存复用）则不重设，保留 iframe 浏览位置
        if (frame && frame.src !== targetSrc) {
            // 空间页是**跨源** iframe：父页面既读不到它的文档、也等不到"内容渲染完成"，只能用它自己的 load 事件
            this.watchUpSpaceFrame(frame)
            upSpaceLoading?.classList.remove('adj-loading-overlay-hidden')
            frame.src = targetSrc
        }
        logger.debug('UP主空间弹窗丨已打开')
    },
    /** 监听 iframe 首次加载完成 → 揭开骨架屏（幂等：只在换地址时重新挂一次） */
    watchUpSpaceFrame (frame: HTMLIFrameElement): void {
        if ((frame as HTMLIFrameElement & { _adjLoadBound?: boolean })._adjLoadBound) return
        ;(frame as HTMLIFrameElement & { _adjLoadBound?: boolean })._adjLoadBound = true
        frame.addEventListener('load', () => {
            upSpaceLoading?.classList.add('adj-loading-overlay-hidden')
            logger.debug('UP主空间弹窗丨空间页已加载')
        })
    },
    destroyUpSpacePopup (this: UpSpacePopupContext): void {
        this._upSpaceDialog?.destroy()
        this._upSpaceDialog = null
        upSpaceFrame = null
        upSpaceLoading = null
        logger.debug('UP主空间弹窗丨已销毁')
    }
}
