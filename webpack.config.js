const path = require('path');
const url = require('url');
const assert = require('assert');
const webpack = require('webpack');
const { UserscriptPlugin } = require('webpack-userscript');
const production = process.env.NODE_ENV === 'production';
const pkg = require('./package.json');

const dist = path.resolve(__dirname, 'dist');
module.exports = {
    mode: production ? 'production' : 'development',
    entry: path.resolve(__dirname, 'src', 'main.js'),
    output: {
        path: dist,
        filename: production ? `${pkg.name}.user.js` : `${pkg.name}-dev.user.js`,
        publicPath: production ? './' : 'http://localhost:8080/'
    },
    resolve: {
        extensions: ['.js'],
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10
                },
                modules: {
                    test: /[\\/]modules[\\/]/,
                    name: 'modules',
                    chunks: 'all',
                    minChunks: 2,
                    priority: 10
                },
                core: {
                    test: /[\\/]core[\\/]/,
                    priority: 20,
                    minSize: 0 // 强制提取核心代码
                }
            }
        }
    },
    devServer: {
        hot: false,
        host: 'localhost',
        port: 8080,
        static: dist,
        devMiddleware: { writeToDisk: true },
        client: {
            webSocketURL: 'ws://localhost:8080/ws',
            overlay: false
        },
        allowedHosts: 'all',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
        },
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        }),
        // new webpack.HotModuleReplacementPlugin(),
        new UserscriptPlugin({
            headers: {
                name: production ? '哔哩哔哩（bilibili.com）调整' : '哔哩哔哩（bilibili.com）调整 Development',
                author: pkg.author,
                description: pkg.description,
                version: !production ? `[buildNo]-${Date.now()}` : `[buildNo]-build.${Date.now()}`,
                match: ['*://www.bilibili.com/*', '*://www.bilibili.com/video/*', '*://www.bilibili.com/bangumi/play/*', '*://www.bilibili.com/list/*', '*://t.bilibili.com/*'],
                grant: ['GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'unsafeWindow', 'window.onurlchange'],
            }
        }),
    ],
};