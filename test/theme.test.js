import { test } from 'node:test'
import assert from 'node:assert/strict'
// 注：test hooks 不支持目录导入（vite 可解析目录 index，node hook 只补 .js），故显式 /index.js
import { THEMES, THEME_LIST, DEFAULT_THEME } from '@/shared/theme/index.js'
import { colorTokenKeys } from '@/shared/theme/index.js'
import { generateThemeVariables } from '@/shared/theme/index.js'
test('主题系统：注册三主题（night/light/dark），默认 night', () => {
    assert.deepEqual(Object.keys(THEMES).sort(), ['dark', 'light', 'night'])
    assert.equal(THEME_LIST.length, 3)
    assert.equal(DEFAULT_THEME, 'night')
})
test('主题系统：每主题 colors 覆盖全部 token 键，值非空', () => {
    for (const theme of THEME_LIST) {
        for (const key of colorTokenKeys) {
            assert.ok(theme.colors[key], `${theme.id} 缺少颜色 token ${key}`)
        }
        assert.ok(theme.shadows.dialog, `${theme.id} 缺少 dialog 阴影`)
        assert.equal(theme.shared.borderRadius.md, '8px')
    }
})
test('主题系统：变量全集含 :root 兜底块 + 三主题块，变量名合法', () => {
    const css = generateThemeVariables()
    const attrCount = (css.match(/data-adj-theme="(?:night|light|dark)"/g) || []).length
    assert.equal(attrCount, 3)
    assert.ok(css.startsWith(':root{') || css.startsWith(':root {'))
    // 每个颜色 token 都有对应变量定义
    for (const key of colorTokenKeys) {
        assert.ok(css.includes(`--adj-${key}:`), `变量全集缺少 --adj-${key}`)
    }
    // 无残留占位模板或空值
    assert.ok(!css.includes('undefined'))
})
