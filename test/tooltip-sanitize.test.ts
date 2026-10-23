import { test } from 'node:test'
import assert from 'node:assert/strict'
/**
 * tooltip 提示文本的白名单消毒（2026-10-23 审查发现的存储型 XSS）
 *
 * 提示文本里会插值**配置值**（`settings-config.ts` 的 `tips: configs => ...${configs.player_offset_top}...`），
 * 而配置值可以来自用户导入的配置文件；提示最终走 `tooltip.innerHTML = content`，
 * 于是导入一份 `{"player_offset_top": "<img src=x onerror=…>"}` 就会在 B 站源下执行脚本。
 *
 * 这里锁住「只放行 <br> 与安全的 <a>，其余标签整段丢弃、文本一律转义」这条不变量。
 */
import { sanitizeTooltipHtml } from '@/utils/sanitize-html'
test('注入的标签被丢弃（不产出任何可执行标签）', () => {
    const result = sanitizeTooltipHtml('看看 <img src=x onerror=alert(1)>')
    assert.ok(!result.includes('<img'), 'img 标签必须被丢弃')
    assert.ok(!result.includes('onerror'), '事件属性不能出现在结果里')
    assert.ok(!result.includes('&lt;img'), '被丢弃的标签连属性一起整段丢弃，不回显成文本')
    assert.ok(result.includes('看看'), '标签之外的正常文本要保留')
})
test('script / iframe / svg 等一律丢弃', () => {
    for (const payload of ['<script>alert(1)</script>', '<iframe src="//evil"></iframe>', '<svg onload=alert(1)>']) {
        const result = sanitizeTooltipHtml(payload)
        assert.ok(!/<(script|iframe|svg)/i.test(result), `不应保留可执行标签：${payload}`)
    }
})
test('文本中的尖括号被转义（裸 < 不会被当成标签）', () => {
    const result = sanitizeTooltipHtml('a < b 且 x > y')
    assert.ok(result.includes('a &lt; b'), `裸 < 应转义：${result}`)
    assert.ok(result.includes('x &gt; y'), `裸 > 应转义：${result}`)
})
test('<br> 放行（提示文案用它换行）', () => {
    assert.equal(sanitizeTooltipHtml('第一行<br>第二行'), '第一行<br>第二行')
})
test('外链 <a> 放行并补 target/rel', () => {
    const result = sanitizeTooltipHtml('<a href="https://siliconflow.cn/pricing" target="_blank">查看计费</a>')
    assert.ok(result.includes('href="https://siliconflow.cn/pricing"'), `应保留安全链接：${result}`)
    assert.ok(result.includes('target="_blank"'), '应补 target')
    assert.ok(result.includes('rel="noopener noreferrer"'), '应补 rel')
    assert.ok(result.includes('>查看计费</a>'), '应保留链接文字')
})
test('危险协议的链接被丢弃，链接文字保留', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
        const result = sanitizeTooltipHtml(`<a href="${href}">点我</a>`)
        assert.ok(!result.includes('<a'), `危险协议不应生成链接：${href}`)
        assert.ok(result.includes('点我'), '链接文字应保留')
    }
})
test('相对链接与空 href 一律不放行', () => {
    assert.ok(!sanitizeTooltipHtml('<a href="/local">x</a>').includes('<a'))
    assert.ok(!sanitizeTooltipHtml('<a>无 href</a>').includes('<a'))
})
