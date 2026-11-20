#!/usr/bin/env node
/**
 * UP 主黑名单（全站）· 真机探针
 *
 * 覆盖：设置页入口打开弹窗 / 添加 16 位 UID 并展示信息 / 长名单不超视口 /
 *       全站卡片按名单隐藏 / 空间页监狱门遮罩与临时查看 / 默认关闭无效果
 */
import { launchBrowser, openWithUserscript, waitFor } from './harness.mjs'
const browser = await launchBrowser()
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const openSettings = async page => {
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-palette-settings-btn'))), { timeout: 20000, label: '首页设置按钮' })
    await page.evaluate(() => document.querySelector('.adj-palette-settings-btn')?.click())
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adjustment-popover')?.matches(':popover-open'))), { timeout: 15000, label: '设置弹窗打开' })
}
const openPanel = async page => {
    await page.evaluate(() => document.querySelector('[data-action-for="up_blocklist_enabled"]')?.click())
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-blocklist-popover')?.matches(':popover-open'))), { timeout: 8000, label: '黑名单弹窗打开' })
}
try {
    // ---------- 1. 设置入口 + 添加 + 基础信息 ----------
    const page = await openWithUserscript(browser, 'https://www.bilibili.com/', {
        config: { up_blocklist_enabled: true },
        viewport: { width: 1600, height: 1000 }
    })
    await waitFor(async () => page.evaluate(() => document.querySelectorAll('.bili-video-card').length > 5), { timeout: 40000, label: '首页卡片' })
    await waitFor(async () => page.evaluate(() => {
        const el = document.querySelector('.bili-video-card .bili-video-card__info--author')
        return Boolean((el?.getAttribute('title') || el?.textContent || '').trim())
    }), { timeout: 20000, label: '卡片作者名' })
    const firstCard = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.bili-video-card'))
        const card = cards.find(item => (item.querySelector('.bili-video-card__info--author')?.getAttribute('title') || '').trim())
        const el = card?.querySelector('.bili-video-card__info--author')
        const href = card?.querySelector('a[href*="space.bilibili.com/"]')?.getAttribute('href') || ''
        return {
            author: (el?.getAttribute('title') || el?.textContent || '').trim(),
            uid: href.match(/space\.bilibili\.com\/(\d+)/)?.[1] || ''
        }
    })
    const author = firstCard.author
    const authorUid = firstCard.uid
    check('取到首页卡片作者名', Boolean(author), `${author} / ${authorUid || '无空间链接'}`)

    // index 库（首页推荐历史）应写入脚本存储命名空间 adj.idx.*
    await waitFor(async () => page.evaluate(() => Array.from(window.__gmStore?.values?.keys?.() || []).some(key => key.startsWith('adj.cfg.adj.idx.'))), { timeout: 25000, label: 'index 库迁入脚本存储' })
    const idxKeys = await page.evaluate(() => Array.from(window.__gmStore.values.keys()).filter(key => key.startsWith('adj.cfg.adj.idx.')).length)
    check('index 库已走脚本存储（首页历史）', idxKeys > 0, `keys=${idxKeys}`)

    await openSettings(page)
    await openPanel(page)
    const layers = await page.evaluate(() => ({
        settingsOpen: Boolean(document.querySelector('.adjustment-popover')?.matches(':popover-open')),
        panelOpen: Boolean(document.querySelector('.adj-blocklist-popover')?.matches(':popover-open')),
        backVisible: !(document.querySelector('.adj-blocklist-back')?.hidden ?? true)
    }))
    check('打开名单时设置弹窗已收起（不重叠）', !layers.settingsOpen && layers.panelOpen, JSON.stringify(layers))
    check('名单里有「返回设置」入口', layers.backVisible)
    await page.evaluate(() => document.querySelector('.adj-blocklist-back')?.click())
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adjustment-popover')?.matches(':popover-open'))), { timeout: 8000, label: '返回设置' })
    check('返回设置后名单已关闭', await page.evaluate(() => !document.querySelector('.adj-blocklist-popover')?.matches(':popover-open')))
    await openPanel(page)

    await page.evaluate(() => {
        document.querySelector('.adj-blocklist-input').value = '3493118980655263'
        document.querySelector('.adj-blocklist-add')?.requestSubmit()
    })
    await waitFor(async () => page.evaluate(() => (document.querySelector('.adj-blocklist-name')?.textContent || '') === '野驴阿呆'), { timeout: 15000, label: '添加 16 位 UID' })
    const info = await page.evaluate(() => document.querySelector('.adj-blocklist-meta')?.textContent || '')
    check('添加后展示昵称', true, '野驴阿呆')
    check('展示 UID 与粉丝数', info.includes('3493118980655263') && info.includes('粉丝'), info)

    // ---------- 2. 长名单 + 筛选 + 全站过滤 ----------
    await page.evaluate(async ({ name, uid }) => {
        const store = window.__gmStore
        for (let i = 0; i < 80; i++) {
            const fakeUid = `90000000${String(i).padStart(4, '0')}`
            store.values.set('adj.cfg.adj.blocklist.up.' + fakeUid, {
                v: { uid: fakeUid, name: `测试UP${i}`, face: '', fans: 0, sign: '', ts: Date.now() },
                t: Date.now()
            })
        }
        store.values.set('adj.cfg.adj.blocklist.up.' + uid, {
            v: { uid, name, face: '', fans: 1, sign: '', ts: Date.now() },
            t: Date.now()
        })
    }, { name: author, uid: authorUid || '999999' })
    // 再添加一个真实 UID：既验证重复添加能续存，也借 onChange 触发重新扫描/刷新列表
    await page.evaluate(() => {
        document.querySelector('.adj-blocklist-input').value = '2'
        document.querySelector('.adj-blocklist-add')?.requestSubmit()
    })
    await waitFor(async () => page.evaluate(() => document.querySelectorAll('.adj-blocklist-item').length >= 80), { timeout: 15000, label: '长名单渲染' })
    await waitFor(async () => page.evaluate(name => {
        const cards = Array.from(document.querySelectorAll('.bili-video-card'))
        const matched = cards.filter(card => (card.querySelector('.bili-video-card__info--author')?.getAttribute('title') || '').trim() === name)
        if (!matched.length) return false
        return matched.every(card => {
            const outer = card.closest('.feed-card')
            const target = outer || card.closest('.bili-feed-card') || card
            return getComputedStyle(target).display === 'none'
        })
    }, author), { timeout: 30000, label: '全站卡片按名单隐藏' })
    check('全站卡片按名单隐藏（含外层占位）', true, author)
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
            searchVisible: !search.hidden
        }
    })
    check('长名单弹窗不超出视口', layout.top >= 0 && layout.bottom <= layout.innerHeight + 1 && layout.height <= layout.innerHeight * 0.86, JSON.stringify(layout))
    check('长名单在弹窗内部滚动', layout.scrollable, `rows=${layout.rows}`)
    const filtered = await page.evaluate(() => {
        const search = document.querySelector('.adj-blocklist-search')
        search.value = '测试UP7'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        return document.querySelectorAll('.adj-blocklist-item').length
    })
    check('筛选框能缩小名单', filtered > 0 && filtered < 50, `filtered=${filtered}`)
    await page.evaluate(() => { const s = document.querySelector('.adj-blocklist-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })) })

    // 点遮罩：只应关闭名单，并回到设置页（两个弹窗不再叠层、不再连环关闭）
    await page.evaluate(() => document.querySelector('.adjustment-popover-overlay')?.click())
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adjustment-popover')?.matches(':popover-open'))), { timeout: 5000, label: '遮罩关闭名单后回设置' })
    const overlayState = await page.evaluate(() => ({
        settingsOpen: Boolean(document.querySelector('.adjustment-popover')?.matches(':popover-open')),
        panelOpen: Boolean(document.querySelector('.adj-blocklist-popover')?.matches(':popover-open'))
    }))
    check('点遮罩只关名单并回到设置', overlayState.settingsOpen && !overlayState.panelOpen, JSON.stringify(overlayState))
    await page.keyboard.press('Escape')

    // ---------- 3. 空间页监狱门 ----------
    const spacePage = await openWithUserscript(browser, 'https://space.bilibili.com/3493118980655263', {
        config: {
            up_blocklist_enabled: true,
            'adj.blocklist.up.3493118980655263': { uid: '3493118980655263', name: '野驴阿呆', face: '', fans: 0, sign: '', ts: Date.now() }
        },
        viewport: { width: 1600, height: 1000 }
    })
    await waitFor(async () => spacePage.evaluate(() => Boolean(document.querySelector('.adj-jail'))), { timeout: 30000, label: '空间监狱门' })
    const jail = await spacePage.evaluate(() => ({
        title: document.querySelector('.adj-jail-title')?.textContent || '',
        temp: document.querySelector('.adj-jail-temp')?.textContent || '',
        hint: document.querySelector('.adj-jail-hint')?.textContent || '',
        appHidden: getComputedStyle(document.querySelector('#app') || document.body).visibility === 'hidden'
    }))
    check('空间页被监狱门遮住', jail.appHidden)
    check('文案正确', jail.title.includes('已被您拉黑'), jail.title)
    check('有「临时查看」入口', jail.temp.trim() === '临时查看')
    check('说明注明关闭标签页立即上锁', jail.hint.includes('关闭标签页会立即上锁'), jail.hint)
    await spacePage.evaluate(() => document.querySelector('.adj-jail-temp')?.click())
    await waitFor(async () => spacePage.evaluate(() => !document.querySelector('.adj-jail')), { timeout: 5000, label: '临时查看解锁' })
    const unlocked = await spacePage.evaluate(() => getComputedStyle(document.querySelector('#app') || document.body).visibility !== 'hidden')
    check('临时查看后内容恢复', unlocked)

    // ---------- 4. 默认关闭 ----------
    const offPage = await openWithUserscript(browser, 'https://www.bilibili.com/', { config: {}, viewport: { width: 1600, height: 1000 } })
    await sleep(3000)
    const offState = await offPage.evaluate(() => ({
        hidden: document.querySelectorAll('[data-adj-blocklist-hidden]').length,
        jail: Boolean(document.querySelector('.adj-jail'))
    }))
    check('默认关闭：没有隐藏卡片/遮罩', offState.hidden === 0 && !offState.jail, JSON.stringify(offState))
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n黑名单（全站）探针全部通过')
