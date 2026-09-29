import { LoggerService } from '@/services/logger.service'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { getTemplates } from '@/shared/templates'
import { LOADING_OVERLAY_HIDDEN_CLASS } from '@/shared/templates/loading'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { UP_SPACE_POPUP_FLAG } from '@/shared/constants'
import { createElementAndInsert } from '@/utils/common'
const logger = new LoggerService('VideoModule')
// 关闭后保留弹窗的缓存时长：期间再次打开直接复用已加载的 iframe（不重新加载，
// 且保留浏览位置）；超过此时长未再打开才销毁，避免重型空间页 iframe 常驻内存
const UP_SPACE_POPUP_CACHE_MS = 10 * 60 * 1000
/** 空间页地址模板里的 `[[MID]]` 占位符（URL 模板是占位符的合法用途） */
const UP_SPACE_URL_MID = '[[MID]]'
let upSpaceFrame: HTMLIFrameElement | null = null
let upSpaceLoading: HTMLElement | null = null
let upSpaceDialog: { body: HTMLElement, destroy: () => void } | null = null
/** 空间页地址（模板来自注册表，可热更；`forPopup` 时带上识别参数供 iframe 内的脚本应用弹窗样式） */
const buildUpSpaceUrl = (mid: string | number, forPopup = false): string => {
    const base = String(getTemplates.upSpaceUrl).replaceAll(UP_SPACE_URL_MID, encodeURIComponent(String(mid)))
    return forPopup ? `${base}?${UP_SPACE_POPUP_FLAG}=1` : base
}
const createUpSpaceFrame = (body: HTMLElement): void => {
    if (!upSpaceFrame) {
        upSpaceFrame = document.createElement('iframe')
        upSpaceFrame.className = 'up-space-popover-frame'
        upSpaceFrame.allowFullscreen = true
        upSpaceFrame.style.cssText = 'width:100%;height:calc(86vh - 150px);border:none;display:block;'
    }
    body.appendChild(upSpaceFrame)
    if (!upSpaceLoading) {
        // 骨架屏盖在 iframe 上（容器 position 由 .up-space-dialog 的样式给定），load 事件后揭开；
        // 结构按**弹窗里处理过**的空间页版式来做（见 templates/loading.js 的 loadingOverlaySpace）
        upSpaceLoading = createElementAndInsert(getTemplates.loadingOverlaySpace, body) as HTMLElement | null
        const loadingTextField = queryTemplateTextField(upSpaceLoading)
        if (loadingTextField) loadingTextField.textContent = '空间加载中'
    } else {
        body.appendChild(upSpaceLoading)
    }
}
/** 监听 iframe 首次加载完成 → 揭开骨架屏（幂等：只在换地址时重新挂一次） */
const watchUpSpaceFrame = (frame: HTMLIFrameElement): void => {
    if ((frame as HTMLIFrameElement & { _adjLoadBound?: boolean })._adjLoadBound) return
    ;(frame as HTMLIFrameElement & { _adjLoadBound?: boolean })._adjLoadBound = true
    frame.addEventListener('load', () => {
        upSpaceLoading?.classList.add(LOADING_OVERLAY_HIDDEN_CLASS)
        logger.debug('UP主空间弹窗丨空间页已加载')
    })
}
/** 弹出 UP 主空间弹窗（同 key 单例 + keepAlive：缓存期内再开直接复用已加载的 iframe） */
const showUpSpacePopup = (mid: string | number): void => {
    if (!mid) return
    const dialog = openAdjustmentDialog({
        key: 'up-space',
        keepAliveMs: UP_SPACE_POPUP_CACHE_MS,
        title: 'UP主空间',
        width: 'min(1100px, 94vw)',
        className: 'up-space-dialog',
        content: createUpSpaceFrame
    })
    upSpaceDialog = dialog
    const targetSrc = buildUpSpaceUrl(mid, true)
    const frame = dialog.body.querySelector('iframe') as HTMLIFrameElement | null
    // 已加载相同地址（缓存复用）则不重设，保留 iframe 浏览位置
    if (frame && frame.src !== targetSrc) {
        // 空间页是**跨源** iframe：父页面既读不到它的文档、也等不到"内容渲染完成"，只能用它自己的 load 事件
        watchUpSpaceFrame(frame)
        upSpaceLoading?.classList.remove(LOADING_OVERLAY_HIDDEN_CLASS)
        frame.src = targetSrc
    }
    logger.debug('UP主空间弹窗丨已打开')
}
/**
 * 打开 UP 主空间的统一入口：按用户设置决定「弹窗」还是「新标签页」。
 * 播放页侧栏的 UP 按钮与首页预览弹窗头部的按钮共用（预览那侧据此决定要不要关掉预览）。
 * @returns 是否成功打开（新标签页被浏览器拦截时返回 false）
 */
export const openUpSpaceForMid = async (mid: string | number | null | undefined, mode: unknown): Promise<boolean> => {
    if (!mid) return false
    if (mode === 'popup') {
        showUpSpacePopup(mid)
        return true
    }
    return !!window.open(buildUpSpaceUrl(mid), '_blank')
}
/** 销毁空间弹窗并清掉缓存引用（换页等场景由 video.module 调用） */
export const destroyUpSpacePopup = (): void => {
    upSpaceDialog?.destroy()
    upSpaceDialog = null
    upSpaceFrame = null
    upSpaceLoading = null
    logger.debug('UP主空间弹窗丨已销毁')
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UpSpacePopupContext {
    userConfigs: Record<string, unknown>
    openUpSpacePopup: (mid: string | number) => Promise<void>
    watchUpSpaceFrame: (frame: HTMLIFrameElement) => void
}
export const upSpacePopupFeatures = {
    // 路由：按设置项决定新标签页或弹窗
    async openUpSpace (this: UpSpacePopupContext, mid: string | number): Promise<void> {
        await openUpSpaceForMid(mid, this.userConfigs.open_author_space_mode)
    },
    /** 直接开弹窗（忽略设置项），保留给需要强制弹窗的调用点 */
    async openUpSpacePopup (this: UpSpacePopupContext, mid: string | number): Promise<void> {
        showUpSpacePopup(mid)
    },
    watchUpSpaceFrame,
    destroyUpSpacePopup
}
