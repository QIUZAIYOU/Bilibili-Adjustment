import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
export default [
    js.configs.recommended,
    {
        languageOptions: {
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
                MutationObserver: true,
                NodeFilter: true,
                ResizeObserver: true,
                AbortController: true,
                IDBKeyRange: true,
                indexedDB: true,
                history: true,
                // Node.js全局变量
                module: true,
                require: true,
                __dirname: true,
                import: true,
                process: true,
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
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/array-element-newline': ['error', { 'consistent': true, 'multiline': true }],
            '@stylistic/array-bracket-newline': [
                'error',
                {
                    multiline: true,
                    minItems: 6
                }
            ],
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
            '@stylistic/no-multi-spaces': [
                'error',
                {
                    ignoreEOLComments: false,
                    exceptions: {
                        Property: false,
                        VariableDeclarator: true,
                        ImportDeclaration: true,
                        ExportNamedDeclaration: true,
                        BinaryExpression: false,
                        AssignmentExpression: true
                    }
                }
            ],
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
        ignores: [
            'node_modules/',
            'dist/',
            'webpack.config.js',
            'babel.config.js',
            'build/*.js',
            'src/assets',
            'public',
            '*.user.js',
            '*.meta.js',
            'everythingIsBasedOnThisFile.js'
        ]
    }
]
