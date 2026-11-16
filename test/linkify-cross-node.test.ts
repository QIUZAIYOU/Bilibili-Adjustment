import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/**
 * 评论区「跨节点 URL」链接化回归（jsdom 真实 DOM）。
 *
 * 真实故障（2026-11-16）：B 站会把评论里的关键词自动做成搜索链接，一段网址被拆成
 * `<span>https://</span><a>github</a><span>.com/…</span><a>FontManager</a>`，
 * 逐文本节点做正则永远拼不出完整 URL，于是整条链接失效。
 */
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    pretendToBeVisual: true
})
function installDomGlobals (): void {
    const target = globalThis as unknown as Record<string, unknown>
    const source = dom.window as unknown as Record<string, unknown>
    for (const name of ['document', 'Element', 'Node', 'NodeFilter', 'Text', 'Range', 'HTMLElement', 'location']) {
        target[name] = source[name]
    }
    target.window = dom.window
}
installDomGlobals()
const { formatVideoCommentContents } = await import('@/shared/regexps')
/** 渲染评论内容（与真实调用一致：先解析成 DOM，再交给链接化） */
function render (html: string): string {
    const contents = document.createElement('p')
    contents.innerHTML = html
    return formatVideoCommentContents(contents)
}
const count = (html: string, needle: string): number => html.split(needle).length - 1
test('跨节点 URL：被 B 站搜索链接拆开的网址合并成一个链接', () => {
    const html = render('<span>我给个链接，https://</span>'
        + '<a data-type="search" href="//search.bilibili.com/all?keyword=github"><img src="https://i0.hdslb.com/x.png">github</a>'
        + '<span>.com/706972745/</span>'
        + '<a data-type="search" href="//search.bilibili.com/all?keyword=FontManager"><img src="https://i0.hdslb.com/x.png">FontManager</a>'
        + '<span>，挺好用的</span>')
    assert.equal(count(html, '>https://github.com/706972745/FontManager</a>'), 1, '应生成且只生成一个完整链接')
    assert.ok(html.includes('href="https://github.com/706972745/FontManager"'))
    assert.ok(html.includes('我给个链接，'), '前缀文字要保留')
    assert.ok(html.includes('，挺好用的'), '后缀文字要保留')
    assert.ok(!html.includes('search.bilibili.com'), '被 URL 覆盖的搜索链接要清掉')
})
test('跨节点 URL：裸域名被拆成两个 span 时补 https 协议', () => {
    const html = render('<span>example</span><span>.com/a</span>')
    assert.ok(html.includes('href="https://example.com/a"'))
    assert.ok(html.includes('>example.com/a</a>'), '裸域名保持原样显示')
})
test('跨节点 URL：<br> 两侧不拼成假链接', () => {
    const html = render('<span>github</span><br><span>.com/x</span>')
    assert.equal(count(html, '<a '), 0)
})
test('跨节点 URL：区间里有表情图时不合并，避免破坏排版', () => {
    const html = render('<span>example</span><img src="https://i0.hdslb.com/emoji.png"><span>.com/x</span>')
    assert.equal(count(html, '<a '), 0)
})
test('单节点 URL 仍走原有逐节点链接化（不回退）', () => {
    const html = render('<span>看这个 https://example.com/a 很好</span>')
    assert.ok(html.includes('href="https://example.com/a"'))
})
test('合并后的链接不会把尖括号文本注入成标签', () => {
    const html = render('<span>https://exa</span><span>mple.com/&lt;b&gt;x</span>')
    assert.ok(!html.includes('<b>'), '不能出现真实 <b> 标签')
    assert.ok(html.includes('&lt;b&gt;'), '原文本应保持转义')
})
