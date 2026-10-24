/**
 * 端到端测试台（把构建产物真正注入页面）
 *
 * 为什么需要它：油猴脚本是「产物 + SystemJS 运行时 + GM 环境」三件套，
 * 光靠 jsdom 测不到「产物在真浏览器里跑起来是什么样」。
 * 这里把 dist/ 的产物按油猴的加载顺序注入浏览器：
 *   ① SystemJS 运行时（system.min.js）
 *   ② named-register 扩展（extras/named-register.min.js）
 *   ③ `System = new System.constructor()`（meta 里 @require 的 data: URI 干的就是这件事）
 *   ④ 产物本体
 * 再补上 GM 桩（unsafeWindow / GM_addStyle）与配置播种（IndexedDB）。
 *
 * 产物里的 System.register 用的是**命名注册**（`System.register("./__entry.js", …)`），
 * 而末尾的 `System.import("./__entry.js", "./")` 故意传了个非法父 URL，
 * 解析失败后回落到命名注册表 —— 所以**不依赖页面真实地址**，任意页面都能跑。
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
/** 产物路径（默认构建产物；可用 ADJ_E2E_BUILD 指定别的） */
export const BUILD_PATH = process.env.ADJ_E2E_BUILD || path.join(ROOT, 'dist', 'bilibili-adjustment.user.js')
const readText = p => readFile(p, 'utf8')
/** 载入 SystemJS 运行时 + named-register 扩展 + 产物 */
export const loadUserscript = async page => {
    const [systemJs, namedRegister, userJs] = await Promise.all([
        readText(path.join(ROOT, 'node_modules/systemjs/dist/system.min.js')),
        readText(path.join(ROOT, 'node_modules/systemjs/dist/extras/named-register.min.js')),
        readText(BUILD_PATH)
    ])
    // GM 桩：油猴沙箱里这两个是脚本管理器提供的，裸页面里没有
    const installGmStubs = () => {
        window.unsafeWindow = window
        window.GM_addStyle = css => {
            const style = document.createElement('style')
            style.textContent = css
            ;(document.head || document.documentElement).appendChild(style)
            return style
        }
    }
    // ⚠️ 必须**立刻**在当前文档里装上：产物是导航之后才注入的，
    //    此时 evaluateOnNewDocument 已经错过本次导航（它只对之后的导航生效）。
    //    少这一步 `unsafeWindow` 会是 undefined（脚本会退化成用页面 window，多数功能仍正常，
    //    但与真实油猴环境不一致，容易掩盖问题）。
    await page.evaluate(installGmStubs)
    await page.evaluateOnNewDocument(installGmStubs)
    await page.addScriptTag({ content: systemJs })
    await page.addScriptTag({ content: namedRegister })
    // meta 里 @require 的 data: URI：换一个新的 System 实例，避免与页面自身的 SystemJS 冲突
    await page.evaluate(() => { window.System = new window.System.constructor() })
    await page.addScriptTag({ content: userJs })
}
/**
 * 播种用户配置（IndexedDB）
 *
 * 存储结构见 src/services/storage.service.ts：
 *   库 `BilibiliAdjustmentUserConfigs` v2 → 对象仓库 `keyval`（keyPath 'key'）
 *   记录形态 `{ key, value, timestamp }`
 * @param {import('puppeteer').Page} page
 * @param {Record<string, unknown>} entries 键值对
 */
export const seedConfig = async (page, entries) => {
    await page.evaluate(async entries => {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('BilibiliAdjustmentUserConfigs', 2)
            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains('keyval')) {
                    const store = db.createObjectStore('keyval', { keyPath: 'key' })
                    store.createIndex('by_timestamp', 'timestamp', { unique: false })
                }
            }
            request.onsuccess = () => {
                const db = request.result
                const tx = db.transaction('keyval', 'readwrite')
                const store = tx.objectStore('keyval')
                for (const [key, value] of Object.entries(entries)) {
                    store.put({ key, value, timestamp: Date.now() })
                }
                tx.oncomplete = () => { db.close(); resolve() }
                tx.onerror = () => reject(tx.error)
            }
            request.onerror = () => reject(request.error)
        })
    }, entries)
}
/** 播种 sessionStorage（B 站播放器写的当前视频信息，用于侧栏头像的作者昵称/头像） */
export const seedSessionStorage = async (page, entries) => {
    await page.evaluate(entries => {
        for (const [key, value] of Object.entries(entries)) {
            sessionStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
        }
    }, entries)
}
/** 打开一个页面并注入产物（配置先播种、后注入，顺序与真实使用一致） */
export const openWithUserscript = async (browser, url, { config = {}, session = {}, viewport = { width: 1600, height: 900 }, blockMedia = true } = {}) => {
    const page = await browser.newPage()
    await page.setViewport(viewport)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')
    // 收集页面日志：脚本里出问题时只有这里能看到（logger 走 console）
    const logs = []
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
    page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`))
    page.logs = logs
    // ⚠️ 必须在导航**之前**拦：视频页的播放器（软件 WebGL + 媒体解码）会把主线程占死，
    //    页面一旦卡住，MutationObserver 的回调与 setTimeout 都不会再跑，
    //    测出来的「按钮没出现」是环境假象，不是功能缺陷。
    if (blockMedia) {
        await page.setRequestInterception(true)
        page.on('request', req => {
            const type = req.resourceType()
            if (type === 'media' || type === 'font') req.abort().catch(() => {})
            else req.continue().catch(() => {})
        })
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (Object.keys(config).length) await seedConfig(page, config)
    if (Object.keys(session).length) await seedSessionStorage(page, session)
    await loadUserscript(page)
    return page
}
/** 启动浏览器（有头模式便于肉眼确认，CI 里可设 ADJ_E2E_HEADLESS=1） */
export const launchBrowser = (options = {}) => puppeteer.launch({
    // 用**新版** headless（不是 'shell'）：旧 headless 没有 GPU，B 站播放器会退化到软件 WebGL
    // 并把主线程占死，测出来的结果全是环境假象
    headless: process.env.ADJ_E2E_HEADLESS === '1' ? true : false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio'],
    ...options
})
/** 轮询等待条件成立 */
export const waitFor = async (fn, { timeout = 20000, interval = 300, label = '条件' } = {}) => {
    const deadline = Date.now() + timeout
    let last
    while (Date.now() < deadline) {
        last = await fn()
        if (last) return last
        await new Promise(r => setTimeout(r, interval))
    }
    throw new Error(`等待超时（${timeout}ms）：${label}`)
}
