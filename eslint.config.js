import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import ts from 'typescript-eslint'
export default [
    js.configs.recommended,
    // TypeScript 源码（TS 迁移期与 .js 并存）：类型语义由 tsc/vue-tsc 负责（npm run typecheck），
    // eslint 只补充风格与常见错误；下方无 files 的共享块（globals + 风格规则）对 .ts 同样生效。
    ...ts.configs.recommended.map(config => ({ ...config, files: ['**/*.ts']})),
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                window: true,
                document: true,
                location: true,
                setTimeout: true,
                clearTimeout: true,
                setInterval: true,
                clearInterval: true,
                console: true,
                alert: true,
                Node: true,
                Element: true,
                HTMLMediaElement: true,
                HTMLVideoElement: true,
                MutationObserver: true,
                NodeList: true,
                NodeFilter: true,
                ResizeObserver: true,
                AbortController: true,
                IDBKeyRange: true,
                indexedDB: true,
                history: true,
                URL: true,
                // Node.js全局变量
                module: true,
                require: true,
                __dirname: true,
                import: true,
                process: true,
                globalThis: true,
                // 浏览器全局变量
                localStorage: true,
                sessionStorage: true,
                fetch: true,
                navigator: true,
                performance: true,
                requestAnimationFrame: true,
                cancelAnimationFrame: true,
                requestIdleCallback: true,
                cancelIdleCallback: true,
                getComputedStyle: true,
                CustomEvent: true,
                DOMException: true,
                Document: true,
                DocumentFragment: true,
                ShadowRoot: true,
                BroadcastChannel: true,
                HTMLInputElement: true,
                Event: true,
                KeyboardEvent: true,
                MouseEvent: true,
                IntersectionObserver: true,
                WebSocket: true,
                Blob: true,
                FileReader: true,
                FormData: true,
                Headers: true,
                Response: true,
                Request: true,
                btoa: true,
                atob: true,
                TextDecoder: true,
                crypto: true,
                JSON: true,
                Math: true,
                Date: true,
                RegExp: true,
                Map: true,
                Set: true,
                WeakMap: true,
                WeakSet: true,
                Promise: true,
                Symbol: true,
                Array: true,
                Object: true,
                String: true,
                Number: true,
                Boolean: true,
                parseInt: true,
                parseFloat: true,
                isNaN: true,
                isFinite: true,
                encodeURIComponent: true,
                decodeURIComponent: true,
                encodeURI: true,
                decodeURI: true,
                escape: true,
                unescape: true,
                Infinity: true,
                NaN: true,
                undefined: true,
                // Greasemonkey/Tampermonkey 用户脚本全局变量
                GM: true,
                GM_info: true,
                GM_getValue: true,
                GM_setValue: true,
                GM_deleteValue: true,
                GM_listValues: true,
                GM_xmlhttpRequest: true,
                GM_download: true,
                GM_openInTab: true,
                GM_notification: true,
                GM_setClipboard: true,
                GM_registerMenuCommand: true,
                GM_unregisterMenuCommand: true,
                unsafeWindow: true
            }
        },
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            // 代码风格规则
            '@stylistic/semi': ['error', 'never'],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/indent': ['error', 4, { SwitchCase: 1, MemberExpression: 1, FunctionDeclaration: { parameters: 'first' }, ArrayExpression: 'first', ObjectExpression: 'first' }],
            '@stylistic/comma-dangle': ['error', 'never'],
            '@stylistic/object-curly-spacing': ['error', 'always', { 'arraysInObjects': false, 'objectsInObjects': false }],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/array-element-newline': ['error', 'consistent'],
            '@stylistic/array-bracket-newline': ['error', 'consistent'],
            '@stylistic/array-bracket-spacing': ['error', 'never'],
            '@stylistic/array-callback-return': 'off',
            '@stylistic/space-before-function-paren': [
                'error',
                {
                    anonymous: 'always',
                    named: 'always',
                    asyncArrow: 'always'
                }
            ],
            '@stylistic/keyword-spacing': [
                'error',
                {
                    after: true,
                    before: true
                }
            ],
            '@stylistic/function-paren-newline': ['error', 'consistent'],
            '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/comma-spacing': ['error', { before: false, after: true }],
            '@stylistic/key-spacing': ['error', { 'afterColon': true }],
            '@stylistic/no-multiple-empty-lines': ['error', { max: 0, maxEOF: 0, maxBOF: 0 }],
            '@stylistic/padded-blocks': ['error', 'never'],
            '@stylistic/lines-between-class-members': ['error', 'never'],
            '@stylistic/arrow-spacing': ['error', { 'before': true, 'after': true }],
            '@stylistic/arrow-parens': ['error', 'as-needed'],
            '@stylistic/no-multi-spaces': ['error'],
            'arrow-body-style': ['error', 'as-needed'],
            'no-unused-vars': 'warn',
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'multi-line'],
            'dot-notation': 'error',
            // 错误预防
            'no-debugger': 'error',
            'no-dupe-keys': 'error',
            'no-undef': 'error'
        }
    },
    {
        files: ['**/*.ts'],
        rules: {
            // TS 编译器已覆盖这两类检查，且 no-undef 在类型导入/全局声明上误报率高
            'no-undef': 'off',
            // lodash 语义要求把 this 透传给原函数（lodash-lite 的 debounce/throttle），故放行
            '@typescript-eslint/no-this-alias': 'off',
            'no-unused-vars': 'off',
            // 项目里大量使用 `cond && call()` 形式的短路调用（.js 时代即如此），保持一致
            '@typescript-eslint/no-unused-expressions': 'off',
            // `_` 前缀参数表示「刻意保留但不使用」（如兼容既有调用签名的参数）
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },
    {
        ignores: [
            '.history/',
            'node_modules/',
            'dist/',
            'webpack.config.js',
            'babel.config.js',
            'build/*.js',
            'src/assets',
            'public',
            'legacy/',
            '*.user.js',
            '*.meta.js',
            'everythingIsBasedOnThisFile.js',
            // 服务器热更资产（JSON 内容的 .js 文件，非源码、不参与产物构建，只由 scripts/upload.py 上传）
            'hot-config/'
        ]
    }
]
