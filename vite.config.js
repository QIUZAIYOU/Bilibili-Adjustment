import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey' // 改为默认导入
import pkg from './package.json' with { type: 'json' }
import path from 'path'
import url from 'url'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
export default defineConfig(({ mode }) => ({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    plugins: [
        monkey({
            entry: 'src/main.js',
            build: {
                fileName: mode === 'development' ? `${pkg.name}-dev.user.js` : `${pkg.name}.user.js`,
                metaFileName: true
            },
            server: {
                mountGmApi: true
            },
            userscript: {
                name: '哔哩哔哩（bilibili.com）调整',
                version: pkg.version,
                author: pkg.author,
                match: [
                    '*://www.bilibili.com/*',
                    '*://www.bilibili.com/video/*',
                    '*://www.bilibili.com/bangumi/play/*',
                    '*://www.bilibili.com/list/*',
                    '*://t.bilibili.com/*'
                ],
                grant: [
                    'GM_addStyle',
                    'GM_getValue',
                    'GM_setValue',
                    'GM_registerMenuCommand',
                    'unsafeWindow'
                ]
            }
        })
    ]
}))
