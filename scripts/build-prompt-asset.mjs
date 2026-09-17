#!/usr/bin/env node
/**
 * 生成远程提示词文件 dist/ad-detection-prompt.js
 *
 * 为什么由构建脚本生成：提示词真源在 src/shared/ad-detection-prompt.ts，
 * 远程文件必须是**同一份内容**（否则脚本与平台/内置版本会漂移）。
 * 内容其实是 JSON（`{prompt, version, hash, updatedAt}`），扩展名用 .js 只为命中服务器
 * `location ~* ^/UserScripts/.*\.(js|css)$` 这条已放行 `*.bilibili.com` 的 CORS 规则；
 * 脚本端按文本读取后自行 JSON.parse（见 src/services/prompt.service.ts）。
 *
 * 产物随 `npm run build` 一起生成，随后由 `scripts/upload.py` 上传到与 meta.js 同目录。
 * 只想热更提示词、不动脚本产物时：`PROMPT_ONLY=1 python scripts/upload.py`。
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
const outDir = path.join(root, 'dist')
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'ad-detection-prompt.js')
writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8')
console.log(`[prompt-asset] 已生成 ${path.relative(root, outFile)}：v${payload.version} #${hash} ${AD_DETECTION_PROMPT.length} 字`)
