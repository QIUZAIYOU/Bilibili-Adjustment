#!/usr/bin/env node
/**
 * 站内切换视频后侧栏 UP 主信息刷新探针
 *
 * 拦截 x/web-interface/view，按 bvid 返回不同 owner；用 history.pushState 模拟站内切视频，
 * 断言侧栏头像 tip 与 data-adj-up-mid 跟着换人（含切回）。
 */
import { installGmStubs, launchBrowser, loadUserscript, waitFor } from './harness.mjs'
const A = { bvid: 'BV1GJ411x7h7', mid: '111111', name: '作者A' }
const B = { bvid: 'BV1Q5411B7aM', mid: '222222', name: '作者B' }
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
        if (url.includes('/x/web-interface/view')) {
            const owner = url.includes(A.bvid)
                ? { mid: Number(A.mid), name: A.name, face: 'https://i0.hdslb.com/bfs/face/a.jpg' }
                : { mid: Number(B.mid), name: B.name, face: 'https://i0.hdslb.com/bfs/face/b.jpg' }
            void request.respond({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': 'https://www.bilibili.com',
                    'Access-Control-Allow-Credentials': 'true'
                },
                body: JSON.stringify({ code: 0, data: { owner } })
            })
            return
        }
        void request.continue()
    })
    await page.goto(`https://www.bilibili.com/video/${A.bvid}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await installGmStubs(page)
    await loadUserscript(page)
    const readAvatar = () => page.evaluate(() => {
        const button = document.querySelector('.adj-sidenav-up-avatar')
        return {
            tip: button?.querySelector('.adj-sidenav-up-avatar-tip')?.textContent || '',
            mid: button?.getAttribute('data-adj-up-mid') || ''
        }
    })
    await waitFor(async () => (await readAvatar()).mid === A.mid, { timeout: 30000, label: '初始作者 A 出现' })
    check('初始视频作者正确', true)

    await page.evaluate(bvid => history.pushState({}, '', `/video/${bvid}/`), B.bvid)
    await waitFor(async () => {
        const state = await readAvatar()
        return state.mid === B.mid && state.tip === B.name
    }, { timeout: 20000, label: '切到 B 后头像换人' })
    check('切视频后头像、昵称、mid 都换成新作者', true)

    await page.evaluate(bvid => history.pushState({}, '', `/video/${bvid}/`), A.bvid)
    await waitFor(async () => {
        const state = await readAvatar()
        return state.mid === A.mid && state.tip === A.name
    }, { timeout: 20000, label: '切回 A 后头像换回' })
    check('切回原视频也能恢复', true)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n侧栏 UP 主信息切换探针通过')
