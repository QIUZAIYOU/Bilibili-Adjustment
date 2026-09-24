import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { biliApis } from '@/shared/bili-apis'
/**
 * wbi 端点选择的回归（2026-09-24）
 *
 * `x/space/arc/search` 是**已弃用的非 wbi 端点**：B 站自己的空间页请求的是
 * `x/space/wbi/arc/search`（实测抓到的请求 URL），旧版单文件脚本用的也是 wbi 端点，
 * 重构时被写成了非 wbi 端点。这里把「签名 + wbi 端点」的搭配钉住。
 *
 * 说明：这两个方法目前**没有任何调用点**（UP 主空间弹窗用 iframe，不走接口），
 * 保留它们是为了后续接功能时不再踩端点坑。
 */
const navPayload = {
    code: 0,
    data: { wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png' }}
}
/** 装一个会记录请求 URL 的 fetch：/nav 返回 wbi 密钥，其它返回给定负载 */
const withRecordingFetch = async (payload: unknown, run: () => Promise<void>): Promise<string[]> => {
    const originalFetch = globalThis.fetch
    const urls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        urls.push(url)
        const body = url.includes('/nav') ? navPayload : payload
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }})
    }) as typeof fetch
    try {
        await run()
    } finally {
        globalThis.fetch = originalFetch
    }
    return urls
}
test('空间投稿列表：请求 wbi 端点（不再用已弃用的非 wbi 端点）且带签名', async () => {
    let list: unknown
    const urls = await withRecordingFetch({ code: 0, data: { list: { vlist: [{ bvid: 'BV1' }]}}}, async () => {
        list = await biliApis.getWebCreaterArcsDrawInfo(2233)
    })
    assert.deepEqual(list, [{ bvid: 'BV1' }], '应正确取出 data.list.vlist')
    assert.ok(urls.some(url => /x\/web-interface\/nav/.test(url)), `应先取 wbi 密钥：${urls.join(' | ')}`)
    const arcUrl = urls.find(url => url.includes('arc/search')) || ''
    assert.match(arcUrl, /x\/space\/wbi\/arc\/search\?/, `应请求 wbi 端点：${arcUrl}`)
    assert.doesNotMatch(arcUrl, /x\/space\/arc\/search\?/, '不应再请求已弃用的非 wbi 端点')
    assert.match(arcUrl, /mid=2233/)
    assert.match(arcUrl, /w_rid=[0-9a-f]{32}/, '应带 wbi 签名')
})
test('视频搜索：请求 wbi 端点且带签名与分页参数', async () => {
    let result: unknown
    const urls = await withRecordingFetch({ code: 0, data: { result: [{ bvid: 'BV2' }]}}, async () => {
        result = await biliApis.getSearchResult('测试', 2)
    })
    assert.deepEqual(result, [{ bvid: 'BV2' }], '应正确取出 data.result')
    const searchUrl = urls.find(url => url.includes('search/type')) || ''
    assert.match(searchUrl, /x\/web-interface\/wbi\/search\/type\?/)
    assert.match(searchUrl, /keyword=/)
    assert.match(searchUrl, /page=2/)
    assert.match(searchUrl, /w_rid=[0-9a-f]{32}/)
})
