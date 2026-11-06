import { launchBrowser, openWithUserscript } from './harness.mjs'

/**
 * 「自动定位 vs 用户滚动」真浏览器对照探针（2026-11-06，不进 CI）
 *
 * 场景 1（让位）：页面加载完、用户在往评论区滚 → 自动定位/补定位不许再把页面拽回播放器。
 * 场景 2（显式定位）：处于让位窗口内点播放器画面 → 必须仍然定位回播放器
 *   （2026-11-06 回归的防线：把 pointerdown 记成滚动意图会让这次点击定位整体失效）。
 *
 * ⚠️ 无头环境里媒体被拦、页面可能很短（`maxScroll` 只有一两百像素），
 * 位置断言只在页面真能滚动时才执行，否则只断言日志（滚动无可滚空间时位置必然不动）。
 *
 * 跑法：ADJ_E2E_HEADLESS=1 node test/e2e/locate-vs-user-scroll.mjs [url]
 * 退出码 0 = 通过；1 = 又抢了滚动 / 没有让位日志 / 点击播放器没定位。
 */
const URL = process.argv[2] || 'https://www.bilibili.com/video/BV1Q5411B7aM'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** 页面至少要有这么多可滚空间，位置断言才有意义 */
const MIN_SCROLL_ROOM = 400

const browser = await launchBrowser()
let failed = false
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
    const readY = () => page.evaluate(() => Math.round(document.scrollingElement.scrollTop))
    const readMaxScroll = () => page.evaluate(() => Math.round(document.documentElement.scrollHeight - window.innerHeight))

    await sleep(800)
    const maxScroll = await readMaxScroll()

    // ---------- 场景 1：用户滚轮往下滚，脚本应让位 ----------
    // ⚠️ 滚轮必须打在**评论区**（画面区域被 B 站播放器接管，它会吞掉 wheel，探针会误判成「没让位」）
    const yAtWheel = await readY()
    await page.mouse.move(640, 660)
    await page.mouse.wheel({ deltaY: 600 })
    const callsAtWheel = await page.evaluate(() => window.__adjScrollCalls.length)
    await sleep(2500)
    const after = await page.evaluate(() => window.__adjScrollCalls.length)
    const tail = await page.evaluate(count => window.__adjScrollCalls.slice(-count).map(c => c.args && c.args[0] && c.args[0].top), 8)
    const yAtEnd = await readY()
    // ⚠️ 关键词要精确：`配置迁移丨写入 0 项，跳过 0 项` 里也有「跳过」、`默认值让位` 里也有「让位」，
    // 用宽泛正则会把启动日志当成让位日志，探针自欺欺人地通过。
    const yieldLogs = (page.logs || []).filter(line =>
        /自动定位丨用户正在自己滚动|自动定位丨用户开始自己滚动|自动定位丨补定位收工|自动定位丨校正超过|播放器点击定位丨用户刚滚动过|选集定位丨位置守卫已释放|定位滚动丨.*让位给用户滚动/.test(line)
    )
    const grabbedAgain = after - callsAtWheel > 0 && yAtEnd < yAtWheel - 50
    if (!yieldLogs.length) {
        failed = true
        console.error('✗ 没有出现让位日志（用户回报的「日志没有相关信息」）')
    }
    if (grabbedAgain) {
        failed = true
        console.error(`✗ 用户滚动后脚本把页面拽回去了（${yAtWheel} → ${yAtEnd}，又写了 ${after - callsAtWheel} 次滚动）`)
    }

    // ---------- 场景 2：让位窗口内点播放器画面，必须仍然定位 ----------
    await page.mouse.move(640, 660)
    for (let i = 0; i < 3; i += 1) await page.mouse.wheel({ deltaY: 800 })
    await sleep(250)
    const yBeforeClick = await readY()
    const playerBox = await page.evaluate(() => {
        const node = document.querySelector('#bilibili-player') || document.querySelector('.bpx-player-container')
        if (!node) return null
        const rect = node.getBoundingClientRect()
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + Math.min(120, rect.height / 3)) }
    })
    if (!playerBox) {
        failed = true
        console.error('✗ 找不到播放器容器，场景 2 无法执行')
    } else {
        await page.mouse.click(playerBox.x, playerBox.y)
        await sleep(1800)
        const yAfterClick = await readY()
        const clickLogs = (page.logs || []).filter(line => /播放器点击定位丨已定位到播放器/.test(line))
        const clickSkipped = (page.logs || []).some(line => /播放器点击定位丨用户刚滚动过/.test(line))
        const movedBack = yAfterClick < yBeforeClick - 100
        if (!clickLogs.length) {
            failed = true
            console.error(`✗ 没有出现「播放器点击定位丨已定位到播放器」日志（点击播放器定位失效；${yBeforeClick} → ${yAfterClick}）`)
        }
        if (clickSkipped) {
            failed = true
            console.error('✗ 点击播放器被当成「用户刚滚动过」跳过（pointerdown 又被误算成滚动意图）')
        }
        // 位置断言只用于留档：无头 + 拦截媒体时，页面滚动根与脚本看到的 `window.scrollY`
        // 会不一致（实测脚本记 0→163，探针读 scrollingElement 却是 2563），拿它对判会误报。
        // 真正的回归防线是上面两条（点了必须真跑一趟定位、且不许被让位短路）+ 单测。
        console.log(JSON.stringify({
            env: { maxScroll },
            scenario1: { yAtWheel, yAtEnd, callsAtWheel, after, newCalls: after - callsAtWheel, lastScrollTargets: tail, logs: yieldLogs.slice(-6) },
            scenario2: { yBeforeClick, yAfterClick, movedBack, skipped: clickSkipped, logs: clickLogs.slice(-3) }
        }, null, 2))
    }
    process.exitCode = failed ? 1 : 0
} finally {
    await browser.close()
}
