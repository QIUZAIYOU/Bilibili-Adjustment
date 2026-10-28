#!/usr/bin/env node
/**
 * 把构建产物同步到脚本猫（ScriptCat）里已安装的同名脚本。
 *
 * 用法：
 *   node scripts/sync-scriptcat.mjs            # 尽力同步：环境不全时只提示、不失败（供 build 链调用）
 *   node scripts/sync-scriptcat.mjs --strict   # 同步失败即退出码 1（手动排查时用）
 *
 * 前提（见 https://docs.scriptcat.org/docs/use/external-access/）：
 *   1. 已安装 sctl（`%LOCALAPPDATA%\sctl\bin\sctl.exe`，或设 SCTL_BIN）；
 *   2. `sctl serve` 常驻运行；
 *   3. 脚本猫扩展「设置 → 工具 → 外部接入」已开启并完成配对（`sctl status` 显示 extension connected: true）。
 *
 * 退出码约定（与 sctl 对齐）：0 成功或跳过；1 被拒绝；2 请求过期/取消；3 其他错误。
 * 跳过（CI、未装 sctl、daemon 未连、扩展未配对）一律按 0 处理，避免打断构建与发布流程。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distScript = path.join(rootDir, 'dist', 'bilibili-adjustment.user.js')
const strict = process.argv.includes('--strict')
/** 安装请求要等浏览器确认，给足时间；超时按「未确认」处理 */
const INSTALL_TIMEOUT_MS = 180_000
const STATUS_TIMEOUT_MS = 15_000
const log = message => console.log(`[sync-scriptcat] ${message}`)
const skip = message => {
    log(`跳过：${message}`)
    process.exit(0)
}
const fail = message => {
    console.error(`[sync-scriptcat] ${message}`)
    process.exit(strict ? 1 : 0)
}
/** 找到 sctl 可执行文件：SCTL_BIN → Windows 默认安装位置 → PATH */
const resolveSctl = () => {
    const candidates = [process.env.SCTL_BIN]
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'sctl', 'bin', 'sctl.exe'))
    }
    candidates.push('sctl')
    for (const candidate of candidates) {
        if (!candidate) continue
        if (candidate !== 'sctl' && !fs.existsSync(candidate)) continue
        try {
            execFileSync(candidate, ['version'], { stdio: 'ignore', timeout: STATUS_TIMEOUT_MS })
            return candidate
        } catch {
            continue
        }
    }
    return null
}
/** 执行 sctl 并同时收集 stdout/stderr 与退出码（sctl 的退出码承载语义，不能只看是否抛错） */
const runSctl = (sctl, args, timeout) => {
    try {
        const stdout = execFileSync(sctl, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe']})
        return { code: 0, stdout, stderr: '' }
    } catch (error) {
        return {
            code: typeof error.status === 'number' ? error.status : 3,
            stdout: typeof error.stdout === 'string' ? error.stdout : '',
            stderr: typeof error.stderr === 'string' ? error.stderr : String(error.message)
        }
    }
}
if (process.env.CI || process.env.ADJ_SKIP_SCRIPT_CAT) {
    skip('CI 环境或设置了 ADJ_SKIP_SCRIPT_CAT')
}
if (!fs.existsSync(distScript)) {
    fail(`未找到构建产物 ${distScript}，先跑 npm run build`)
}
const sctl = resolveSctl()
if (!sctl) {
    skip('未安装 sctl（装好后运行 sctl serve 并在脚本猫中配对）')
}
const statusResult = runSctl(sctl, ['status', '-o', 'json'], STATUS_TIMEOUT_MS)
if (statusResult.code !== 0) {
    skip(`sctl daemon 不可达（先运行 sctl serve）：${(statusResult.stderr || statusResult.stdout).trim()}`)
}
let status = null
try {
    status = JSON.parse(statusResult.stdout)
} catch {
    skip('无法解析 sctl status 输出')
}
if (!status?.extConnected) {
    skip('脚本猫扩展未连接（设置 → 工具 → 外部接入 → 开启并配对）')
}
const versionMatch = fs.readFileSync(distScript, 'utf8').match(/\/\/\s*@version\s+(\S+)/)
const version = versionMatch ? versionMatch[1] : '未知版本'
log(`同步 dist/bilibili-adjustment.user.js（v${version}）到脚本猫…`)
const installResult = runSctl(sctl, ['install', distScript, '-o', 'json'], INSTALL_TIMEOUT_MS)
const detail = (installResult.stdout || installResult.stderr).trim()
if (installResult.code === 0) {
    log(`已同步 v${version}${detail ? `：${detail.replace(/\s+/g, ' ')}` : ''}`)
    process.exit(0)
}
if (installResult.code === 1) {
    fail('脚本猫中拒绝了本次安装/更新')
}
if (installResult.code === 2) {
    fail('安装请求过期或被取消（确认页未处理）')
}
fail(`同步失败（退出码 ${installResult.code}）：${detail}`)
