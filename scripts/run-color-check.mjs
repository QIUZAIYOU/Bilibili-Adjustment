#!/usr/bin/env node
/**
 * 主题色值门禁的跨平台入口
 *
 * 校验逻辑在 `scripts/check-theme-colors.py`（Python），
 * 但 `npm run check:colors` 原来写死 `python`，在 Linux/macOS 上没有 `python` 命令会直接失败
 * （CI 里因此只能绕开 npm script 直接调 `python3`）。
 * 这里按平台挑选可用的解释器，让文档里写的 `npm run check:colors` 在哪都能跑。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'check-theme-colors.py')
if (!fs.existsSync(script)) {
    console.error(`[check-theme-colors] 找不到校验脚本: ${script}`)
    process.exit(1)
}
const isWindows = process.platform === 'win32'
const candidates = isWindows ? ['python', 'python3'] : ['python3', 'python']
let chosen = null
for (const command of candidates) {
    const probe = spawnSync(command, ['--version'], { encoding: 'utf-8' })
    if (probe.status === 0) {
        chosen = command
        break
    }
}
if (!chosen) {
    console.error('[check-theme-colors] 未找到 Python 解释器（试过: ' + candidates.join(', ') + '）')
    process.exit(1)
}
const result = spawnSync(chosen, [script, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
