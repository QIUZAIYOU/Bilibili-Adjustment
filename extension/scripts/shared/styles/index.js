// ===== scripts/shared/styles/index.js =====
// 聚合所有样式，注入到页面
window.__biliExt = window.__biliExt || {}
window.__biliExt.stylesV2 = window.__biliExt.stylesV2 || {}

;(function () {
  const s = window.__biliExt.stylesV2
  s.BilibiliAdjustment = [
    window.__biliExt.commonStyles || '',
    window.__biliExt.videoPageStyles || '',
    window.__biliExt.homePageStyles || '',
    window.__biliExt.dynamicPageStyles || '',
    window.__biliExt.popoverStyles || '',
  ].filter(Boolean).join('\n')
})()
