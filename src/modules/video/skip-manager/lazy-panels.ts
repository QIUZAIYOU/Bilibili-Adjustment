/**
 * 跳过片段管理面板「懒加载桥」（只能被动态 import！）
 *
 * 为什么需要它：
 * 1) **Vue API 必须与组件同源**：产物按 chunk 分别压缩，`import('vue')` 与 SFC 依赖的
 *    `runtime-core`/`runtime-dom` 是**两个 Vue 运行时实例**，会导致响应式与事件系统不互通
 *    （宿主改配置面板不刷新、面板内 change 不触发）。故这里与两个面板一起导出 createApp。
 * 2) 命名导出是 SystemJS 下的可靠通道（避免依赖动态导入模块的 default 形状）。
 *
 * ⚠️ 本模块禁止被静态 import（否则 Vue 与两个面板 SFC 会进首屏关键路径）。
 */
import SkipManagerMainPanel from './SkipManagerMainPanel.vue'
import BangumiSkipManager from './BangumiSkipManager.vue'
import { createApp } from 'vue'
export { SkipManagerMainPanel, BangumiSkipManager, createApp }
