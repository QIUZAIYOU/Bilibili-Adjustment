#!/usr/bin/env node
/**
 * UP 主黑名单 · 真机探针
 *
 * 用法：ADJ_E2E_HEADLESS=1 node test/e2e/blocklist.mjs
 *
 * 覆盖：默认关闭无入口 / 开启后按钮出现 / 弹窗能打开 / 添加 UID 拉基本信息并落库 / 移除生效
 */
import { launchBrowser, openWithUserscript, waitFor } from './harness.mjs'
const browser = await launchBrowser()
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
try {
    // ---------- 默认关闭 ----------
    const offPage = await openWithUserscript(browser, 'https://www.bilibili.com/', { config: {}, viewport: { width: 1600, height: 1000 } })
    await new Promise(resolve => setTimeout(resolve, 2500))
    const offButton = await offPage.evaluate(() => Boolean(document.querySelector('.adj-palette-blocklist-btn')))
    check('默认关闭：没有黑名单入口', !offButton)

    // ---------- 开启 ----------
    const page = await openWithUserscript(browser, 'https://www.bilibili.com/', {
        config: { up_blocklist_enabled: true },
        viewport: { width: 1600, height: 1000 }
    })
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-palette-blocklist-btn'))), {
        timeout: 30000,
        label: '黑名单入口按钮'
    })
    check('开启后出现入口按钮', true)
    await page.evaluate(() => document.querySelector('.adj-palette-blocklist-btn')?.click())
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-blocklist-popover')?.matches(':popover-open'))), {
        timeout: 8000,
        label: '黑名单弹窗打开'
    })
    check('弹窗能打开', true)

    await page.evaluate(() => {
        const input = document.querySelector('.adj-blocklist-input')
        // 16 位新 UID 是真实反馈的回归点（曾按 12 位截断导致添加失败）
        input.value = '3493118980655263'
        document.querySelector('.adj-blocklist-add')?.requestSubmit()
    })
    await waitFor(async () => page.evaluate(() => {
        const meta = document.querySelector('.adj-blocklist-meta')?.textContent || ''
        return meta.includes('3493118980655263')
    }), {
        timeout: 15000,
        label: '添加 16 位 UID 并拉到昵称'
    })
    const added = await page.evaluate(() => {
        const item = document.querySelector('.adj-blocklist-item')
        return {
            name: item?.querySelector('.adj-blocklist-name')?.textContent || '',
            meta: item?.querySelector('.adj-blocklist-meta')?.textContent || ''
        }
    })
    check('添加后展示昵称', added.name.length > 0, added.name)
    check('展示 UID 与粉丝数', added.meta.includes('UID 3493118980655263') && added.meta.includes('粉丝'), added.meta)

    await page.evaluate(() => document.querySelector('.adj-blocklist-remove')?.click())
    await waitFor(async () => page.evaluate(() => !document.querySelector('.adj-blocklist-item')), {
        timeout: 8000,
        label: '移除条目'
    })
    check('移除后名单为空', true)

    // ---------- 过滤生效 ----------
    // 不刷新页面：刷后推荐流会换一批，之前读到的作者就没了。改为先落一条名单，
    // 再通过弹窗「添加」触发 onChange → 重新扫描当前页卡片。
    const author = await page.evaluate(() => {
        const el = document.querySelector('.bili-video-card .bili-video-card__info--author')
        return (el?.getAttribute('title') || el?.textContent || '').trim()
    })
    check('取到首页卡片作者名', Boolean(author), author)
    await page.evaluate(async name => {
        const request = indexedDB.open('BilibiliAdjustmentIndexRecommendVideoHistory', 2)
        const db = await new Promise((resolve, reject) => {
            request.onupgradeneeded = () => {
                const result = request.result
                if (!result.objectStoreNames.contains('keyval')) result.createObjectStore('keyval', { keyPath: 'key' })
            }
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        await new Promise((resolve, reject) => {
            const tx = db.transaction('keyval', 'readwrite')
            tx.objectStore('keyval').put({
                key: 'blocked-up:999999',
                value: { uid: '999999', name, face: '', fans: 1, sign: '', ts: Date.now() },
                timestamp: Date.now()
            })
            tx.oncomplete = () => resolve(undefined)
            tx.onerror = () => reject(tx.error)
        })
    }, author)
    await page.evaluate(() => {
        document.querySelector('.adj-blocklist-input').value = '2'
        document.querySelector('.adj-blocklist-add')?.requestSubmit()
    })
    await waitFor(async () => page.evaluate(name => {
        const cards = Array.from(document.querySelectorAll('.bili-video-card'))
        const matched = cards.filter(card => (card.querySelector('.bili-video-card__info--author')?.getAttribute('title') || '').trim() === name)
        return matched.length > 0 && matched.every(card => getComputedStyle(card).display === 'none')
    }, author), { timeout: 30000, label: '黑名单卡片被隐藏' })
    check('同名作者卡片被隐藏', true, author)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n黑名单探针全部通过')
