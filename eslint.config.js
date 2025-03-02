const js = require('@eslint/js')
const globals = require('globals')
const imp = require('eslint-plugin-import')

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        plugins: {
            import: imp
        },
        rules: {
            // 代码风格规则
            'semi': ['error', 'never'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'indent': ['error', 4, { SwitchCase: 1, MemberExpression: 1, FunctionDeclaration: { parameters: 'first' }, ArrayExpression: 'first', ObjectExpression: 'first' }],
            'comma-dangle': ['error', 'never'],
            'object-curly-spacing': ['error', 'always'],
            'arrow-parens': ['error', 'as-needed'],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always'],
            'array-element-newline': ['error', 'always'],
            'object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
            'space-infix-ops': 'error', 
            'comma-spacing': ['error', { before: false, after: true }],
            'key-spacing': ['error', { beforeColon: false, afterColon: true, mode: 'strict' }],
            'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
            'padded-blocks': ['error', 'never'],
            'lines-between-class-members': ['error', 'never'],
            "arrow-spacing": ["error", { "before": true, "after": true }],
            "arrow-parens": ["error", "as-needed"],
            "arrow-body-style": ["error", "as-needed"],
            // 最佳实践
            'no-unused-vars': 'warn',
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'multi-line'],
            'dot-notation': 'error',
            'no-multi-spaces': 'error',

            // 模块化相关
            'import/no-absolute-path': 'error',
            'import/no-webpack-loader-syntax': 'error',

            // 错误预防
            'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
            'no-dupe-keys': 'error',
            'no-undef': 'error'
        }
    },
    {
        settings: {
            'import/resolver': {
                node: true
            }
        }
    },
    {
        ignores: [
            'node_modules/',
            'dist/',
            'webpack.config.js',
            'eslint.config.js',
            'build/*.js',
            'src/assets',
            'public',
            '*.user.js',
            '*.meta.js'
        ]
    }
]
