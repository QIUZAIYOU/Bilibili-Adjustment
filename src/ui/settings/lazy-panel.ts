/**
 * Vue 设置面板「懒加载桥」（只能被动态 import！）
 *
 * 为什么需要它：
 * 1) **Vue API 必须与组件同源**：产物按 chunk 分别压缩，`import('vue')` 拿到的是一份
 *    `vue.runtime.esm-bundler` chunk，而 SFC 的渲染/事件用的是 `runtime-core`/`runtime-dom` chunk ——
 *    两者是**两个 Vue 运行时实例**（reactive / vnode 标记 / 事件系统各自独立），
 *    表现为：宿主改配置面板不刷新、面板里的 change 事件不触发。
 *    因此这里与组件一起导出同一份 Vue API，宿主必须用它创建应用。
 * 2) 命名导出是 SystemJS 下的可靠通道（避免依赖动态导入模块的 default 形状）。
 *
 * ⚠️ 本模块**禁止被静态 import**：一旦静态引入，Vue 运行时与 SFC 会进入首屏关键路径
 * （违反「Vue 入口必须懒加载」红线）。它只应出现在 `await import('./lazy-panel.js')` 中。
 */
import SettingsPanelV3 from './SettingsPanelV3.vue'
import { createApp, reactive, markRaw } from 'vue'
/** 设置面板组件（与下面的 Vue API 来自同一个模块图，保证运行时实例一致） */
export const SettingsPanelV3Component = SettingsPanelV3
export { createApp, reactive, markRaw }
