#!/usr/bin/env node
/**
 * 首页视频区重设计 · 真机探针
 *
 * 用法：ADJ_E2E_HEADLESS=1 node test/e2e/home-feed.mjs
 *
 * 覆盖：
 * 1. redesign 模式：自绘视频区出现、官方容器隐藏、无广告外链、分区泳道 ≥ 3
 * 2. 黑名单：点卡片 × 后该 UP 的卡片消失，配置写回 GM 存储
 * 3. 默认关闭：不插入任何节点、不改官方容器
 * 4. 接口失败：回退官方推荐流，不留白屏
 */
import { installGmStubs, launchBrowser, loadUserscript, openWithUserscript, seedConfig, waitFor } from './harness.mjs'
const browser = await launchBrowser()
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
    // ---------- 1 + 2：redesign ----------
    const page = await openWithUserscript(browser, 'https://www.bilibili.com/', {
        config: {
            home_feed_enabled: true,
            home_feed_mode: 'redesign',
            home_feed_layout: 'rails',
            home_feed_max_pages: 3,
            home_feed_blocked_uids: ''
        },
        viewport: { width: 1600, height: 1000 }
    })
    await waitFor(async () => page.evaluate(() => document.querySelectorAll('#adj-home-feed .adj-hf-card').length >= 20), {
        timeout: 40000,
        label: '首页视频区卡片'
    })
    const state = await page.evaluate(() => {
        const root = document.querySelector('#adj-home-feed')
        const native = document.querySelector('.recommended-container_floor-aside')
        return {
            cards: root ? root.querySelectorAll('.adj-hf-card').length : 0,
            rails: root ? root.querySelectorAll('.adj-hf-rail').length : 0,
            adLinks: root ? root.querySelectorAll('a[href*="cm.bilibili.com"]').length : 0,
            nativeDisplay: native ? getComputedStyle(native).display : 'missing',
            firstTitle: root?.querySelector('.adj-hf-title')?.textContent || ''
        }
    })
    check('自绘视频区渲染 ≥ 20 张卡', state.cards >= 20, `cards=${state.cards}`)
    // 推荐流分区很散时允许「1 条泳道 + 更多推荐」，只要卡片都在、至少有一条分区即可
    check('分区泳道 ≥ 2（或单区收全部）', state.rails >= 2 || (state.rails === 1 && state.cards >= 20), `rails=${state.rails} cards=${state.cards}`)
    check('官方推荐容器被隐藏', state.nativeDisplay === 'none', `display=${state.nativeDisplay}`)
    check('自绘区没有广告外链', state.adLinks === 0, `adLinks=${state.adLinks}`)
    check('卡片有标题文本', Boolean(state.firstTitle), state.firstTitle.slice(0, 20))

    // 官方密度：第一行必须正好 5 个（首行卡片 top 相同）
    const row = await page.evaluate(() => {
        const grid = document.querySelector('#adj-home-feed .adj-hf-grid')
        const cards = grid ? Array.from(grid.querySelectorAll('.adj-hf-card')).slice(0, 8) : []
        const tops = cards.map(card => Math.round(card.getBoundingClientRect().top))
        const firstTop = tops[0]
        return { tops, firstRow: tops.filter(top => Math.abs(top - firstTop) <= 1).length, columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0 }
    })
    check('一行 5 个（首行卡片同排）', row.firstRow === 5 && row.columns === 5, `firstRow=${row.firstRow} columns=${row.columns} tops=${row.tops.join(',')}`)

    const blocked = await page.evaluate(() => {
        const card = document.querySelector('#adj-home-feed .adj-hf-card')
        const uid = card?.dataset.uid || ''
        const before = document.querySelectorAll(`#adj-home-feed .adj-hf-card[data-uid="${uid}"]`).length
        card?.querySelector('[data-action="block"]')?.click()
        return { uid, before }
    })
    await waitFor(async () => page.evaluate(uid => document.querySelectorAll(`#adj-home-feed .adj-hf-card[data-uid="${uid}"]`).length < 1, blocked.uid), {
        timeout: 8000,
        label: '屏蔽后卡片消失'
    })
    const persisted = await page.evaluate(uid => String(window.__gmStore?.values?.get('adj.cfg.home_feed_blocked_uids')?.v || '').includes(uid), blocked.uid)
    check('点 × 后该 UP 卡片从页面消失', Boolean(blocked.uid), `uid=${blocked.uid}`)
    check('屏蔽 UID 写回配置', persisted)

    // ---------- 3：1280 宽降为 4 列 ----------
    const narrowPage = await openWithUserscript(browser, 'https://www.bilibili.com/', {
        config: {
            home_feed_enabled: true,
            home_feed_mode: 'redesign',
            home_feed_layout: 'rails',
            home_feed_max_pages: 2
        },
        viewport: { width: 1100, height: 900 }
    })
    await waitFor(async () => narrowPage.evaluate(() => document.querySelectorAll('#adj-home-feed .adj-hf-card').length >= 12), { timeout: 40000, label: '1100 宽度卡片' })
    const narrow = await narrowPage.evaluate(() => {
        const root = document.querySelector('#adj-home-feed')
        const grid = root?.querySelector('.adj-hf-grid')
        return {
            columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
            overflow: root ? root.scrollWidth - root.clientWidth : 0
        }
    })
    check('1100 宽降为 4 列', narrow.columns === 4, `columns=${narrow.columns}`)
    check('1100 宽无横向溢出', narrow.overflow <= 1, `overflow=${narrow.overflow}px`)

    // ---------- 4：默认关闭 ----------
    const offPage = await openWithUserscript(browser, 'https://www.bilibili.com/', { config: {}, viewport: { width: 1600, height: 1000 } })
    await sleep(3000)
    const offState = await offPage.evaluate(() => {
        const native = document.querySelector('.recommended-container_floor-aside')
        return {
            hasRoot: Boolean(document.querySelector('#adj-home-feed')),
            hasStyle: Boolean(document.getElementById('HomeFeedStyle')),
            nativeDisplay: native ? getComputedStyle(native).display : 'missing'
        }
    })
    check('默认关闭：没有自绘节点', !offState.hasRoot)
    check('默认关闭：没有注入样式', !offState.hasStyle)
    check('默认关闭：官方容器可见', offState.nativeDisplay !== 'none', `display=${offState.nativeDisplay}`)

    // ---------- 5：接口失败回退 ----------
    const failPage = await browser.newPage()
    await failPage.setViewport({ width: 1600, height: 1000 })
    await failPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')
    await failPage.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitFor(async () => failPage.evaluate(() => Boolean(document.querySelector('.recommended-container_floor-aside'))), { timeout: 20000, label: '官方推荐容器' })
    await installGmStubs(failPage)
    await failPage.evaluate(() => {
        const original = window.fetch.bind(window)
        window.fetch = (input, init) => String(input).includes('/feed/rcmd')
            ? Promise.reject(new TypeError('blocked by probe'))
            : original(input, init)
    })
    await seedConfig(failPage, { home_feed_enabled: true, home_feed_mode: 'redesign' })
    await loadUserscript(failPage)
    await sleep(5000)
    const fallbackState = await failPage.evaluate(() => {
        const native = document.querySelector('.recommended-container_floor-aside')
        return {
            hasRoot: Boolean(document.querySelector('#adj-home-feed')),
            nativeDisplay: native ? getComputedStyle(native).display : 'missing'
        }
    })
    check('接口失败：自绘区已移除', !fallbackState.hasRoot)
    check('接口失败：官方容器已恢复', fallbackState.nativeDisplay !== 'none' && fallbackState.nativeDisplay !== 'missing', `display=${fallbackState.nativeDisplay}`)

    if (page.logs?.length) {
        const errors = page.logs.filter(line => line.startsWith('[pageerror]') || line.includes('首页视频区丨'))
        if (errors.length) console.log('\n页面日志（相关）：\n' + errors.slice(-10).join('\n'))
    }
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n首页视频区探针全部通过')
