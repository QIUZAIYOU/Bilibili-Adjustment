/**
 * 「预览 iframe」标记
 *
 * 首页视频预览把**视频播放页整页**塞进 iframe，而脚本本身也匹配 `/video/` —— 油猴默认会在子框架里同样注入，
 * 于是视频模块的"页面级自动化"会在预览窗口里跑起来。最典型的是「屏幕模式」：它会把播放器改成用户设置的
 * 默认模式（宽屏/网页全屏），**一改就退出预览自己设定的网页全屏**（2026-09-25 实测：进网页全屏约 4 秒后
 * 被切成宽屏，并且 3 分钟内反复重试）。
 *
 * 因此父页面在预览 iframe 上打这个标记，子框架里的脚本据此跳过这类自动化。
 * 判据走 `window.frameElement`（预览与播放页同源才能读到；跨源一律视为"不在预览里"）。
 */
export const PREVIEW_FRAME_ATTR = 'data-adj-preview'
/**
 * 纯判据：给定元素是不是预览 iframe（便于单测；不依赖真实 DOM）
 * @param el 候选元素（`window.frameElement` 或任意对象）
 */
export const isPreviewFrameElement = (el: { hasAttribute?: (name: string) => boolean } | null | undefined): boolean => {
    if (!el || typeof el.hasAttribute !== 'function') return false
    return el.hasAttribute(PREVIEW_FRAME_ATTR) === true
}
/** 当前文档是否跑在首页预览的 iframe 里 */
export const isInsidePreviewFrame = (): boolean => {
    try {
        return isPreviewFrameElement(window.frameElement)
    } catch {
        // 跨源时读 frameElement 会抛错：那本来就不可能是我们的预览
        return false
    }
}
