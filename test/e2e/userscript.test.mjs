/**
 * 端到端用例：把构建产物注入浏览器，验证「视频卡片预览」在各类卡片上都能注入按钮
 *
 * 跑法：npm run test:e2e
 * （默认用本地产物 dist/bilibili-adjustment.user.js；用 ADJ_E2E_BUILD 可指定别的产物）
 *
 * 为什么要有这层：功能是「往 B 站的 DOM 里注入节点」，纯函数单测测不到
 * 「选择器能不能命中真实结构」「注入后按钮在不在封面上」这类问题。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, loadUserscript, seedConfig, BUILD_PATH } from './harness.mjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, 'fixtures', 'cards.html')
let server
let browser
let port
before(async () => {
    const html = await readFile(FIXTURE, 'utf8')
    server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    port = server.address().port
    browser = await launchBrowser()
})
after(async () => {
    await browser?.close()
    await new Promise(resolve => server?.close(resolve))
})
/** 打开夹具页并注入产物（开启视频卡片预览） */
const openFixture = async () => {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    // ⚠️ 必须拦掉外部请求：点预览按钮后弹窗里会**真的加载 B 站播放页**（重、占渲染主线程），
    //    放行的话整个页面会被卡住，测出来的超时是环境假象而不是功能缺陷。
    //    只放行夹具页自己与 data: URI（内联图片）。
    await page.setRequestInterception(true)
    page.on('request', req => {
        const url = req.url()
        if (url.startsWith(`http://127.0.0.1:${port}/`) || url.startsWith('data:')) req.continue().catch(() => {})
        else req.abort().catch(() => {})
    })
    await page.goto(`http://127.0.0.1:${port}/cards.html`, { waitUntil: 'domcontentloaded' })
    await seedConfig(page, { home_video_preview: true })
    await loadUserscript(page)
    // 等功能初始化完（样式块出现即代表 initVideoPreviewFeature 已跑）
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        const ready = await page.evaluate(() => !!document.getElementById('VideoPreviewStyle'))
        if (ready) break
        await new Promise(r => setTimeout(r, 200))
    }
    await new Promise(r => setTimeout(r, 800))
    return page
}
test('产物存在（先构建再跑 E2E）', async () => {
    const content = await readFile(BUILD_PATH, 'utf8')
    assert.ok(content.includes('@version'), '产物缺少 @version')
})
test('预览功能开启后：首页 / 播放页 / 热门页的卡片都注入了预览按钮', async () => {
    const page = await openFixture()
    try {
        const report = await page.evaluate(() => {
            const covers = [...document.querySelectorAll('.adj-video-preview-cover')]
            const buttons = [...document.querySelectorAll('.adj-video-preview-btn')]
            return {
                featureEnabled: !!document.getElementById('VideoPreviewStyle'),
                coverCount: covers.length,
                buttonCount: buttons.length,
                // 按钮挂在哪个容器上（封面容器）
                coverClasses: covers.map(c => c.getAttribute('class')),
                // 每个按钮是否都带着 bvid（取不到 bvid 就点不开）
                bvids: buttons.map(b => b.getAttribute('data-adj-preview-bvid')),
                // 按钮是否在封面容器内部
                insideCover: buttons.every(b => !!b.closest('.adj-video-preview-cover'))
            }
        })
        assert.equal(report.featureEnabled, true, '预览功能未启用（样式块缺失）')
        assert.equal(report.coverCount, 3, '封面容器未被标记（首页/播放页/热门页各一个）')
        assert.equal(report.buttonCount, 3, '预览按钮数量不对')
        assert.ok(report.insideCover, '有按钮没挂在封面容器里')
        assert.deepEqual(
            report.bvids.sort(),
            ['BV1GJ411x7h7', 'BV1V4UYY5EhD', 'BV1xrnz6gEVD'],
            '按钮上的 bvid 不对'
        )
        // 首页卡片：封面壳是 .bili-video-card__image--wrap
        assert.ok(report.coverClasses.some(c => c.includes('bili-video-card__image--wrap')), '首页卡片封面没被标记')
        // 播放页相关推荐：封面壳是 .b-img
        assert.ok(report.coverClasses.some(c => c.includes('b-img')), '播放页卡片封面没被标记')
    } finally {
        await page.close()
    }
})
test('预览按钮点得动：点开后会弹出预览弹窗（不会跳转到视频页）', async () => {
    const page = await openFixture()
    try {
        const before = page.url()
        await page.evaluate(() => {
            const btn = document.querySelector('.adj-video-preview-btn')
            btn.click()
        })
        await new Promise(r => setTimeout(r, 1200))
        const after = await page.evaluate(() => {
            const dialog = document.querySelector('.adj-video-preview-dialog')
            const frame = document.querySelector('.adj-video-preview-frame')
            return {
                url: location.href,
                dialogInDom: !!dialog,
                dialogOpen: !!dialog && dialog.matches(':popover-open'),
                frameSrc: frame?.getAttribute('src') || '',
                // 弹窗里的播放器只有一个（不能叠出第二个弹窗）
                dialogCount: document.querySelectorAll('.adj-video-preview-dialog').length
            }
        })
        assert.equal(after.url, before, '点预览按钮却发生了跳转')
        assert.equal(after.dialogInDom, true, '预览弹窗没有打开')
        assert.equal(after.dialogOpen, true, '预览弹窗没有处于打开状态')
        assert.equal(after.dialogCount, 1, '预览弹窗开了不止一个')
        // ⚠️ 只断言 iframe **存在且指向目标视频**，不断言「画面已出」：
        //    弹窗里加载的是真的 B 站播放页，夹具环境把外网请求拦掉了，等不到画面。
        assert.match(after.frameSrc, /BV1\w+/, '预览弹窗里没有指向视频的播放器 iframe')
    } finally {
        await page.close()
    }
})
test('功能关闭时页面上不留任何预览痕迹', async () => {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    await page.goto(`http://127.0.0.1:${port}/cards.html`, { waitUntil: 'domcontentloaded' })
    await seedConfig(page, { home_video_preview: false })
    await loadUserscript(page)
    await new Promise(r => setTimeout(r, 1500))
    const report = await page.evaluate(() => ({
        style: !!document.getElementById('VideoPreviewStyle'),
        buttons: document.querySelectorAll('.adj-video-preview-btn').length,
        covers: document.querySelectorAll('.adj-video-preview-cover').length
    }))
    assert.equal(report.style, false, '关闭时不该注入预览样式')
    assert.equal(report.buttons, 0, '关闭时不该有预览按钮')
    assert.equal(report.covers, 0, '关闭时不该有封面标记')
    await page.close()
})
