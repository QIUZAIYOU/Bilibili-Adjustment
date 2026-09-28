/**
 * 首页「视频预览」相关模板
 *
 * 约定（见 docs/hot-update-assets.md 第 9 节）：注入 B 站页面的 HTML 与「可能随 B 站改动而变化」的
 * 地址串都放这里，改服务器上的 hot-config/templates.js 即可生效，不必发版。
 *
 * - `homePreviewButton`：插在卡片封面区左上角的预览按钮（与自带「稍后再看」同级）
 * - `homePreviewPlayerUrl`：**同源** html5 播放页（可访问 contentDocument → 能注入 CSS / 控音量 / 控进度）；
 *   `high_quality=1&qn=80` 实测可到 720P，`danmaku=0` 默认关弹幕，`hideCoverInfo=1` 隐藏播放量信息
 * - `homePreviewPlayerUrlFallback`：官方外链播放器（跨源，改不了内部样式，仅作兜底）
 */
export const homePreviewTemplates = {
    homePreviewButton: '<div class="adj-video-preview-btn" role="button" tabindex="0" aria-label="预览视频" title="预览（弹窗播放）" bilibili-adjustment-element>预览</div>',
    /**
     * 首页右下角悬浮按钮组里的「脚本设置」按钮：**只要图标不要文字**（与番剧页侧栏同一颗齿轮图标），
     * 尺寸/间距对齐 B 站自带的 40×40 图标按钮（见 shared/styles/home-page.js）
     */
    homeSettingsButton: '<div class="adj-palette-settings-btn" role="button" tabindex="0" title="打开脚本设置" aria-label="打开脚本设置" bilibili-adjustment-element><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M812.698 195.977L936.02 409.6a204.8 204.8 0 0 1 0 204.8L812.715 828.023a204.8 204.8 0 0 1-177.374 102.4H388.676a204.8 204.8 0 0 1-177.374-102.4L87.98 614.4a204.8 204.8 0 0 1 0-204.8l123.323-213.623a204.8 204.8 0 0 1 177.374-102.4h246.648a204.8 204.8 0 0 1 177.374 102.4zm-59.12 34.133a136.533 136.533 0 0 0-118.254-68.267H388.676a136.533 136.533 0 0 0-118.255 68.267L147.115 443.733a136.533 136.533 0 0 0 0 136.534L270.438 793.89a136.533 136.533 0 0 0 118.255 68.267h246.648a136.533 136.533 0 0 0 118.255-68.267l123.29-213.623a136.533 136.533 0 0 0 0-136.534L753.561 230.11z"/><path fill="currentColor" d="M512 682.667c94.26 0 170.667-76.408 170.667-170.667S606.259 341.333 512 341.333 341.333 417.741 341.333 512 417.741 682.667 512 682.667zm0-68.267a102.4 102.4 0 1 1 0-204.8 102.4 102.4 0 0 1 0 204.8z"/></svg></div>',
    homePreviewPlayerUrl: '//www.bilibili.com/blackboard/html5mobileplayer.html?bvid=[[BVID]]&autoplay=1&danmaku=0&hideCoverInfo=1&high_quality=1&qn=80&as_wide=1',
    homePreviewPlayerUrlFallback: '//player.bilibili.com/player.html?bvid=[[BVID]]&autoplay=1&danmaku=0&high_quality=1&as_wide=1'
}
