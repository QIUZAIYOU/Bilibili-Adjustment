#!/usr/bin/env node
/**
 * 构建体积门禁（Sprint 0）
 *
 * 用法：
 *   node scripts/build-stats.mjs            # 打印产物 raw/gzip 体积并与基线对比（超预算则退出码 1）
 *   node scripts/build-stats.mjs --update   # 以当前产物刷新基线（发布新版本时执行）
 *
 * 说明：用户脚本为单文件产物（vite-plugin-monkey inline），无法按 chunk 拆分体积，
 * 因此体积门禁以「主产物 gzip 相对基线增长率」为准；Vue 等重依赖的收益体现为
 * 运行时懒加载（见 P0-1），由 docs/performance-guardrails.md 的验收指标约束。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import url from 'node:url'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const baselinePath = path.join(__dirname, 'build-baseline.json')
// 预算：相对基线的允许增长（gzip 超出 maxGrowthBytes 或 maxGrowthRatio 即失败）
const BUDGET = { maxGrowthBytes: 4096, maxGrowthRatio: 0.05 }
const kb = bytes => `${(bytes / 1024).toFixed(2)} KB`
const collect = () => {
    if (!fs.existsSync(distDir)) {
        console.error(`[build-stats] 未找到产物目录：${distDir}，请先执行 npm run build`)
        process.exit(1)
    }
    const files = fs.readdirSync(distDir).filter(name => name.endsWith('.js') || name.endsWith('.css'))
    return files.map(name => {
        const fullPath = path.join(distDir, name)
        const raw = fs.readFileSync(fullPath)
        return { name, raw: raw.length, gzip: zlib.gzipSync(raw, { level: 9 }).length }
    }).sort((a, b) => b.raw - a.raw)
}
const loadBaseline = () => {
    if (!fs.existsSync(baselinePath)) return null
    try {
        return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    } catch {
        return null
    }
}
const main = () => {
    const stats = collect()
    if (stats.length === 0) {
        console.error('[build-stats] dist 中未找到 js/css 产物')
        process.exit(1)
    }
    const totalRaw = stats.reduce((sum, item) => sum + item.raw, 0)
    const totalGzip = stats.reduce((sum, item) => sum + item.gzip, 0)
    const primary = stats[0]
    const baseline = loadBaseline()
    console.log('[build-stats] 产物体积统计')
    for (const item of stats) {
        console.log(`  ${item.name.padEnd(34)} raw ${kb(item.raw).padStart(11)}  gzip ${kb(item.gzip).padStart(11)}`)
    }
    console.log(`  ${'合计'.padEnd(34)} raw ${kb(totalRaw).padStart(11)}  gzip ${kb(totalGzip).padStart(11)}`)
    if (process.argv.includes('--update')) {
        const payload = {
            version: new Date().toISOString(),
            files: stats,
            totalRaw,
            totalGzip
        }
        fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 4)}\n`)
        console.log(`[build-stats] 基线已更新：${path.relative(rootDir, baselinePath)}`)
        return
    }
    if (!baseline) {
        console.log('[build-stats] 尚无基线（首次运行），可用 --update 写入基线')
        return
    }
    const basePrimary = baseline.files.find(item => item.name === primary.name)
    if (!basePrimary) {
        console.log(`[build-stats] 基线中无同名产物（${primary.name}），跳过增长率校验`)
        return
    }
    const growthBytes = primary.gzip - basePrimary.gzip
    const growthRatio = basePrimary.gzip ? growthBytes / basePrimary.gzip : 0
    console.log(`[build-stats] 主产物 ${primary.name}: gzip ${growthBytes >= 0 ? '+' : ''}${kb(growthBytes)}（${(growthRatio * 100).toFixed(2)}%）`)
    const overBudget = growthBytes > BUDGET.maxGrowthBytes || growthRatio > BUDGET.maxGrowthRatio
    if (overBudget) {
        console.error(`[build-stats] 体积超出预算（上限 +${kb(BUDGET.maxGrowthBytes)} 或 +${(BUDGET.maxGrowthRatio * 100).toFixed(0)}%）；请确认改动必要性，或发布时执行 --update 刷新基线`)
        process.exit(1)
    }
    console.log('[build-stats] 体积在预算内')
}
main()
