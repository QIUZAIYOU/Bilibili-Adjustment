/**
 * 更新通知面板懒加载桥（只能被动态 import！）
 *
 * 与 src/ui/settings/lazy-panel.js、src/ui/home/lazy-panel.js 同样两个理由：
 * 1) **Vue API 必须与组件同源**：产物按 chunk 分别压缩，`import('vue')` 与 SFC 依赖的
 *    runtime-core/runtime-dom 是两份运行时实例，混用会导致响应式与事件不互通；
 * 2) 命名导出是 SystemJS 下的可靠通道（不依赖动态导入模块的 default 形状）。
 *
 * ⚠️ 禁止被静态 import（否则 Vue 与 SFC 会进首屏关键路径）。
 */
import UpdateNoticePanel from './UpdateNoticePanel.vue'
import { createApp, reactive, markRaw } from 'vue'
export const UpdateNoticePanelComponent = UpdateNoticePanel
export { createApp, reactive, markRaw }
