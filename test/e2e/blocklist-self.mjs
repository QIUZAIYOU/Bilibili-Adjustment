#!/usr/bin/env node
/**
 * 禁止拉黑自己：伪造 nav 接口返回当前登录 UID，验证添加被拒绝
 */
import { installGmStubs, launchBrowser, loadUserscript, seedConfig, waitFor } from './harness.mjs'
const SELF_UID = '3493118980655263'
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
        if (request.url().includes('/x/web-interface/nav')) {
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': 'https://www.bilibili.com',
                    'Access-Control-Allow-Credentials': 'true'
                },
                body: JSON.stringify({ code: 0, data: { mid: SELF_UID } })
            })
            return
        }
        void request.continue()
    })
    await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await installGmStubs(page)
    await seedConfig(page, { up_blocklist_enabled: true })
    await loadUserscript(page)
    await waitFor(async () => page.$('.adj-palette-settings-btn'), { timeout: 20000, label: '设置按钮出现' })
    await page.click('.adj-palette-settings-btn')
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('#VideoSettingsPopover')?.matches(':popover-open'))), {
        timeout: 15000,
        label: '设置弹窗打开'
    })
    await page.click('[data-action-for="up_blocklist_enabled"]')
    await waitFor(async () => page.$('.adj-blocklist-popover[popover]:popover-open'), { timeout: 15000, label: '名单弹窗打开' })
    await page.type('.adj-blocklist-input', SELF_UID)
    await page.click('.adj-blocklist-add-btn')
    await waitFor(async () => page.evaluate(() => {
        const text = document.querySelector('.adj-blocklist-status')?.textContent || ''
        return text.includes('当前登录的账号')
    }), { timeout: 10000, label: '出现拒绝提示' })
    const state = await page.evaluate(uid => ({
        status: document.querySelector('.adj-blocklist-status')?.textContent || '',
        stored: window.__gmStore.values.has('adj.blocklist.up.' + uid),
        items: document.querySelectorAll('.adj-blocklist-item').length
    }), SELF_UID)
    check('提示文案正确', state.status.includes('不能加入黑名单'), state.status)
    check('没有写入名单', !state.stored)
    check('列表仍为空', state.items === 0, String(state.items))
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n禁止拉黑自己探针通过')
