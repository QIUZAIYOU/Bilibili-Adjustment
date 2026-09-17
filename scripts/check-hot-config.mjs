#!/usr/bin/env node
/**
 * 热更资产发布前校验（`npm run check:hot-config`，upload.py 上传前自动调用）
 *
 * 为什么需要：远端覆盖表写错时**运行时只会静默丢弃那一条**（用户侧表现为"改了没用"），
 * 排查看日志才知道。所以发布前必须先用**运行时同一套校验代码**过一遍：
 * 装上 DOM 桩 → 侧效导入各 target 模块（它们自注册到 hot-config-registry）
 * → 逐表把文件内容喂给注册表 → 有 rejected 就失败并打印原因。
 *
 * 用法（需走别名 loader，才能解析 `@/` 并补 `.ts` 扩展名）：
 *   node --import ./test/alias-loader.js scripts/check-hot-config.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { installDomStub } from './lib/dom-stub.mjs'
installDomStub()
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
/** 表名 → 仓库内的资产文件（生成物提示词不在这里校验，它由 scripts/build-hot-config.mjs 生成并自检） */
const TABLES = {
    selectors: 'hot-config/selectors.js',
    'ai-providers': 'hot-config/ai-providers.js',
    regexps: 'hot-config/regexps.js',
    templates: 'hot-config/templates.js',
    themes: 'hot-config/themes.js'
}
// 侧效导入：各模块体里 `registerHotConfigTarget(...)` 自注册（顺序无关，与运行时一致）
await import('@/shared/element-selectors')
await import('@/shared/ai-providers')
await import('@/shared/regexps')
await import('@/shared/templates')
await import('@/shared/theme')
const { setHotConfigEntries } = await import('@/shared/hot-config-registry')
const { parseHotConfigPayload } = await import('@/shared/hot-config')
let failed = 0
for (const [table, relativePath] of Object.entries(TABLES)) {
    const filePath = path.join(root, relativePath)
    if (!fs.existsSync(filePath)) {
        console.log(`FAIL ${table}：缺少文件 ${relativePath}`)
        failed++
        continue
    }
    const payload = parseHotConfigPayload(fs.readFileSync(filePath, 'utf8'), table)
    if (!payload) {
        console.log(`FAIL ${table}：不是合法载荷（JSON 解析失败 / table 字段与文件名不一致 / 缺 overrides）`)
        failed++
        continue
    }
    const report = setHotConfigEntries(table, payload.entries, 'remote')
    if (!report) {
        console.log(`FAIL ${table}：该表没有注册热更目标（target 未加载？）`)
        failed++
        continue
    }
    const total = Object.keys(payload.entries).length
    if (report.rejected.length) {
        console.log(`FAIL ${table}：${report.rejected.length}/${total} 条会被运行时丢弃`)
        for (const reason of report.rejected) console.log(`     - ${reason}`)
        failed++
        continue
    }
    console.log(`OK ${table}：${total} 条覆盖全部合法${total ? `（${report.applied.join('，')}）` : '（当前为空）'}`)
}
if (failed) {
    console.log(`\n热更资产校验失败：${failed} 张表。请修正后重试（写错的值运行时会被静默丢弃，用户侧看不到任何提示）。`)
    process.exit(1)
}
console.log('\n热更资产校验通过。')
