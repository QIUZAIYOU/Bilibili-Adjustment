/**
 * 跳过片段管理面板「懒加载桥」（只能被动态 import！）
 *
 * 原因同 src/ui/settings/lazy-panel.js：产物以 SystemJS 承载模块，
 * 动态 `import('*.vue')` 的模块命名空间在运行时取不到 `default`，
 * 必须经命名导出转交（命名导出在该环境下可靠）。
 *
 * ⚠️ 本模块禁止被静态 import（否则 Vue 与两个面板 SFC 会进首屏关键路径）。
 */
import SkipManagerMainPanel from './SkipManagerMainPanel.vue'
import BangumiSkipManager from './BangumiSkipManager.vue'
export { SkipManagerMainPanel, BangumiSkipManager }
