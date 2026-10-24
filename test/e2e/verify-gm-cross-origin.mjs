/**
 * 真实浏览器验证：配置**跨源共享**（GM 存储）+ **跨源实时生效**
 *
 * 要验证的是本次改造的核心承诺：
 *   ① 用户在 www 设的设置，搜索页/动态页/空间页**读到的也是同一份**（不再是各源各自的默认值）；
 *   ② 已经打开的其它源标签页，在设置变化后**立刻**跟着变（不用刷新）。
 *
 * 怎么模拟脚本管理器：真实 GM 存储是**脚本级**的（跨全部匹配页面共享一份），
 * 而页面之间没有同步的 JS 全局。这里把存储放在 **Node 侧**，
 * 通过 browserContext.exposeFunction 暴露一个 Promise 版 GM API 给页面，
 * 再由 Node 侧把变更**广播回各页**（模拟 GM_addValueChangeListener 的跨上下文回调）。
 * 顺带也验证了适配层的 **Promise 版 GM API** 分支。
 *
 * 用法：
 *   node test/e2e/verify-gm-cross-origin.mjs
 *   ADJ_E2E_HEADLESS=1 node test/e2e/verify-gm-cross-origin.mjs
 */
import puppeteer from 'puppeteer'
import { loadUserscript, persistUserscript } from './harness.mjs'
/** 参与验证的页面（不同源 = 不同 IndexedDB = 迁移前各存各的） */
const PAGES = [
    { name: 'www', url: 'https://www.bilibili.com/' },
    { name: 'search', url: 'https://search.bilibili.com/all?keyword=%E5%8A%A8%E7%94%BB' },
    { name: 'dynamic', url: 'https://t.bilibili.com/' }
]
/** 页面侧的 GM 桩安装函数（会被序列化后注入页面） */
const installGmBridge = () => {
    window.unsafeWindow = window
    window.GM_addStyle = css => {
        const style = document.createElement('style')
        style.textContent = css
        ;(document.head || document.documentElement).appendChild(style)
        return style
    }
    window.__gmListeners = new Map()
    let nextListenerId = 1
    window.GM = {
        getValue: key => window.__gmBridge('get', key),
        setValue: (key, value) => window.__gmBridge('set', { key, value }),
        deleteValue: key => window.__gmBridge('delete', key),
        listValues: () => window.__gmBridge('list'),
        getValues: keys => window.__gmBridge('getMany', keys),
        setValues: values => window.__gmBridge('setMany', values),
        addValueChangeListener: (key, handler) => {
            const id = nextListenerId++
            window.__gmListeners.set(id, { key, handler })
            window.__gmBridge('addListener', { token: window.__gmToken, key, id })
            return id
        },
        removeValueChangeListener: id => {
            window.__gmListeners.delete(id)
            window.__gmBridge('removeListener', { token: window.__gmToken, id })
        }
    }
}
const main = async () => {
    // ---- Node 侧的「脚本级」GM 存储 ----
    const gmStore = new Map()
    /** token → Map<键, Set<监听 id>> */
    const gmListeners = new Map()
    const pagesByToken = new Map()
    const notify = async (key, oldValue, newValue) => {
        for (const [token, map] of gmListeners.entries()) {
            const ids = map.get(key)
            if (!ids || !ids.size) continue
            const page = pagesByToken.get(token)
            if (!page || page.isClosed()) continue
            for (const id of ids) {
                page.evaluate(payload => {
                    const entry = window.__gmListeners?.get(payload.id)
                    if (entry) entry.handler(payload.key, payload.oldValue, payload.newValue, true)
                }, { key, id, oldValue, newValue }).catch(() => { /* 页面可能已关 */ })
            }
        }
    }
    const browser = await puppeteer.launch({
        headless: process.env.ADJ_E2E_HEADLESS === '1',
        protocolTimeout: 120000,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio']
    })
    const context = browser.defaultBrowserContext()
    // 说明：Puppeteer v25 的 BrowserContext 没有 exposeFunction，只能逐页暴露；
    // Node 侧的存储与广播是全局的，所以「脚本级共享」的语义不受影响。
    const bridge = async (op, arg) => {
        switch (op) {
            case 'get':
                return gmStore.get(arg)
            case 'set': {
                const oldValue = gmStore.get(arg.key)
                gmStore.set(arg.key, arg.value)
                await notify(arg.key, oldValue, arg.value)
                return undefined
            }
            case 'delete': {
                const oldValue = gmStore.get(arg)
                gmStore.delete(arg)
                await notify(arg, oldValue, undefined)
                return undefined
            }
            case 'list':
                return Array.from(gmStore.keys())
            case 'getMany': {
                const out = {}
                for (const key of arg || []) if (gmStore.has(key)) out[key] = gmStore.get(key)
                return out
            }
            case 'setMany': {
                for (const [key, value] of Object.entries(arg || {})) {
                    const oldValue = gmStore.get(key)
                    gmStore.set(key, value)
                    await notify(key, oldValue, value)
                }
                return undefined
            }
            case 'addListener': {
                if (!gmListeners.has(arg.token)) gmListeners.set(arg.token, new Map())
                const map = gmListeners.get(arg.token)
                if (!map.has(arg.key)) map.set(arg.key, new Set())
                map.get(arg.key).add(arg.id)
                return undefined
            }
            case 'removeListener': {
                const map = gmListeners.get(arg.token)
                map?.get(arg.key)?.delete(arg.id)
                return undefined
            }
            default:
                return undefined
        }
    }
    // 预置配置：等价于「用户在 www 打开视频卡片预览 + 选夜间哔哩」
    gmStore.set('adj.cfg.home_video_preview', { v: true, t: Date.now() })
    gmStore.set('adj.cfg.theme', { v: 'night', t: Date.now() })
    const opened = []
    try {
        for (const target of PAGES) {
            const page = await context.newPage()
            const token = `p${opened.length + 1}`
            pagesByToken.set(token, page)
            const logs = []
            page.on('console', msg => logs.push(msg.text()))
            page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`))
            await page.setViewport({ width: 1600, height: 900 })
            await page.exposeFunction('__gmBridge', bridge)
            await page.evaluateOnNewDocument(t => { window.__gmToken = t }, token)
            console.log(`[verify] 打开 ${target.url}`)
            await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 })
            await page.evaluate(installGmBridge)
            // 持久注入：t.bilibili.com 加载后会自己 reload，addScriptTag 注入的产物会随旧文档消失
            await persistUserscript(page, { gmInstaller: installGmBridge })
            await loadUserscript(page, { gmInstaller: installGmBridge })
            await new Promise(r => setTimeout(r, 8000))
            const info = await page.evaluate(() => ({
                url: location.hostname,
                theme: document.documentElement.getAttribute('data-adj-theme'),
                previewButtons: document.querySelectorAll('.adj-video-preview-btn').length,
                previewStyle: !!document.getElementById('VideoPreviewStyle'),
                // 页面里到底有没有视频卡片（未登录的动态页没有卡片 → 不该有预览按钮）
                videoLinks: document.querySelectorAll('a[href*="/video/"]').length
            }))
            const backendLog = logs.find(l => l.includes('配置后端=')) || ''
            const migrateLog = logs.find(l => l.includes('配置迁移')) || ''
            console.log(`[verify] ${target.name} →`, JSON.stringify(info))
            console.log(`[verify]   ${backendLog.trim()}`)
            if (migrateLog) console.log(`[verify]   ${migrateLog.trim()}`)
            if (!info.theme || !info.previewStyle) {
                console.log(`[verify]   —— ${target.name} 未就绪，完整日志 ——`)
                logs.slice(-25).forEach(l => console.log(`      ${l.slice(0, 220)}`))
            }
            opened.push({ name: target.name, page, info, logs })
        }
        // ---- 断言 ①：三个源读到的配置一致（主题一致 + 预览功能都被打开）----
        console.log('\n[verify] 断言①：各源读到同一份配置')
        let ok = true
        for (const entry of opened) {
            if (entry.info.theme !== 'night') {
                console.log(`  ✗ ${entry.name} 主题是 ${entry.info.theme}，期望 night`)
                ok = false
            }
            if (!entry.info.previewStyle) {
                console.log(`  ✗ ${entry.name} 没启用预览功能（说明没读到共享配置）`)
                ok = false
            }
            // 有视频卡片的页面才该出现预览按钮（未登录的动态页没有卡片）
            if (entry.info.videoLinks > 0 && entry.info.previewButtons <= 0) {
                console.log(`  ✗ ${entry.name} 有 ${entry.info.videoLinks} 个视频链接却没有预览按钮`)
                ok = false
            }
        }
        if (ok) {
            console.log('  ✓ 三个源都读到了同一份配置（主题都是夜间哔哩、预览功能都被打开）')
            opened.forEach(e => console.log(`      ${e.name}：主题=${e.info.theme} 预览按钮=${e.info.previewButtons} 视频链接=${e.info.videoLinks}`))
        }
        // ---- 断言 ②：改配置 → 已打开的其它源立刻跟着变 ----
        console.log('\n[verify] 断言②：改动配置后，其它源标签页实时跟随')
        const target = opened[opened.length - 1]
        const before = target.info.theme
        gmStore.set('adj.cfg.theme', { v: 'follow', t: Date.now() })
        await notify('adj.cfg.theme', { v: 'night' }, { v: 'follow', t: Date.now() })
        await new Promise(r => setTimeout(r, 1500))
        const after = await target.page.evaluate(() => document.documentElement.getAttribute('data-adj-theme'))
        console.log(`  ${target.name} 主题：${before} → ${after}`)
        if (after === before) {
            console.log('  ✗ 别的源改了设置，本页没有实时跟随')
            ok = false
        } else {
            console.log('  ✓ 已打开的其它源标签页实时跟随（无需刷新）')
        }
        console.log(ok ? '\n[verify] 全部通过' : '\n[verify] 存在失败项')
        process.exitCode = ok ? 0 : 1
    } finally {
        await browser.close()
    }
}
main().catch(err => {
    console.error('[verify] 失败：', err.message)
    process.exit(1)
})
