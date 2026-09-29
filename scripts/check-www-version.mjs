#!/usr/bin/env node
/**
 * 发布前校验「www 落地页」是否已跟当前版本同步（2026-09-29 加）
 *
 * 为什么需要它：落地页版本号/更新日志是**手工维护**的，历史上有多个版本发完却忘了同步
 * （实测 3.36.5 之后一直停在 v3.36.5，直到 3.37.0 才发现），而 `upload.py` 只在文件变化时才上传，
 * 「没改就跳过」看起来一切正常 —— 静默漏更新。这里把它变成硬门禁：三处必须与 `package.json` 一致。
 *
 * 校验三处：
 * 1. 顶部导航的品牌版本号 `.brand-version`
 * 2. 首屏 meta 里的版本号（`.hero-meta` 内）
 * 3. 更新日志列表**最新一条**的 `.cl-version`（并要求它等于当前版本，防止顺序写反/漏加）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const html = readFileSync(join(root, 'www', 'index.html'), 'utf8')
const problems = []
const expect = `v${version}`
const brand = html.match(/<span class="brand-version">\s*([^<]+?)\s*<\/span>/)?.[1]
if (brand !== expect) problems.push(`顶部品牌版本号是 ${brand ?? '（没找到）'}，应为 ${expect}`)
const heroMeta = html.match(/<div class="hero-meta mono">([\s\S]*?)<\/div>/)?.[1] ?? ''
const heroVersion = heroMeta.match(/<span>\s*(v[\d.]+)\s*<\/span>/)?.[1]
if (heroVersion !== expect) problems.push(`首屏 meta 版本号是 ${heroVersion ?? '（没找到）'}，应为 ${expect}`)
const firstChangelog = html.match(/<span class="cl-version mono">\s*(v[\d.]+)\s*<\/span>/)?.[1]
if (firstChangelog !== expect) problems.push(`更新日志最新一条是 ${firstChangelog ?? '（没找到）'}，应为 ${expect}`)
if (problems.length) {
    console.error(`[check-www-version] 落地页未与当前版本 ${expect} 同步：`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('  请更新 www/index.html：品牌版本号、首屏 meta 版本号，并在更新日志顶部补一条本版说明。')
    process.exit(1)
}
console.log(`[check-www-version] 通过：落地页三处版本号均为 ${expect}`)
