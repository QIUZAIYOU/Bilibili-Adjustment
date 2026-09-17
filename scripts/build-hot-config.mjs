#!/usr/bin/env node
/**
 * 生成热更资产 dist/hot-config/ad-detection-prompt.js
 *
 * 为什么由构建脚本生成：提示词真源在 src/shared/ad-detection-prompt.ts，远程文件必须是**同一份内容**
 * （否则脚本内置兜底版与远端版会漂移）。另外两张覆盖表（selectors / ai-providers）是**人工维护**的，
 * 直接放在仓库 hot-config/ 下由 upload.py 原样上传，不参与构建。
 *
 * 目录约定：服务器上所有「改配置不必发版」的资产都放在与 meta.js 同级的 `hot-config/` 目录里；
 * 文件一律用 `.js` 扩展名，以命中服务器 `location ~* ^/UserScripts/.*\.(js|css)$`
 * 这条已放行 `*.bilibili.com` 的 CORS 规则（内容其实是 JSON，脚本按文本读取后自解析）。
 *
 * 热更（不改脚本产物、用户无感）：`HOT_ONLY=1 python scripts/upload.py`
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { AD_DETECTION_PROMPT } from '../src/shared/ad-detection-prompt.ts'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const hash = createHash('sha256').update(AD_DETECTION_PROMPT).digest('hex').slice(0, 12)
const payload = {
    version: pkg.version,
    hash,
    updatedAt: new Date().toISOString(),
    prompt: AD_DETECTION_PROMPT
}
const outDir = path.join(root, 'dist', 'hot-config')
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'ad-detection-prompt.js')
writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8')
console.log(`[hot-config] 已生成 ${path.relative(root, outFile)}：v${payload.version} #${hash} ${AD_DETECTION_PROMPT.length} 字`)
