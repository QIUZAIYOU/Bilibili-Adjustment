/**
 * Vue 设置面板「懒加载桥」（只能被动态 import！）
 *
 * 为什么需要它：
 * 产物以 SystemJS（@require systemjs + named-register）承载模块，动态 `import('*.vue')`
 * 拿到的模块命名空间在运行时取不到 `default`（`mod.default === undefined`），
 * 传给 `createApp` 后会在 Vue 内部 mount 阶段抛
 * `Cannot read properties of undefined (reading 'render')`。
 * 而**命名导出**在同样的环境下是可靠的（`import('vue')` 的 createApp 就能拿到）。
 * 因此这里把 SFC 的 default 转成命名导出，供 index.js 动态导入使用。
 *
 * ⚠️ 本模块**禁止被静态 import**：一旦静态引入，Vue 运行时与 SFC 会进入首屏关键路径
 * （违反「Vue 入口必须懒加载」红线）。它只应出现在 `await import('./lazy-panel.js')` 中。
 */
import SettingsPanelV3 from './SettingsPanelV3.vue'
/** 设置面板组件（命名导出，规避 SystemJS 下 default 取不到的问题） */
export const SettingsPanelV3Component = SettingsPanelV3
