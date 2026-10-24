import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import {
    FALLBACK_PREVIEW_TITLE,
    PREVIEW_BVID_PLACEHOLDER,
    PREVIEW_BUTTON_CLASS,
    PREVIEW_COVER_CLASS,
    PREVIEW_COVER_ATTR,
    buildPreviewUrl,
    extractPreviewBvid,
    normalizePreviewTitle
} from '@/features/video-preview/video-preview-pure'
import { getTemplates } from '@/shared/templates'
import { videoPreviewStyles } from '@/shared/styles/video-preview'
/**
 * 视频卡片预览的纯逻辑回归（2026-09-24 新增功能，2026-10-24 扩展为跨页）
 *
 * 这些判据决定了「哪些卡片能预览」「弹窗里加载哪个地址」，出错就是整个功能不工作，故单独钉住。
 */
test('从卡片链接取 bvid：支持绝对/相对地址与查询串形式', () => {
    assert.equal(extractPreviewBvid('https://www.bilibili.com/video/BV1Qq7m6PEuA?trackid=xxx'), 'BV1Qq7m6PEuA')
    assert.equal(extractPreviewBvid('//www.bilibili.com/video/BV1Qq7m6PEuA'), 'BV1Qq7m6PEuA')
    assert.equal(extractPreviewBvid('/video/BV1Qq7m6PEuA?p=2'), 'BV1Qq7m6PEuA')
    assert.equal(extractPreviewBvid('https://www.bilibili.com/list/watchlater?bvid=BV1Qq7m6PEuA'), 'BV1Qq7m6PEuA')
})
test('取不到 bvid 时返回 null（该类卡片不注入预览按钮）', () => {
    assert.equal(extractPreviewBvid('https://www.bilibili.com/bangumi/play/ep6240820'), null)
    assert.equal(extractPreviewBvid('https://www.bilibili.com/video/av12345'), null)
    assert.equal(extractPreviewBvid(''), null)
    assert.equal(extractPreviewBvid(null), null)
    assert.equal(extractPreviewBvid(undefined), null)
})
test('按模板拼播放地址：占位符被替换且模板本身可热更', () => {
    const url = buildPreviewUrl(getTemplates.videoPreviewPlayerUrl, 'BV1Qq7m6PEuA')
    assert.equal(buildPreviewUrl('//x/?bvid=[[BVID]]', 'BV1a'), '//x/?bvid=BV1a')
    assert.equal(buildPreviewUrl('', 'BV1a'), '')
    assert.equal(PREVIEW_BVID_PLACEHOLDER, '[[BVID]]')
    assert.match(url, /BV1Qq7m6PEuA/)
})
test('主用同源视频播放页、兜底官方外链播放器，两者都是 B 站可用地址', () => {
    const primary = buildPreviewUrl(getTemplates.videoPreviewPlayerUrl, 'BV1a')
    const fallback = buildPreviewUrl(getTemplates.videoPreviewPlayerUrlFallback, 'BV1a')
    // 主用必须是 www.bilibili.com 同源地址：预览靠 B 站自己的「网页全屏」铺满，且要能拿到 contentDocument
    // 去点击那个「网页全屏」按钮（跨源就完全碰不到）。也别退回成移动播放页 —— 它的控制条只有播放/进度/宽屏。
    assert.match(primary, /^\/\/www\.bilibili\.com\/video\//)
    assert.notEqual(primary, fallback)
    assert.match(fallback, /player\.bilibili\.com/)
})
test('标题清洗：折叠空白、空标题用兜底文案', () => {
    assert.equal(normalizePreviewTitle('  这是\n  标题  '), '这是 标题')
    assert.equal(normalizePreviewTitle(''), FALLBACK_PREVIEW_TITLE)
    assert.equal(normalizePreviewTitle(null), FALLBACK_PREVIEW_TITLE)
})
test('预览按钮与封面容器的标记：跨页通用，不绑任何页型的类名', () => {
    // 按钮类名被事件委托、样式、清理三处依赖
    assert.equal(PREVIEW_BUTTON_CLASS, 'adj-video-preview-btn')
    // 封面类名是脚本自己打的：既作绝对定位的参照系，也作「悬浮封面才显示按钮」的显现规则
    assert.equal(PREVIEW_COVER_CLASS, 'adj-video-preview-cover')
    const css = videoPreviewStyles.VideoPreview
    // 显现规则**不能**再绑首页专属类名（否则换页就再也不显示）
    assert.doesNotMatch(css, /bili-video-card/)
})
test('显现规则不能只靠 class：Vue 重渲染会重置 class，按钮会永远不显现', () => {
    const css = videoPreviewStyles.VideoPreview
    // 主规则用 :has()（不依赖任何标记）—— 封面 class 被 Vue 抹掉也不影响显现
    assert.match(css, /:has\(> \.adj-video-preview-btn\):hover/)
    // 退路走 data 属性标记（Vue 不重置 data-*），类名规则保留给旧浏览器
    assert.equal(PREVIEW_COVER_ATTR, 'data-adj-preview-cover')
    assert.ok(css.includes(`[${PREVIEW_COVER_ATTR}]:hover`), '显现规则缺少 data 属性标记的退路')
    assert.match(css, /\.adj-video-preview-cover:hover \.adj-video-preview-btn/)
})
test('预览模板都在注册表里（注入页面的 HTML 走模板，便于热更）', () => {
    assert.ok(getTemplates.videoPreviewButton.includes(PREVIEW_BUTTON_CLASS))
    assert.ok(getTemplates.videoPreviewOpenButton)
    assert.ok(getTemplates.videoPreviewUpSpaceButton)
    assert.ok(getTemplates.videoPreviewPlayerUrl)
    assert.ok(getTemplates.videoPreviewPlayerUrlFallback)
    assert.ok(getTemplates.videoPreviewVideoPageUrl)
    assert.ok(getTemplates.videoPreviewPlayerCss)
})
