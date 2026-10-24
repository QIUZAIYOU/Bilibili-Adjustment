/**
 * 真实浏览器验证：把**最新构建产物**注入真实的 B 站页面
 *
 * 用途：替代「装到油猴扩展里再刷新」那套人工流程，做到一条命令跑完。
 *
 * 做法（关键在「独立实例 + 禁用扩展」）：
 *   ① 用 puppeteer 起一个**独立实例**（干净配置，或按需复制源浏览器的配置）；
 *   ② `--disable-extensions`：**油猴扩展不加载** → 只有我们注入的这一份脚本在跑，
 *      不存在「新旧两份脚本同时在页面上打架」的双实例问题；
 *   ③ 按油猴的加载顺序注入产物（SystemJS + GM 桩），然后在真实 DOM 上核查。
 *
 * ⚠️ 源浏览器的 **Cookies 是被 Chrome 独占锁着的**，运行中复制会失败（EBUSY）。
 *    所以登录态默认**不复制**（验证「预览按钮 / 侧栏头像」这类功能不需要登录）；
 *    需要登录态时，把浏览器关掉后再复制，或改用 ADJ_E2E_PROFILE 指定一份静态副本。
 *
 * 用法：
 *   node test/e2e/verify-real-browser.mjs                       # 默认跑播放页 + 首页
 *   node test/e2e/verify-real-browser.mjs https://www.bilibili.com/video/BVxxxx/
 *
 * 环境变量：
 *   ADJ_E2E_PROFILE  源浏览器用户数据目录（设了才尝试复制登录态）
 *   ADJ_E2E_EXE      浏览器可执行文件（默认用 puppeteer 自带的 Chromium）
 *   ADJ_E2E_HEADLESS 设成 1 时用无头模式
 *   ADJ_E2E_KEEP     设成 1 时保留临时配置目录（排查用）
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer'
import { loadUserscript, seedConfig } from './harness.mjs'
const DEFAULT_URLS = [
    'https://www.bilibili.com/video/BV1GJ411x7h7/',
    'https://www.bilibili.com/'
]
/** 源浏览器配置目录（设了才尝试复制登录态；运行中的浏览器锁着 Cookies，通常会失败） */
const SOURCE_PROFILE = process.env.ADJ_E2E_PROFILE || ''
/** 浏览器可执行文件（默认用 puppeteer 自带的 Chromium） */
const SOURCE_EXE = process.env.ADJ_E2E_EXE || ''
/** 需要从源配置里搬过来的东西（其余几十 GB 的缓存用不上） */
const PROFILE_ITEMS = [
    { from: 'Local State', to: 'Local State', type: 'file' },
    { from: 'Default\\Preferences', to: 'Default\\Preferences', type: 'file' },
    { from: 'Default\\Network\\Cookies', to: 'Default\\Network\\Cookies', type: 'file' },
    { from: 'Default\\Local Storage', to: 'Default\\Local Storage', type: 'dir' },
    { from: 'Default\\Session Storage', to: 'Default\\Session Storage', type: 'dir' },
    { from: 'Default\\WebStorage', to: 'Default\\WebStorage', type: 'dir' },
    // 我们的脚本配置在页面源的 IndexedDB 里（脚本跑在页面 origin 的沙箱中）
    { from: 'Default\\IndexedDB\\https_www.bilibili.com_0.indexeddb.leveldb', to: 'Default\\IndexedDB\\https_www.bilibili.com_0.indexeddb.leveldb', type: 'dir' },
    { from: 'Default\\IndexedDB\\https_www.bilibili.com_0.indexeddb.blob', to: 'Default\\IndexedDB\\https_www.bilibili.com_0.indexeddb.blob', type: 'dir' }
]
/**
 * 复制一棵目录树（Windows 上 Chrome **独占锁**着 Cookies / LevelDB 这些文件，
 * 普通 fs.cp 会 EBUSY；改用 .NET 以 FileShare.ReadWrite 打开再拷贝）
 */
const copyTreeShared = (from, to) => {
    const q = s => `'${String(s).replace(/'/g, "''")}'`
    const script = `$ErrorActionPreference='Stop'
$from=${q(from)}
$to=${q(to)}
function Copy-Shared($src, $dest) {
  $dir = Split-Path $dest -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $s = [System.IO.File]::Open($src, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $d = [System.IO.File]::Create($dest)
  $s.CopyTo($d)
  $d.Close()
  $s.Close()
}
if (Test-Path -LiteralPath $from -PathType Leaf) {
  Copy-Shared $from $to
} else {
  Get-ChildItem -LiteralPath $from -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($from.Length).TrimStart([char]92)
    Copy-Shared $_.FullName (Join-Path $to $rel)
  }
}`
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'pipe' })
}
/** 把源配置里需要的那几项复制到临时目录 */
const prepareProfile = async dest => {
    const missing = []
    for (const item of PROFILE_ITEMS) {
        const from = path.join(SOURCE_PROFILE, item.from)
        if (!fs.existsSync(from)) {
            missing.push(item.from)
            continue
        }
        copyTreeShared(from, path.join(dest, item.to))
    }
    return missing
}
/** 在真实页面里核查我们关心的东西 */
const probe = () => {
    const buttons = [...document.querySelectorAll('.adj-video-preview-btn')]
    const covers = [...document.querySelectorAll('.adj-video-preview-cover')]
    const avatar = document.querySelector('.adj-sidenav-up-avatar')
    const avatarStyle = avatar ? getComputedStyle(avatar) : null
    const styleBlock = !!document.getElementById('VideoPreviewStyle')
    return {
        url: location.href,
        预览按钮: buttons.length,
        封面容器: covers.length,
        预览样式块: styleBlock,
        按钮样例: buttons.slice(0, 3).map(b => b.getAttribute('data-adj-preview-bvid')),
        头像存在: !!avatar,
        头像margin: avatarStyle ? avatarStyle.margin : null,
        头像圆角: avatarStyle ? avatarStyle.borderRadius : null,
        头像尺寸: avatar ? [avatar.offsetWidth, avatar.offsetHeight] : null,
        侧栏条目数: document.querySelectorAll('.fixed-sidenav-storage-item').length,
        页面视频链接: document.querySelectorAll('a[href*="/video/"]').length
    }
}
const main = async () => {
    const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS
    if (SOURCE_EXE && !fs.existsSync(SOURCE_EXE)) throw new Error(`找不到浏览器可执行文件：${SOURCE_EXE}`)
    const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'adj-profile-'))
    if (SOURCE_PROFILE) {
        console.log(`[verify] 复制配置：${SOURCE_PROFILE} → ${dest}`)
        try {
            const missing = await prepareProfile(dest)
            if (missing.length) console.log(`[verify] 源配置里没有（跳过）：${missing.join(', ')}`)
        } catch (err) {
            // 运行中的浏览器锁着 Cookies 等文件，复制失败不致命（登录态不是必需的）
            console.log(`[verify] 复制配置失败（忽略，登录态不可用）：${err.message.split('\n')[0]}`)
        }
    } else {
        console.log('[verify] 使用干净配置（不复制登录态：验证这两项功能不需要登录）')
    }
    const browser = await puppeteer.launch({
        executablePath: SOURCE_EXE || undefined,
        userDataDir: dest,
        headless: process.env.ADJ_E2E_HEADLESS === '1',
        protocolTimeout: 60000,
        args: [
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--mute-audio'
        ]
    })
    const report = []
    try {
        for (const url of urls) {
            const page = await browser.newPage()
            const logs = []
            page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`))
            page.on('pageerror', err => logs.push(`[pageerror] ${err.message.slice(0, 200)}`))
            await page.setViewport({ width: 1600, height: 900 })
            console.log(`[verify] 打开 ${url}`)
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await new Promise(r => setTimeout(r, 3000))
            // 显式播种脚本配置：复制来的 IndexedDB 是运行中的一致性快照，可能没带上这个键；
            // 预览功能默认是关的，不播种就测不到「按钮有没有注入」
            await seedConfig(page, { home_video_preview: true })
            await loadUserscript(page)
            // 给注入与增量扫描留时间
            await new Promise(r => setTimeout(r, 4000))
            const info = await page.evaluate(probe)
            report.push({ info, logs: logs.slice(-12) })
            console.log(`[verify] ${url}`)
            console.log(JSON.stringify(info, null, 2))
            const shot = path.join(os.tmpdir(), `adj-verify-${new URL(url).hostname}-${Date.now()}.png`)
            await page.screenshot({ path: shot })
            console.log(`[verify] 截图：${shot}`)
            await page.close()
        }
    } finally {
        await browser.close()
        if (!process.env.ADJ_E2E_KEEP) await fsp.rm(dest, { recursive: true, force: true })
    }
    const failed = report.filter(r => r.logs.some(l => l.startsWith('[pageerror]')))
    if (failed.length) {
        console.log('[verify] 有页面异常：')
        failed.forEach(r => console.log(r.logs.filter(l => l.startsWith('[pageerror]')).join('\n')))
    }
}
main().catch(err => {
    console.error('[verify] 失败：', err.message)
    process.exit(1)
})
