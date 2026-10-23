import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { formatVideoCommentDescription } from '@/shared/regexps'
import { escapeHtml } from '@/utils/text'
/**
 * 链接化输出的 HTML 会被调用方用 innerHTML 重新解析（简介区/评论区），
 * 而输入是**作者可控的纯文本** —— 未命中的片段若不转义，
 * `<img src=x onerror=…>` 会被这一轮解析成真实元素并在页面上执行（存储型 XSS）。
 * 这里用「产物里不能再出现裸标签」来断言，而不是逐字比对整段 HTML。
 */
const hasRawTag = (html: string): boolean => /<(img|script|iframe|svg)\b/i.test(html)
test('链接化：简介里的原始 HTML 不会被还原成真实标签（存储型 XSS 回归）', () => {
    const html = formatVideoCommentDescription('看看这个 https://example.com <img src=x onerror=alert(1)>')
    assert.equal(hasRawTag(html), false)
    assert.match(html, /&lt;img/)
})
test('链接化：正文里的 < 会被转义，不会被解析成标签', () => {
    const html = formatVideoCommentDescription('a < b 与 c > d')
    assert.equal(hasRawTag(html), false)
    assert.match(html, /a &lt; b/)
})
test('链接化：@提及里的用户名同样要转义', () => {
    // 用户名来自评论/简介正文，正则 @([^\s]+) 能匹配到 <img …> 这类内容
    const html = formatVideoCommentDescription('@<img src=x onerror=alert(1)>')
    assert.equal(hasRawTag(html), false)
    assert.match(html, /&lt;img/)
})
test('链接化：合法内容仍正常链接化（转义不能把功能改坏）', () => {
    const html = formatVideoCommentDescription('看这个 https://example.com/a?b=1&c=2 好看')
    assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2"/)
    assert.match(html, /<\/a>/)
})
test('链接化：BV 号仍生成视频链接', () => {
    const html = formatVideoCommentDescription('参考 BV1xx411c7mD 这个')
    assert.match(html, /href="https:\/\/www\.bilibili\.com\/video\/BV1xx411c7mD"/)
})
test('escapeHtml：转义 5 个 HTML 特殊字符', () => {
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
    assert.equal(escapeHtml('纯文本'), '纯文本')
    assert.equal(escapeHtml(null), '')
})
