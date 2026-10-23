import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    isNormalVideoPage,
    isBangumiPage,
    isListPage,
    isActivityVideoPage,
    isVideoModulePage,
    isVideoPage
} from '@/utils/page-type'
import { regexps } from '@/shared/regexps'
test('isVideoModulePage：普通视频页 / 番剧页 / 列表页都算视频模块页面', () => {
    assert.equal(isVideoModulePage('/video/BV16xnm6pE3d'), true)
    assert.equal(isVideoModulePage('/bangumi/play/ep123'), true)
    assert.equal(isVideoModulePage('/bangumi/play/ss45'), true)
    assert.equal(isVideoModulePage('/list/123456'), true)
})
test('isVideoModulePage：活动视频页（/festival/…?bvid=…）也算视频模块页面', () => {
    // 2026-10-23 用户实测：这类页面内嵌标准播放器，但路径不是 /video/，此前脚本完全不生效
    assert.equal(isVideoModulePage('/festival/ciyuanganbeiwuyuehui'), true)
    assert.equal(isVideoModulePage('/festival/xxx/'), true)
})
test('isVideoModulePage：首页 / 专栏 / 动态 / 临时路径都不算', () => {
    assert.equal(isVideoModulePage('/'), false)
    assert.equal(isVideoModulePage('/index.html'), false)
    assert.equal(isVideoModulePage('/read/cv123456'), false)
    assert.equal(isVideoModulePage('/opus/123456'), false)
    assert.equal(isVideoModulePage('/h5/xxx'), false)
})
test('isVideoPage（选择器页型门控口径）：普通视频页 + 活动视频页', () => {
    assert.equal(isVideoPage('/video/BV16xnm6pE3d'), true)
    assert.equal(isVideoPage('/festival/ciyuanganbeiwuyuehui'), true)
    // 列表页历史上按 other 处理，番剧页有独立 bangumi 页型，都不算 video 页
    assert.equal(isVideoPage('/list/123456'), false)
    assert.equal(isVideoPage('/bangumi/play/ep123'), false)
})
test('isBangumiPage / isListPage / isNormalVideoPage：路径互不串台', () => {
    assert.equal(isBangumiPage('/bangumi/play/ep1'), true)
    assert.equal(isBangumiPage('/video/BV1'), false)
    assert.equal(isListPage('/list/123'), true)
    assert.equal(isListPage('/video/BV1'), false)
    assert.equal(isNormalVideoPage('/video/BV1'), true)
    assert.equal(isNormalVideoPage('/festival/xxx'), false)
})
test('isActivityVideoPage：判据走注册表，热更覆盖后立即生效', () => {
    const original = regexps.common.activityVideoPath
    try {
        assert.equal(isActivityVideoPage('/festival/xxx'), true)
        // 模拟服务器 hot-config/regexps.js 覆盖：判据在调用时读取注册表，覆盖后立即生效
        regexps.common.activityVideoPath = /^\/(?:festival|blackboard)\// as RegExp
        assert.equal(isActivityVideoPage('/blackboard/xxx'), true)
        assert.equal(isVideoModulePage('/blackboard/xxx'), true)
    } finally {
        regexps.common.activityVideoPath = original
    }
    assert.equal(isActivityVideoPage('/blackboard/xxx'), false)
})
