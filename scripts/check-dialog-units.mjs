#!/usr/bin/env node
/**
 * 校验「弹窗里的视口单位」是否随 UI 缩放一起换算（2026-11-02 加）
 *
 * 为什么需要它：弹窗根元素带 `zoom: var(--adj-ui-zoom, 1)`（1920 宽 = 1，4K 放大到 2），
 * 而 vh/vw 是**按视口百分比算再乘 zoom** 的 —— 4K 下 80vh 会被渲染成 160vh。
 * 真实事故：首页推荐历史弹窗 `.adjustment-history-popover` 写死 `max-height: 80vh`，
 * zoom=2 后弹窗高过屏幕、`margin:auto` 居中变成负 top，标题被顶到视口上方（用户 4K 截图可见）。
 *
 * 规则：
 * 1. 值里已经带 `var(--adj-ui-zoom-inv, 1)` → 通过（这是正确的换算写法）。
 * 2. 用 `min()/max()/clamp()` 且带 `px` 上限 → 通过（px 封顶，放大后仍在可控范围）。
 * 3. 全屏遮罩/背景层（`100vw` / `100vh`，选择器含 overlay/backdrop/mask）→ 通过（不被 zoom）。
 * 4. `.adjustment-settings-nav` → 通过（导航挂在 body 上，不在 zoom 容器内）。
 * 5. 其余一律报错：必须写成 `calc(<N>vh * var(--adj-ui-zoom-inv, 1))`。
 *
 * 用法：npm run check:dialog-units
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['src/shared/styles', 'src/shared/templates', 'src/components', 'src/ui']
const EXT = /\.(js|ts|vue)$/
const UNIT = /(?<![\w.-])(\d+(?:\.\d+)?)v([hw])\b/
const SAFE_SELECTOR = /overlay|backdrop|mask|settings-nav/

const files = []
const walk = dir => {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            if (name === 'node_modules') continue
            walk(full)
        } else if (EXT.test(name)) files.push(full)
    }
}
for (const dir of SCAN_DIRS) {
    try {
        walk(join(root, dir))
    } catch {
        // 目录不存在就跳过
    }
}

/** 把注释替换成等长空格，保留行号 */
const stripComments = text => text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\w])\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '))

const problems = []
let checked = 0
for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    if (!UNIT.test(raw)) continue
    const lines = stripComments(raw).split('\n')
    let selector = ''
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const selectorMatch = line.match(/^\s*([.#@][^{}]*?)\s*\{/)
        if (selectorMatch) selector = selectorMatch[1].trim()
        const decl = line.match(/^\s*([-a-zA-Z]+)\s*:\s*([^;{}]+);/)
        if (!decl) continue
        const [, prop, value] = decl
        const unit = value.match(UNIT)
        if (!unit) continue
        checked += 1
        if (value.includes('--adj-ui-zoom-inv')) continue
        if (/\b(min|max|clamp)\(/.test(value) && /\d+px/.test(value)) continue
        if (SAFE_SELECTOR.test(selector)) continue
        const where = `${relative(root, file).replace(/\\/g, '/')}:${i + 1}`
        problems.push(`${where}  ${selector || '(无选择器)'} { ${prop}: ${value.trim()}; }`)
    }
}

if (problems.length) {
    console.error('[check-dialog-units] 发现未做缩放换算的视口单位（4K 下会被放大一倍）：')
    for (const p of problems) console.error(`  - ${p}`)
    console.error('  修法：改成 calc(<N>vh * var(--adj-ui-zoom-inv, 1))；px 封顶（min/max 带 px）或全屏遮罩可以例外。')
    process.exit(1)
}
console.log(`[check-dialog-units] 通过：${checked} 处视口单位均已换算或封顶`)
