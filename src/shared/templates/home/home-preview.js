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
    homePreviewPlayerUrl: '//www.bilibili.com/blackboard/html5mobileplayer.html?bvid=[[BVID]]&autoplay=1&danmaku=0&hideCoverInfo=1&high_quality=1&qn=80&as_wide=1',
    homePreviewPlayerUrlFallback: '//player.bilibili.com/player.html?bvid=[[BVID]]&autoplay=1&danmaku=0&high_quality=1&as_wide=1'
}
