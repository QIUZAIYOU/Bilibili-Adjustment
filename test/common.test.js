import test from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { escapeHtml, sanitizeHttpUrl, getTotalSecondsFromTimeString } from '../src/utils/common.js'
test('escapeHtml 转义 HTML 特殊字符', () => {
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
    assert.equal(escapeHtml('纯文本'), '纯文本')
    assert.equal(escapeHtml(''), '')
    assert.equal(escapeHtml(null), '')
    assert.equal(escapeHtml(undefined), '')
    assert.equal(escapeHtml(0), '0')
})
test('sanitizeHttpUrl 仅放行 http/https 协议', () => {
    assert.equal(sanitizeHttpUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1')
    assert.equal(sanitizeHttpUrl('http://example.com/'), 'http://example.com/')
    assert.equal(sanitizeHttpUrl('  https://example.com/  '), 'https://example.com/')
    // 危险协议与非法输入一律拒绝
    assert.equal(sanitizeHttpUrl('javascript:alert(1)'), '')
    assert.equal(sanitizeHttpUrl('ftp://example.com'), '')
    assert.equal(sanitizeHttpUrl('data:text/html,<script>'), '')
    assert.equal(sanitizeHttpUrl(''), '')
    assert.equal(sanitizeHttpUrl('   '), '')
    assert.equal(sanitizeHttpUrl(null), '')
    // 相对路径基于 location.origin 解析
    assert.equal(sanitizeHttpUrl('relative/path'), 'https://www.bilibili.com/relative/path')
})
test('getTotalSecondsFromTimeString 解析时间串为秒数', () => {
    assert.equal(getTotalSecondsFromTimeString('45'), 45)
    assert.equal(getTotalSecondsFromTimeString('1:30'), 90)
    assert.equal(getTotalSecondsFromTimeString('1:02:03'), 3723)
    assert.equal(getTotalSecondsFromTimeString('0:00'), 0)
    assert.equal(getTotalSecondsFromTimeString(''), 0)
    // 超过三段的时间串视为无效
    assert.equal(getTotalSecondsFromTimeString('1:2:3:4'), 0)
})
