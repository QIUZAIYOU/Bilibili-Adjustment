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
/**
 * GM 桩：油猴沙箱里这些是脚本管理器提供的，裸页面里没有
 *
 * 除 unsafeWindow / GM_addStyle 外，还桩出**GM 存储**（GM_getValue/GM_setValue/...）：
 * 用户配置现在存在脚本管理器存储里（脚本级，跨全部匹配页面共享一份），
 * 不桩的话脚本会判定 GM 不可用并回落 IndexedDB —— e2e 就测不到真实路径了。
 *
 * 语义对齐真实 GM：只有别的上下文写入才回调监听器（remote=true）。
 */
const installGmStubsOn = () => {
    const scope = window
    scope.unsafeWindow = scope
    scope.GM_addStyle = css => {
        const style = scope.document.createElement('style')
        style.textContent = css
        ;(scope.document.head || scope.document.documentElement).appendChild(style)
        return style
    }
    if (!scope.__gmStore) {
        scope.__gmStore = { values: new Map(), listeners: new Map(), nextId: 1 }
    }
    const store = scope.__gmStore
    scope.GM_getValue = key => store.values.get(key)
    scope.GM_setValue = (key, value) => { store.values.set(key, value) }
    scope.GM_deleteValue = key => { store.values.delete(key) }
    scope.GM_listValues = () => Array.from(store.values.keys())
    scope.GM_getValues = keys => {
        const out = {}
        for (const key of keys) if (store.values.has(key)) out[key] = store.values.get(key)
        return out
    }
    scope.GM_setValues = entries => {
        for (const [key, value] of Object.entries(entries)) store.values.set(key, value)
    }
    scope.GM_addValueChangeListener = (key, handler) => {
        const id = store.nextId++
        if (!store.listeners.has(key)) store.listeners.set(key, new Map())
        store.listeners.get(key).set(id, handler)
        return id
    }
    scope.GM_removeValueChangeListener = id => {
        for (const map of store.listeners.values()) map.delete(id)
    }
}
/** 装 GM 桩（当前文档 + 之后的所有导航） */
export const installGmStubs = async (page, installer = installGmStubsOn) => {
    // ⚠️ 必须**立刻**在当前文档里装上：产物是导航之后才注入的，
    //    此时 evaluateOnNewDocument 已经错过本次导航（它只对之后的导航生效）。
    //    少这一步 `unsafeWindow` 会是 undefined（脚本会退化成用页面 window，多数功能仍正常，
    //    但与真实油猴环境不一致，容易掩盖问题）。
    await page.evaluate(installer)
    await page.evaluateOnNewDocument(installer)
}
/**
 * 把产物注册为「每次导航都注入」
 *
 * 用途：像 t.bilibili.com 这种页面会在加载后自己 reload/重定向，
 * 用 addScriptTag 注入的产物会随旧文档一起消失（探针读不到任何脚本痕迹）。
 * 注册到 evaluateOnNewDocument 后，每次导航都会重新注入。
 *
 * 注意：当前文档仍需再走一次 loadUserscript（evaluateOnNewDocument 只对之后的导航生效）。
 */
export const persistUserscript = async (page, options = {}) => {
    const gmInstaller = options.gmInstaller || installGmStubsOn
    const [systemJs, namedRegister, userJs] = await Promise.all([
        readText(path.join(ROOT, 'node_modules/systemjs/dist/system.min.js')),
        readText(path.join(ROOT, 'node_modules/systemjs/dist/extras/named-register.min.js')),
        readText(BUILD_PATH)
    ])
    await installGmStubs(page, gmInstaller)
    await page.evaluateOnNewDocument(payload => {
        const inject = content => {
            const script = document.createElement('script')
            script.textContent = content
            ;(document.head || document.documentElement).appendChild(script)
        }
        // ⚠️ 必须等 DOM 就绪：文档起始阶段 document.head 还是 null，
        //    脚本里的样式注入（document.head.appendChild）会直接抛错，一进页面就死
        const start = () => {
            inject(payload.systemJs)
            inject(payload.namedRegister)
            window.System = new window.System.constructor()
            inject(payload.userJs)
        }
        if (document.head) start()
        else document.addEventListener('DOMContentLoaded', start, { once: true })
    }, { systemJs, namedRegister, userJs })
}
/**
 * 载入 SystemJS 运行时 + named-register 扩展 + 产物
 * @param {import('puppeteer').Page} page
 * @param {{ gmInstaller?: Function }} options 自定义 GM 桩安装函数（默认用页面内的 Map 版）
 */
export const loadUserscript = async (page, options = {}) => {
    const gmInstaller = options.gmInstaller || installGmStubsOn
    const [systemJs, namedRegister, userJs] = await Promise.all([
        readText(path.join(ROOT, 'node_modules/systemjs/dist/system.min.js')),
        readText(path.join(ROOT, 'node_modules/systemjs/dist/extras/named-register.min.js')),
        readText(BUILD_PATH)
    ])
    await installGmStubs(page, gmInstaller)
    await page.addScriptTag({ content: systemJs })
    await page.addScriptTag({ content: namedRegister })
    // meta 里 @require 的 data: URI：换一个新的 System 实例，避免与页面自身的 SystemJS 冲突
    await page.evaluate(() => { window.System = new window.System.constructor() })
    await page.addScriptTag({ content: userJs })
}
/**
 * 播种用户配置（GM 存储）
 *
 * 存储格式见 src/services/gm-storage.service.ts：
 *   键 `adj.cfg.<配置键>` → 值 `{ v: 裸值, t: 写入时间戳 }`
 * @param {import('puppeteer').Page} page
 * @param {Record<string, unknown>} entries 键值对
 */
export const seedConfig = async (page, entries) => {
    await page.evaluate(installGmStubsOn)
    await page.evaluate(entries => {
        const store = window.__gmStore
        for (const [key, value] of Object.entries(entries)) {
            store.values.set('adj.cfg.' + key, { v: value, t: Date.now() })
        }
    }, entries)
}
/**
 * 播种**旧库**（IndexedDB）里的用户配置 —— 用于验证「IndexedDB → GM 存储」迁移
 *
 * 存储结构见 src/services/storage.service.ts：
 *   库 `BilibiliAdjustmentUserConfigs` v2 → 对象仓库 `keyval`（keyPath 'key'）
 *   记录形态 `{ key, value, timestamp }`
 * @param {import('puppeteer').Page} page
 * @param {Record<string, unknown>} entries 键值对
 */
export const seedLegacyConfig = async (page, entries) => {
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
/** 读取 GM 存储里的全部配置（键 → 裸值） */
export const readGmConfig = async page => {
    await page.evaluate(installGmStubsOn)
    return page.evaluate(() => {
        const out = {}
        for (const [key, record] of window.__gmStore.values.entries()) {
            if (!key.startsWith('adj.cfg.')) continue
            out[key.slice('adj.cfg.'.length)] = record?.v
        }
        return out
    })
}
/**
 * 读取 GM 存储里的原始记录（键 → { v, t, d? }）
 * d 标记「这条是默认值补齐，不是用户显式设置」—— 迁移裁决靠它让位
 */
export const readGmRecords = async page => {
    await page.evaluate(installGmStubsOn)
    return page.evaluate(() => {
        const out = {}
        for (const [key, record] of window.__gmStore.values.entries()) {
            if (!key.startsWith('adj.cfg.')) continue
            out[key.slice('adj.cfg.'.length)] = { v: record?.v, t: record?.t, d: record?.d ?? null }
        }
        return out
    })
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
