import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { biliApis } from '@/shared/bili-apis'
/**
 * wbi 签名的回归防线（2026-09-24 修）
 *
 * 真实 `x/web-interface/nav` 的响应是 `{code, message, ttl, data:{isLogin, wbi_img:{...}}}`
 * （已用真实接口核对），而代码曾按 `res.data.wbi_img` 取值 —— `res.data` 是**整个响应体**，
 * 于是永远 undefined 并在解构处抛错；两个调用点都 try/catch 静默吞掉，
 * 表现为「UP主空间投稿列表 / 视频搜索」永远拿不到数据。下面的用例直接钉住真实响应形状。
 */
const navResponse = (imgUrl: string, subUrl: string): Response => new Response(JSON.stringify({
    code: 0,
    message: '0',
    ttl: 1,
    data: { isLogin: false, wbi_img: { img_url: imgUrl, sub_url: subUrl }}
}), { status: 200, headers: { 'Content-Type': 'application/json' }})
const withStubbedFetch = async (response: Response, run: () => Promise<unknown>): Promise<void> => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => response) as typeof fetch
    try {
        await run()
    } finally {
        globalThis.fetch = originalFetch
    }
}
test('wbi 签名：按真实响应形状（data.wbi_img）取到密钥并生成 w_rid', async () => {
    await withStubbedFetch(navResponse(
        'https://i0.hdslb.com/bfs/wbi/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
        'https://i0.hdslb.com/bfs/wbi/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png'
    ), async () => {
        const query = await biliApis.getQueryWithWbi({ mid: '1', ps: 10, pn: 1 })
        assert.match(query, /mid=1/, `查询串应包含原始参数：${query}`)
        assert.match(query, /wts=\d+/)
        assert.match(query, /w_rid=[0-9a-f]{32}/, `应生成 32 位 md5 签名：${query}`)
    })
})
test('wbi 签名：密钥真的参与了签名（换一组 img/sub key 结果不同）', async () => {
    let first = ''
    let second = ''
    await withStubbedFetch(navResponse(
        'https://i0.hdslb.com/bfs/wbi/11111111111111111111111111111111.png',
        'https://i0.hdslb.com/bfs/wbi/22222222222222222222222222222222.png'
    ), async () => { first = await biliApis.getQueryWithWbi({ mid: '1' }) })
    await withStubbedFetch(navResponse(
        'https://i0.hdslb.com/bfs/wbi/33333333333333333333333333333333.png',
        'https://i0.hdslb.com/bfs/wbi/44444444444444444444444444444444.png'
    ), async () => { second = await biliApis.getQueryWithWbi({ mid: '1' }) })
    const rid = (query: string): string => query.match(/w_rid=([0-9a-f]{32})/)?.[1] || ''
    assert.notEqual(rid(first), '', '第一次应拿到签名')
    assert.notEqual(rid(first), rid(second), '换密钥后签名必须不同（说明密钥真的被用了）')
})
test('wbi 签名：接口没返回 wbi_img 时给出明确错误，而不是"解构 undefined"', async () => {
    await withStubbedFetch(new Response(JSON.stringify({ code: -101, message: '账号未登录' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    }), async () => {
        await assert.rejects(biliApis.getQueryWithWbi({ mid: '1' }), /未返回 wbi_img/)
    })
})
