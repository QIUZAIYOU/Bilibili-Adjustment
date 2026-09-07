/**
 * 主题系统出口
 * - ThemeManager / generateThemeVariables：注入、切换、读取、跟随官方
 * - THEMES / night / light / dark：主题定义
 * - themeTokens：token 语义值（tokens.js 导出）
 * - 旧的 theme.js 兼容视图在阶段迁移完成后移除
 */
export { ThemeManager, generateThemeVariables, getThemeCssVariables, DEFAULT_THEME, FOLLOW_THEME } from './manager'
export { night, light, dark, THEMES, THEME_LIST } from './themes'
export { sharedTokens, defaultColors, defaultShadows, colorTokenKeys } from './tokens'
