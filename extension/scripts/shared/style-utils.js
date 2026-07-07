// ===== scripts/shared/style-utils.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.styleUtils = {
  // 生成带前缀的 CSS 规则
  prefix (property, value) {
    const prefixes = ['-webkit-', '-moz-', '-ms-', '-o-']
    return prefixes.map(p => `${p}${property}: ${value};`).join('') + `${property}: ${value};`
  },

  // 生成暗色/亮色主题变量
  themeVars (theme) {
    return Object.entries(theme).map(([key, value]) => `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`).join('')
  },

  // 生成过渡动画 CSS
  transition (properties = ['all'], duration = '0.3s', easing = 'ease') {
    return properties.map(p => `${p} ${duration} ${easing}`).join(', ')
  },

  // 生成 flexbox CSS
  flex (direction = 'row', justify = 'flex-start', align = 'stretch', wrap = 'nowrap') {
    return `display: flex; flex-direction: ${direction}; justify-content: ${justify}; align-items: ${align}; flex-wrap: ${wrap};`
  },

  // 生成 grid CSS
  grid (columns = 1, gap = '0px') {
    return `display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: ${gap};`
  },

  // 生成滚动条样式
  scrollbar (width = '6px', thumbColor = '#555', trackColor = 'transparent') {
    return `::-webkit-scrollbar { width: ${width}; } ::-webkit-scrollbar-thumb { background: ${thumbColor}; border-radius: 3px; } ::-webkit-scrollbar-track { background: ${trackColor}; }`
  },

  // 生成响应式断点
  mediaQuery (breakpoint, rules) {
    return `@media (max-width: ${breakpoint}px) { ${rules} }`
  },

  // 动画关键帧
  keyframes (name, frames) {
    let css = `@keyframes ${name} { `
    for (const [pct, props] of Object.entries(frames)) {
      css += `${pct} { ${Object.entries(props).map(([k, v]) => `${k}: ${v};`).join('')} } `
    }
    return css + '}'
  }
}
