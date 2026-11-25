#!/usr/bin/env node
/**
 * UP主空间弹窗的「加入黑名单（脚本）」快捷按钮探针
 */
import { installGmStubs, launchBrowser, loadUserscript, seedConfig, waitFor } from './harness.mjs'
const TARGET_MID = '3493118980655263'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const browser = await launchBrowser()
try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    await page.setRequestInterception(true)
    page.on('request', request => {
        const url = request.url()
        if (url.includes('/x/web-interface/nav')) {
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': 'https://www.bilibili.com', 'Access-Control-Allow-Credentials': 'true' },
                body: JSON.stringify({ code: 0, data: { mid: 999 } })
            })
            return
        }
        if (url.includes('/x/web-interface/card')) {
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': 'https://www.bilibili.com', 'Access-Control-Allow-Credentials': 'true' },
                body: JSON.stringify({ code: 0, data: { card: { mid: Number(TARGET_MID), name: '测试UP', face: '', fans: 1, sign: '' } } })
            })
            return
        }
        void request.continue()
    })
    await page.goto('https://www.bilibili.com/video/BV1GJ411x7h7/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await installGmStubs(page)
    await seedConfig(page, { open_author_space_mode: 'popup', up_blocklist_enabled: true })
    await loadUserscript(page)
    await waitFor(async () => page.$('.adj-sidenav-up-avatar'), { timeout: 30000, label: '侧栏 UP 头像出现' })
    await page.evaluate(() => document.querySelector('.adj-sidenav-up-avatar')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.up-space-dialog')?.matches(':popover-open'))), {
        timeout: 15000,
        label: '空间弹窗打开'
    })
    const text = await page.evaluate(() => document.querySelector('.adj-up-space-block-btn')?.textContent || '')
    check('空间弹窗有快捷拉黑按钮', text.includes('加入黑名单（脚本）'), text)
    await page.evaluate(() => document.querySelector('.adj-up-space-block-btn')?.click())
    await waitFor(async () => page.evaluate(() => (document.querySelector('.adj-up-space-block-btn')?.textContent || '').includes('已加入')), {
        timeout: 15000,
        label: '快捷按钮加入成功'
    })
    const state = await page.evaluate(mid => ({
        stored: window.__gmStore.values.has('adj.cfg.adj.blocklist.up.' + mid),
        text: document.querySelector('.adj-up-space-block-btn')?.textContent || ''
    }), TARGET_MID)
    check('名单已写入脚本存储', state.stored, JSON.stringify(state))
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n空间弹窗快捷拉黑探针通过')
