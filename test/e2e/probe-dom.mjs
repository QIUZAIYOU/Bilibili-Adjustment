/**
 * DOM 探针：打开真实页面，打印某个选择器命中的结构
 *
 * 用途：B 站改版频繁，选择器一失效就得重新看真实 DOM。
 *      这个脚本把「某个选择器命中几个、外层结构长什么样」一次性打印出来，
 *      比反复写一次性探针快得多。
 *
 * 用法：
 *   node test/e2e/probe-dom.mjs <url> [选择器] [最大条数]
 *   node test/e2e/probe-dom.mjs https://www.bilibili.com/video/BVxxx/ .rec-list 2
 *
 * 环境变量：
 *   ADJ_E2E_PROFILE  源浏览器用户数据目录（设了才尝试复制登录态）
 *   ADJ_E2E_HEADLESS 设成 1 时用无头模式
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer'
const SOURCE_PROFILE = process.env.ADJ_E2E_PROFILE || ''
/** 需要从源配置里搬过来的东西（其余缓存用不上） */
const PROFILE_ITEMS = [
    { from: 'Local State', to: 'Local State' },
    { from: 'Default\\Preferences', to: 'Default\\Preferences' },
    { from: 'Default\\Network\\Cookies', to: 'Default\\Network\\Cookies' },
    { from: 'Default\\Local Storage', to: 'Default\\Local Storage' }
]
/** Windows 上 Chrome 独占锁着 Cookies 等文件，常规复制会 EBUSY；用 FileShare.ReadWrite 打开 */
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
const prepareProfile = dest => {
    for (const item of PROFILE_ITEMS) {
        const from = path.join(SOURCE_PROFILE, item.from)
        if (!fs.existsSync(from)) continue
        copyTreeShared(from, path.join(dest, item.to))
    }
}
const main = async () => {
    const [url, selector = '.rec-list', limit = '2'] = process.argv.slice(2)
    if (!url) throw new Error('用法：node test/e2e/probe-dom.mjs <url> [选择器] [最大条数]')
    const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'adj-probe-'))
    if (SOURCE_PROFILE) {
        try {
            prepareProfile(dest)
        } catch (err) {
            console.log(`[probe] 复制配置失败（忽略）：${err.message.split('\n')[0]}`)
        }
    }
    const browser = await puppeteer.launch({
        userDataDir: dest,
        headless: process.env.ADJ_E2E_HEADLESS === '1',
        protocolTimeout: 60000,
        args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check', '--mute-audio']
    })
    try {
        const page = await browser.newPage()
        await page.setViewport({ width: 1600, height: 900 })
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await new Promise(r => setTimeout(r, 4000))
        const report = await page.evaluate((selector, limit) => {
            const hits = [...document.querySelectorAll(selector)]
            const cut = el => {
                const html = el.outerHTML
                return html.length > 3000 ? html.slice(0, 3000) + ' …(截断)' : html
            }
            return {
                url: location.href,
                命中数: hits.length,
                样本: hits.slice(0, Number(limit)).map(cut),
                // 顺带统计常见的卡片结构，方便对照
                统计: {
                    '.rec-list': document.querySelectorAll('.rec-list').length,
                    '.card-box': document.querySelectorAll('.card-box').length,
                    '.b-img': document.querySelectorAll('.b-img').length,
                    '.bili-video-card': document.querySelectorAll('.bili-video-card').length,
                    'a[href*="/video/"]': document.querySelectorAll('a[href*="/video/"]').length
                }
            }
        }, selector, limit)
        console.log(JSON.stringify(report, null, 2))
    } finally {
        await browser.close()
        if (!process.env.ADJ_E2E_KEEP) await fsp.rm(dest, { recursive: true, force: true })
    }
}
main().catch(err => {
    console.error('[probe] 失败：', err.message)
    process.exit(1)
})
