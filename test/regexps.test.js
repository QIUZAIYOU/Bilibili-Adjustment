import test from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { formatVideoCommentDescription, formatVideoCommentContents } from '../src/shared/regexps'
test('formatVideoCommentDescription 时间字符串转为可点击锚点', () => {
    const result = formatVideoCommentDescription('00:00 片头\n00:05:30 正片开始\n12:34:56 高潮部分', [])
    assert.ok(result.includes('<a data-type="seek" data-video-time="0" bilibili-adjustment-element>00:00</a>'))
    assert.ok(result.includes('<a data-type="seek" data-video-time="330" bilibili-adjustment-element>00:05:30</a>'))
    assert.ok(result.includes('<a data-type="seek" data-video-time="45296" bilibili-adjustment-element>12:34:56</a>'))
})
test('formatVideoCommentDescription URL 转为跳转链接（裸域名补协议）', () => {
    const result = formatVideoCommentDescription('官网 https://www.bilibili.com/video/BV1xx411c7mD，镜像 example.com/contact', [])
    assert.ok(result.includes('<a href="https://www.bilibili.com/video/BV1xx411c7mD" target="_blank" bilibili-adjustment-element>https://www.bilibili.com/video/BV1xx411c7mD</a>'))
    assert.ok(result.includes('<a href="https://example.com/contact" target="_blank" bilibili-adjustment-element>example.com/contact</a>'))
    // URL 中的 BV 号不再重复链接化
    assert.ok(!result.includes('/video/BV1xx411c7mD" target="_blank">BV'))
})
test('formatVideoCommentDescription URL 覆盖常见格式（端口/分号/中文参数）', () => {
    const result = formatVideoCommentDescription('端口 https://example.com:8080/admin 分号 https://example.com/path;jsessionid=abc 中文 https://example.com/search?q=中文关键词 路径 https://example.com/路径/文件.html 短链 https://b23.tv/abc123', [])
    assert.ok(result.includes('>https://example.com:8080/admin</a>'))
    assert.ok(result.includes('>https://example.com/path;jsessionid=abc</a>'))
    assert.ok(result.includes('>https://example.com/search?q=中文关键词</a>'))
    assert.ok(result.includes('>https://example.com/路径/文件.html</a>'))
    assert.ok(result.includes('>https://b23.tv/abc123</a>'))
})
test('formatVideoCommentDescription 裸文件名 URL 不链接化', () => {
    const result = formatVideoCommentDescription('素材 image.jpg 备用', [])
    assert.ok(!result.includes('<a '))
})
test('formatVideoCommentDescription BV 号与 cv 号转为跳转链接', () => {
    const result = formatVideoCommentDescription('视频 BV1xx411c7mD，专栏 cv1234567', [])
    assert.ok(result.includes('<a href="https://www.bilibili.com/video/BV1xx411c7mD" target="_blank" bilibili-adjustment-element>BV1xx411c7mD</a>'))
    assert.ok(result.includes('<a href="https://www.bilibili.com/read/cv1234567" target="_blank" bilibili-adjustment-element>cv1234567</a>'))
})
test('formatVideoCommentDescription @用户按 desc_v2 匹配转为空间链接', () => {
    const descV2 = [{ raw_text: '@测试UP主', biz_id: '10086' }]
    const result = formatVideoCommentDescription('感谢 @测试UP主 与 @路人甲 的支持', descV2)
    assert.ok(result.includes('<a target="_blank" href="//space.bilibili.com/10086" class="mention-user" data-v-8ced1e78="">@测试UP主 </a>'))
    // 未匹配到 desc_v2 的 @用户保持纯文本
    assert.ok(result.includes('@路人甲'))
    assert.ok(!result.includes('space.bilibili.com/路人甲'))
})
test('formatVideoCommentDescription 缺失 desc_v2 时不报错', () => {
    const result = formatVideoCommentDescription('感谢 @测试UP主 的支持', undefined)
    assert.ok(result.includes('@测试UP主'))
    assert.ok(!result.includes('<a '))
})
test('formatVideoCommentDescription 链接里带 bvid=BV… 时不再被二次链接化（回归：整段链接乱码）', () => {
    const text = [
        '直播回放：',
        'https://www.bilibili.com/list/259689/?sid=5095696&spm_id_from=333.1387.0.0&oid=116138549714529&bvid=BV1b5AyzaEQh',
        '舞台Focus：',
        '支持snh48李婷谢谢喵'
    ].join('\n')
    const result = formatVideoCommentDescription(text, [])
    // href 必须完整：旧实现（连续 replace）会把 href 里的 BV 号再替换一次，产生 `bvid=&lt;a href="…` 这种坏属性
    assert.ok(result.includes('<a href="https://www.bilibili.com/list/259689/?sid=5095696&spm_id_from=333.1387.0.0&oid=116138549714529&bvid=BV1b5AyzaEQh" target="_blank" bilibili-adjustment-element>'))
    assert.ok(!result.includes('&lt;a'), '不能出现被转义的 <a')
    assert.equal((result.match(/<a /g) || []).length, 1, '一个 URL 只应产生一个链接')
    assert.ok(!/<a\b[^>]*>[^<]*<a\b/.test(result), '不能出现嵌套链接')
    // URL 内的 BV 号已被整段吃掉，不应再生成第二个视频链接
    assert.ok(!result.includes('/video/BV1b5AyzaEQh'))
    // 其余文本保持原样
    assert.ok(result.includes('直播回放：'))
    assert.ok(result.includes('支持snh48李婷谢谢喵'))
})
test('formatVideoCommentDescription 独立 BV 号仍然链接化（与上一条对照）', () => {
    const result = formatVideoCommentDescription('正片 BV1b5AyzaEQh 见 https://www.bilibili.com/list/259689/?bvid=BV1BdrDBGEag', [])
    // 独立出现的 BV 号 → 视频链接
    assert.ok(result.includes('<a href="https://www.bilibili.com/video/BV1b5AyzaEQh" target="_blank" bilibili-adjustment-element>BV1b5AyzaEQh</a>'))
    // URL 里的 BV 号 → 只作为 URL 链接的一部分，不额外链接化
    assert.ok(result.includes('<a href="https://www.bilibili.com/list/259689/?bvid=BV1BdrDBGEag" target="_blank" bilibili-adjustment-element>https://www.bilibili.com/list/259689/?bvid=BV1BdrDBGEag</a>'))
    assert.ok(!result.includes('/video/BV1BdrDBGEag'))
})
test('formatVideoCommentContents 评论内容链接化', () => {
    const el = document.createElement('div')
    el.innerHTML = '视频 BV1xx411c7mD 专栏 cv1234567 完整链接 https://www.bilibili.com/video/BV1xx411c7mD 域名 example.com 素材 image.jpg'
    const result = formatVideoCommentContents(el)
    assert.ok(result.includes('<a href="https://www.bilibili.com/video/BV1xx411c7mD" target="_blank" bilibili-adjustment-element>BV1xx411c7mD</a>'))
    assert.ok(result.includes('<a href="https://www.bilibili.com/read/cv1234567" target="_blank" bilibili-adjustment-element>cv1234567</a>'))
    assert.ok(result.includes('<a href="https://www.bilibili.com/video/BV1xx411c7mD" target="_blank" bilibili-adjustment-element>https://www.bilibili.com/video/BV1xx411c7mD</a>'))
    assert.ok(result.includes('<a href="https://example.com" target="_blank" bilibili-adjustment-element>example.com</a>'))
    // 裸文件名不链接化，保持纯文本
    assert.ok(result.includes('素材 image.jpg'))
    assert.ok(!result.includes('>image.jpg<'))
})
