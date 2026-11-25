#!/usr/bin/env node
/**
 * 空间页原生菜单注入探针：伪造 space 页面 + 菜单，验证脚本插入菜单项并写入名单
 */
import { installGmStubs, launchBrowser, loadUserscript, waitFor } from './harness.mjs'
const UID = '123456'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const HTML = `<!DOCTYPE html><html><body>
<div class="vui_popover-content menu-popover__content">
  <div class="menu-popover__panel">
    <div data-v-a2606a0d class="menu-popover__panel-item">加入黑名单</div>
    <div data-v-a2606a0d class="menu-popover__panel-item">举报</div>
  </div>
</div>
</body></html>`
const browser = await launchBrowser()
try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    await page.setRequestInterception(true)
    page.on('request', request => {
        const url = request.url()
        if (url === `https://space.bilibili.com/${UID}/`) {
            void request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML })
            return
        }
        if (url.includes('/x/web-interface/nav')) {
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': 'https://space.bilibili.com', 'Access-Control-Allow-Credentials': 'true' },
                body: JSON.stringify({ code: 0, data: { mid: 999 } })
            })
            return
        }
        if (url.includes('/x/web-interface/card')) {
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': 'https://space.bilibili.com', 'Access-Control-Allow-Credentials': 'true' },
                body: JSON.stringify({ code: 0, data: { card: { mid: Number(UID), name: '空间UP', face: '', fans: 1, sign: '' } } })
            })
            return
        }
        void request.continue()
    })
    await page.goto(`https://space.bilibili.com/${UID}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await installGmStubs(page)
    await loadUserscript(page)
    await waitFor(async () => page.$('.adj-space-block-item'), { timeout: 15000, label: '菜单项注入' })
    const panel = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.menu-popover__panel-item'))
        return {
            texts: items.map(item => item.textContent),
            first: items[0]?.textContent,
            scoped: items[0]?.getAttribute('data-v-a2606a0d')
        }
    })
    check('插入在官方「加入黑名单」之前', panel.first === '加入黑名单（脚本）', JSON.stringify(panel))
    check('复制了官方 scoped 属性', panel.scoped === '')
    await page.evaluate(() => document.querySelector('.adj-space-block-item')?.click())
    await waitFor(async () => page.evaluate(() => (document.querySelector('.adj-space-block-item')?.textContent || '').includes('已加入')), {
        timeout: 10000,
        label: '点击后加入成功'
    })
    const stored = await page.evaluate(mid => window.__gmStore.values.has('adj.cfg.adj.blocklist.up.' + mid), UID)
    check('脚本名单已写入', stored)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n空间菜单注入探针通过')

