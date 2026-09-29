/**
 * 通用加载态模板（iframe 弹窗用）
 *
 * 结构 = 骨架屏（整体扫光）+ 居中转圈与文案；样式在 `shared/styles/index.js` 的「通用加载态」一节
 * （`.adj-loading-*`），随全局样式在任意页面可用。
 *
 * 用法：作为 iframe 容器（需 `position: relative`）的**最后一个子元素**插入；内容就绪后加
 * `LOADING_OVERLAY_HIDDEN_CLASS`（**从本模块导入常量，别写字面量** —— 2026-09-25 就因为两个文件里
 * 各写一份类名，重命名后预览弹窗的遮罩永远揭不开）揭开；文案用填充钩子 `data-adj-field="text"` 标出，
 * 调用点 `queryTemplateTextField(el).textContent = '视频加载中'` 填（不填就用模板里的默认文案）。
 *
 * - `loadingOverlay`：播放器版式（一块「画面」+ 一条「底部控制条」）—— 首页视频预览用
 * - `loadingOverlaySpace`：空间页版式（头图残段 + 头像信息行 + 导航条 + 卡片网格）—— UP 主空间弹窗用。
 *   尺寸按**弹窗里处理过**的版式来（不是空间页原版）：站点头部隐藏、`#app` 上移 107px，
 *   于是原版 200px 的头图只露出下沿 93px，信息行 73px 压在其下沿，导航条 64px 紧接，
 *   内容与导航条隔 30px、左右留白 60px、卡片 5 列
 */
export const LOADING_OVERLAY_HIDDEN_CLASS = 'adj-loading-overlay-hidden'
export const loadingTemplates = {
    loadingOverlay: '<div class="adj-loading-overlay" role="status" bilibili-adjustment-element><div class="adj-loading-skeleton" aria-hidden="true"><div class="adj-loading-skeleton-screen"></div><div class="adj-loading-skeleton-bar"></div></div><div class="adj-loading-status"><div class="adj-loading-spinner" aria-hidden="true"></div><span data-adj-field="text">加载中</span></div></div>',
    loadingOverlaySpace: '<div class="adj-loading-overlay" role="status" bilibili-adjustment-element><div class="adj-loading-space" aria-hidden="true"><div class="adj-loading-space-banner"></div><div class="adj-loading-space-info"><span class="adj-loading-space-avatar"></span><span class="adj-loading-space-line adj-loading-space-line-name"></span><span class="adj-loading-space-line adj-loading-space-line-sub"></span></div><div class="adj-loading-space-nav"><span></span><span></span><span></span><span></span><span></span></div><div class="adj-loading-space-grid"><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span><span class="adj-loading-space-card"></span></div></div><div class="adj-loading-status"><div class="adj-loading-spinner" aria-hidden="true"></div><span data-adj-field="text">加载中</span></div></div>'
}
