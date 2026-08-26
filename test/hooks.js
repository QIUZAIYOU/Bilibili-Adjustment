// Node 模块解析 hook：复刻 vite 的解析行为（'@' 别名 + 省略扩展名的导入补全 .js）
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const resolveWithExt = (target, baseUrl) => {
    const absolute = path.isAbsolute(target) ? target : path.resolve(baseUrl, target)
    // 已存在的目标（如 ../package.json）原样放行
    if (fs.existsSync(absolute)) return pathToFileURL(absolute).href
    if (fs.existsSync(`${absolute}.js`)) return pathToFileURL(`${absolute}.js`).href
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
