import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { biliApis } from '@/shared/bili-apis'
/**
 * 活动视频页（/festival/xxx?bvid=BVxxx）的 BV 号在**查询串**里，不在路径里。
 * 2026-10-23 修：此前 getCurrentVideoID 只认 /video/ /list/ /bangumi/，
 * 活动页上会返回 'error' → 跳过广告、进度条染色、跳过片段管理三条链全部拿不到当前视频 id。
 */
test('getCurrentVideoID：普通视频页取路径里的 BV 号', () => {
    assert.equal(biliApis.getCurrentVideoID('https://www.bilibili.com/video/BV1xx411c7mD'), 'BV1xx411c7mD')
})
test('getCurrentVideoID：活动视频页取查询串里的 BV 号', () => {
    assert.equal(
        biliApis.getCurrentVideoID('https://www.bilibili.com/festival/ciyuanganbeiwuyuehui?bvid=BV16xnm6pE3d&trackid=web_pegasus_0'),
        'BV16xnm6pE3d'
    )
})
test('getCurrentVideoID：列表页仍取路径/查询串里的 BV 号', () => {
    assert.equal(biliApis.getCurrentVideoID('https://www.bilibili.com/list/259689/?bvid=BV1b5AyzaEQh'), 'BV1b5AyzaEQh')
})
test('getCurrentVideoID：无法识别的页面返回 error（不误判）', () => {
    assert.equal(biliApis.getCurrentVideoID('https://www.bilibili.com/read/cv123456'), 'error')
    assert.equal(biliApis.getCurrentVideoID('https://www.bilibili.com/festival/xxx'), 'error')
})
