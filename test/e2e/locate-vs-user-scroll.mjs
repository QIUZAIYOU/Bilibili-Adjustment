import { launchBrowser, openWithUserscript } from './harness.mjs'

/**
 * 「自动定位 vs 用户滚动」真浏览器对照探针（2026-11-06，不进 CI）
 *
 * 复现用户回报：页面加载完、用户在往评论区滚，自动定位/补定位却把页面拽回播放器。
 * 断言两件事：① 用户滚过之后脚本不再写滚动（`window.scrollTo` 调用数不再增长）；
 * ② 控制台出现「已让位/跳过定位」的 info 日志（修复前一行都没有）。
 *
 * 跑法：ADJ_E2E_HEADLESS=1 node test/e2e/locate-vs-user-scroll.mjs [url]
 * 退出码 0 = 通过；1 = 又抢了滚动或没有让位日志。
 */
const URL = process.argv[2] || 'https://www.bilibili.com/video/BV1Q5411B7aM'

const browser = await launchBrowser()
try {
    const page = await openWithUserscript(browser, URL, { viewport: { width: 1280, height: 720 }, config: { 'locate_to_player': true } })
    // 插桩：记录脚本自己写的每一次滚动（只统计 ScrollTo，不含用户滚轮引起的 scroll 事件）
    await page.evaluate(() => {
        const real = window.scrollTo.bind(window)
        window.__adjScrollCalls = []
        window.scrollTo = (...args) => {
            window.__adjScrollCalls.push({ at: Date.now(), args })
            return real(...args)
        }
    })
    // 等自动定位开始（页面加载后约 0.8s），然后模拟用户滚轮往下滚
    await new Promise(resolve => setTimeout(resolve, 800))
    const yAtWheel = await page.evaluate(() => window.scrollY)
    await page.mouse.move(640, 400)
    await page.mouse.wheel({ deltaY: 600 })
    const callsAtWheel = await page.evaluate(() => window.__adjScrollCalls.length)
    // 之后 2.5s 内不应该再有新的滚动写入
    await new Promise(resolve => setTimeout(resolve, 2500))
    const after = await page.evaluate(() => window.__adjScrollCalls.length)
    const tail = await page.evaluate(count => window.__adjScrollCalls.slice(-count).map(c => c.args && c.args[0] && c.args[0].top), 8)
    const yAtEnd = await page.evaluate(() => window.scrollY)
    const logs = (page.logs || []).filter(line => /让位|跳过本次定位|停止位置校验|不再安排|补定位收工|位置守卫已释放|定位滚动丨/.test(line))

    console.log(JSON.stringify({ yAtWheel, yAtEnd, callsAtWheel, after, newCalls: after - callsAtWheel, lastScrollTargets: tail, logs: logs.slice(-8) }, null, 2))

    const grabbedAgain = after - callsAtWheel > 0
    const hasYieldLog = logs.length > 0
    if (grabbedAgain) console.error(`✗ 用户滚动后脚本又写了 ${after - callsAtWheel} 次滚动`)
    if (!hasYieldLog) console.error('✗ 没有出现让位日志（用户回报的「日志没有相关信息」）')
    process.exitCode = grabbedAgain || !hasYieldLog ? 1 : 0
} finally {
    await browser.close()
}
