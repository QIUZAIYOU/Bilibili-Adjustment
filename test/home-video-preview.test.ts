import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import {
    FALLBACK_PREVIEW_TITLE,
    PREVIEW_BVID_PLACEHOLDER,
    buildPreviewUrl,
    extractPreviewBvid,
    normalizePreviewTitle
} from '@/modules/home/video-preview-pure'
import { getTemplates } from '@/shared/templates'
/**
 * 首页视频预览的纯逻辑回归（2026-09-24 新增功能）
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
    const url = buildPreviewUrl(getTemplates.homePreviewPlayerUrl, 'BV1Qq7m6PEuA')
    assert.equal(buildPreviewUrl('//x/?bvid=[[BVID]]', 'BV1a'), '//x/?bvid=BV1a')
    assert.equal(buildPreviewUrl('', 'BV1a'), '')
    assert.equal(PREVIEW_BVID_PLACEHOLDER, '[[BVID]]')
    assert.match(url, /BV1Qq7m6PEuA/)
})
test('主用同源视频播放页、兜底官方外链播放器，两者都是 B 站可用地址', () => {
    const primary = buildPreviewUrl(getTemplates.homePreviewPlayerUrl, 'BV1a')
    const fallback = buildPreviewUrl(getTemplates.homePreviewPlayerUrlFallback, 'BV1a')
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
