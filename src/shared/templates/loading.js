/**
 * 通用加载态模板（iframe 弹窗用）
 *
 * 结构 = 仿「画面 + 底部控制条」的骨架屏（整体扫光）+ 居中转圈与文案；样式在
 * `shared/styles/index.js` 的「通用加载态」一节（`.adj-loading-*`），随全局样式在任意页面可用。
 *
 * 用法：作为 iframe 容器（需 `position: relative`）的**最后一个子元素**插入，内容就绪后给它加
 * `adj-loading-overlay-hidden` 揭开。首页视频预览与 UP 主空间弹窗共用这一份。
 */
export const loadingTemplates = {
    loadingOverlay: '<div class="adj-loading-overlay" role="status" bilibili-adjustment-element><div class="adj-loading-skeleton" aria-hidden="true"><div class="adj-loading-skeleton-screen"></div><div class="adj-loading-skeleton-bar"></div></div><div class="adj-loading-status"><div class="adj-loading-spinner" aria-hidden="true"></div><span>[[TEXT]]</span></div></div>'
}
