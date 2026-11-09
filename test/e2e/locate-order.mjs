import { launchBrowser, openWithUserscript } from './harness.mjs'

/**
 * 「切换播放模式前先定位一次」顺序探针（2026-11-09，不进 CI）
 *
 * 用户回报：功能执行顺序不对 —— 切模式之前先定位一次，切完又定位一次，
 * 正常应该只有「模式切换成功」之后的那一次。根因是水合期 `data-screen`
 * 尚未稳定，`autoSelectPlayerMode` 的「无需切换」分支按旧几何直接发了
 * VIDEO_PLAYER_MODE_SELECTED。
 *
 * 断言（控制台日志）：
 * - 至少出现 1 条 `自动定位丨开始`；
 * - 第一条 `自动定位丨开始` 出现在 `屏幕模式丨已确认` 之后；
 * - 整次加载只有 1 条 `自动定位丨开始`。
 *
 * 跑法：npm run build && ADJ_E2E_HEADLESS=1 node test/e2e/locate-order.mjs [url]
 * 退出码 0 = 通过；1 = 顺序不对 / 定位跑了不止一次。
 */
const URL = process.argv[2] || 'https://www.bilibili.com/video/BV1Q5411B7aM'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const SETTLE_MS = 6000

const browser = await launchBrowser()
let failed = false
try {
    const page = await openWithUserscript(browser, URL, { viewport: { width: 1280, height: 720 }, config: { 'locate_to_player': true } })
    await sleep(SETTLE_MS)
    const logs = page.logs || []
    const modeIndex = logs.findIndex(line => /屏幕模式丨已确认/.test(line))
    const locateStarts = logs
        .map((line, index) => ({ line, index }))
        .filter(item => /自动定位丨开始/.test(item.line))

    if (!locateStarts.length) {
        failed = true
        console.error('✗ 没有出现「自动定位丨开始」日志（定位根本没跑，或日志级别不含 info）')
    }
    if (modeIndex < 0) {
        failed = true
        console.error('✗ 没有出现「屏幕模式丨已确认」日志（模式选择没跑）')
    } else if (locateStarts.length && locateStarts[0].index < modeIndex) {
        failed = true
        console.error(`✗ 第一次定位发生在模式确认之前（定位 #${locateStarts[0].index} < 模式 #${modeIndex}）`)
    }
    if (locateStarts.length > 1) {
        failed = true
        console.error(`✗ 整次加载定位了 ${locateStarts.length} 次（预期 1 次）`)
    }

    console.log(`模式确认日志序号：${modeIndex}`)
    locateStarts.forEach((item, i) => console.log(`定位 #${i + 1}：${item.line}`))
    if (failed) {
        console.error('--- 相关日志 ---')
        logs.filter(line => /屏幕模式丨|自动定位丨|视频资源丨/.test(line)).forEach(line => console.error(line))
    }
} finally {
    await browser.close()
}
process.exit(failed ? 1 : 0)
