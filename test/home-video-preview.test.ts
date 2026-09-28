import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import {
    DEFAULT_PREVIEW_VOLUME,
    FALLBACK_PREVIEW_TITLE,
    PREVIEW_BVID_PLACEHOLDER,
    buildPreviewUrl,
    extractPreviewBvid,
    normalizePreviewTitle,
    normalizePreviewVolume
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
    assert.match(url, /html5mobileplayer\.html\?bvid=BV1Qq7m6PEuA/)
    assert.match(url, /autoplay=1/)
    assert.equal(buildPreviewUrl('//x/?bvid=[[BVID]]', 'BV1a'), '//x/?bvid=BV1a')
    assert.equal(buildPreviewUrl('', 'BV1a'), '')
    assert.equal(PREVIEW_BVID_PLACEHOLDER, '[[BVID]]')
})
test('主用同源播放页、兜底官方外链播放器，两者都是 B 站可用地址', () => {
    const primary = buildPreviewUrl(getTemplates.homePreviewPlayerUrl, 'BV1a')
    const fallback = buildPreviewUrl(getTemplates.homePreviewPlayerUrlFallback, 'BV1a')
    // 同源（与首页同域）才能拿 contentDocument 注入样式 / 控音量
    assert.match(primary, /^\/\/www\.bilibili\.com\//)
    assert.notEqual(primary, fallback)
    assert.match(fallback, /player\.bilibili\.com/)
})
test('标题清洗：折叠空白、空标题用兜底文案', () => {
    assert.equal(normalizePreviewTitle('  这是\n  标题  '), '这是 标题')
    assert.equal(normalizePreviewTitle(''), FALLBACK_PREVIEW_TITLE)
    assert.equal(normalizePreviewTitle(null), FALLBACK_PREVIEW_TITLE)
})
test('音量归一：夹到 0~1，非法值回落默认值', () => {
    assert.equal(normalizePreviewVolume('0.5'), 0.5)
    assert.equal(normalizePreviewVolume(1.7), 1)
    assert.equal(normalizePreviewVolume(-1), 0)
    assert.equal(normalizePreviewVolume('abc'), DEFAULT_PREVIEW_VOLUME)
    assert.equal(normalizePreviewVolume(null), DEFAULT_PREVIEW_VOLUME)
    assert.equal(normalizePreviewVolume(undefined, 0.3), 0.3)
})
