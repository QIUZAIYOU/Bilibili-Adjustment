/**
 * 本地静态服务：给「真实浏览器里注入产物」用
 *
 * 用途：端到端验证时，把构建产物与 SystemJS 运行时喂给**用户自己的浏览器**（Tabbit/Chrome）。
 * 浏览器页面在 bilibili.com 上，跨源取本地文件会被 CORS 拦 —— 故这里统一放开 CORS 头。
 *
 * 用法：node test/e2e/serve-dist.mjs [端口]
 */
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const PORT = Number(process.argv[2] || 8799)
/** 路径 → 文件 */
const ROUTES = {
    '/bilibili-adjustment.user.js': path.join(ROOT, 'dist', 'bilibili-adjustment.user.js'),
    '/system.min.js': path.join(ROOT, 'node_modules/systemjs/dist/system.min.js'),
    '/named-register.min.js': path.join(ROOT, 'node_modules/systemjs/dist/extras/named-register.min.js'),
    // 样式源码：验证「CSS 特异性能不能压过 B 站」时需要原文（产物里的 CSS 是转义过的字符串）
    '/video-page.js': path.join(ROOT, 'src', 'shared', 'styles', 'video-page.js'),
    // 预览功能的样式源码：验证「显现规则在真实页面上生效」（产物里是转义过的字符串）
    '/video-preview-styles.js': path.join(ROOT, 'src', 'shared', 'styles', 'video-preview.js'),
    '/element-selectors.ts': path.join(ROOT, 'src', 'shared', 'element-selectors.ts'),
    // 模板源码：验证「按钮 HTML 能不能注入到真实卡片上」
    '/video-preview-templates.js': path.join(ROOT, 'src', 'shared', 'templates', 'video', 'video-preview.js')
}
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const file = ROUTES[url.pathname]
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-store'
    }
    if (!file) {
        res.writeHead(404, headers)
        res.end('not found')
        return
    }
    try {
        const content = await readFile(file)
        res.writeHead(200, { ...headers, 'Content-Type': 'application/javascript; charset=utf-8' })
        res.end(content)
    } catch (error) {
        res.writeHead(500, headers)
        res.end(String(error))
    }
})
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[serve-dist] http://127.0.0.1:${PORT} 已启动`)
})
