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
        if (!matched.length) return false
        return matched.every(card => {
            const outer = card.closest('.feed-card')
            const inner = card.closest('.bili-feed-card')
            const target = outer || inner || card
            if (getComputedStyle(target).display !== 'none') return false
            // 有 .feed-card 时必须连外层网格格子一起隐藏，不能只藏内层
            return !outer || getComputedStyle(outer).display === 'none'
        })
    }, author), { timeout: 30000, label: '黑名单卡片与外层占位被隐藏' })
    check('同名作者卡片与外层 .feed-card 占位均被隐藏', true, author)

    // ---------- 长名单：弹窗不超出视口，列表内部滚动并支持筛选 ----------
    await page.evaluate(async () => {
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
            const store = tx.objectStore('keyval')
            for (let i = 0; i < 80; i++) {
                const uid = `90000000${String(i).padStart(4, '0')}`
                store.put({
                    key: `blocked-up:${uid}`,
                    value: { uid, name: `测试UP${i}`, face: '', fans: 0, sign: '', ts: Date.now() },
                    timestamp: Date.now()
                })
            }
            tx.oncomplete = () => resolve(undefined)
            tx.onerror = () => reject(tx.error)
        })
    })
    await page.evaluate(() => {
        document.querySelector('.adj-blocklist-popover')?.hidePopover()
        document.querySelector('.adj-palette-blocklist-btn')?.click()
    })
    await waitFor(async () => page.evaluate(() => document.querySelectorAll('.adj-blocklist-item').length >= 80), {
        timeout: 8000,
        label: '长名单渲染'
    })
    const layout = await page.evaluate(() => {
        const pop = document.querySelector('.adj-blocklist-popover')
        const rect = pop.getBoundingClientRect()
        const list = pop.querySelector('.adj-blocklist-list')
        const search = pop.querySelector('.adj-blocklist-search')
        return {
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            innerHeight: window.innerHeight,
            scrollable: list.scrollHeight > list.clientHeight + 1,
            rows: list.querySelectorAll('.adj-blocklist-item').length,
            searchVisible: !search.hidden,
            title: pop.querySelector('.adj-blocklist-title')?.textContent
        }
    })
    check('长名单弹窗不超出视口', layout.top >= 0 && layout.bottom <= layout.innerHeight + 1 && layout.height <= layout.innerHeight * 0.86, JSON.stringify(layout))
    check('长名单在弹窗内部滚动', layout.scrollable, `rows=${layout.rows}`)
    check('长名单显示筛选框', layout.searchVisible, layout.title)
    const filtered = await page.evaluate(() => {
        const search = document.querySelector('.adj-blocklist-search')
        search.value = '测试UP7'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        return document.querySelectorAll('.adj-blocklist-item').length
    })
    check('筛选框能缩小名单', filtered > 0 && filtered < 50, `filtered=${filtered}`)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n黑名单探针全部通过')
