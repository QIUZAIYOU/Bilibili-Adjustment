// Node 模块解析 hook：复刻 vite 的解析行为（'@' 别名 + 省略扩展名的导入补全 .js/.ts）
//
// TS 迁移期约定：
// - 源码 .js / .ts 混排，导入一律省略扩展名（与 vite 一致），故补全时按 .js → .ts 顺序尝试；
// - Node 22.18+ 默认启用「类型剥离」（type stripping），.ts 可直接被 --test 加载，
//   无需 ts-node/tsx 等额外运行时；
// - 类型剥离**不做类型转换**：enum / namespace / 参数属性会运行时报错，
//   这也是本项目禁用它们的另一条理由（见 tsconfig.json 的 isolatedModules 与 docs/typescript-migration.md）。
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const resolveWithExt = (target, baseUrl) => {
    const absolute = path.isAbsolute(target) ? target : path.resolve(baseUrl, target)
    // 目录导入（如 '@/shared/theme'）按 vite 的行为解析到目录下的 index.js/index.ts
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
        for (const name of ['index.js', 'index.ts']) {
            const file = path.join(absolute, name)
            if (fs.existsSync(file)) return pathToFileURL(file).href
        }
        return null
    }
    // 已存在的目标（如 ../package.json）原样放行
    if (fs.existsSync(absolute)) return pathToFileURL(absolute).href
    for (const ext of ['.js', '.ts']) {
        if (fs.existsSync(`${absolute}${ext}`)) return pathToFileURL(`${absolute}${ext}`).href
    }
    return null
}
export async function resolve (specifier, context, next) {
    // '@/' 别名指向 src 根
    if (specifier.startsWith('@/')) {
        const url = resolveWithExt(path.resolve(srcRoot, specifier.slice(2)))
        if (url) return { url, shortCircuit: true }
    }
    // 相对导入：src 的导入省略扩展名（vite 自动补全），Node ESM 不补全
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const url = resolveWithExt(specifier, path.dirname(fileURLToPath(context.parentURL)))
        if (url) return { url, shortCircuit: true }
    }
    return next(specifier, context)
}
