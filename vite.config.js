import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'
import pkg from './package.json' with { type: 'json' }
import path from 'path'
import url from 'url'
import VitePluginBundleObfuscator from 'vite-plugin-bundle-obfuscator'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
export default defineConfig(({ mode }) => ({
    build: {
        minify: 'terser',
        terserOptions: {
            compress: {
                defaults: true,
                dead_code: true,
                drop_debugger: true,
                passes: 3
            },
            format: {
                comments: false,
                ecma: 5,
                wrap_iife: true
            },
            mangle: {
                properties: {
                    regex: /^_/,
                    reserved: ['$super']
                }
            }
        }
    },
    esbuild: {
        drop: ['debugger']
    },
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
                namespace: '哔哩哔哩（bilibili.com）调整',
                copyright: pkg.author,
                license: 'GPL-3.0 License',
                version: pkg.version,
                author: pkg.author,
                description: '一、首页新增推荐视频历史记录(仅记录前10个推荐位中的非广告内容)，以防误点刷新错过想看的视频。二、动态页调整：默认显示"投稿视频"内容，可自行设置URL以免未来URL发生变化。三、播放页调整：1.自动定位到播放器（进入播放页，可自动定位到播放器，可设置偏移量及是否在点击主播放器时定位）；2.可设置播放器默认模式；3.可设置是否自动选择最高画质；4.新增快速返回播放器漂浮按钮；5.新增点击评论区时间锚点可快速返回播放器；6.网页全屏模式解锁(网页全屏模式下可滚动查看评论，并在播放器控制栏新增快速跳转至评论区按钮)；7.将视频简介内容优化后插入评论区或直接替换原简介区内容(替换原简介中固定格式的静态内容为跳转链接)；8.视频播放过程中跳转指定时间节点至目标时间节点(可用来跳过片头片尾及中间广告等)；9.新增点击视频合集、下方推荐视频、结尾推荐视频卡片快速返回播放器；',
                match: [
                    '*://www.bilibili.com/*',
                    '*://www.bilibili.com/video/*',
                    '*://www.bilibili.com/bangumi/play/*',
                    '*://www.bilibili.com/list/*',
                    '*://t.bilibili.com/*'
                ],
                supportURL: 'https://github.com/QIUZAIYOU/Bilibili-Adjustment',
                homepageURL: 'https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js',
                grant: [
                    'unsafeWindow'
                ]
            }
        }),
        VitePluginBundleObfuscator({
            excludes: [],
            enable: true,
            log: false,
            autoExcludeNodeModules: false,
            threadPool: true,
            options: {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.75,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 0.4,
                debugProtection: true,
                debugProtectionInterval: 2000,
                disableConsoleOutput: true,
                identifierNamesGenerator: 'hexadecimal',
                numbersToExpressions: true,
                renameGlobals: true,
                selfDefending: true,
                simplify: true,
                splitStrings: true,
                splitStringsChunkLength: 5,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayIndexShift: true,
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayWrappersCount: 2,
                stringArrayWrappersChainedCalls: true,
                transformObjectKeys: true,
                unicodeEscapeSequence: true
            }
        })
    ]
}))
