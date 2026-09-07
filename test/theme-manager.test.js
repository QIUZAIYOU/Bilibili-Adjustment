import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
// 注意：theme 模块顶层不触碰 DOM（仅函数内使用），故可在 import 后注入 DOM 桩
import { ThemeManager, FOLLOW_THEME, DEFAULT_THEME } from '@/shared/theme/index.js'
let attrValue = null
let htmlClasses = []
let lastObserver = null
const setNightMode = on => {
    if (on) {
        if (!htmlClasses.includes('night-mode')) htmlClasses.push('night-mode')
    } else {
        htmlClasses = htmlClasses.filter(c => c !== 'night-mode')
    }
}
beforeEach(() => {
    attrValue = null
    htmlClasses = []
    lastObserver = null
    globalThis.document = {
        createElement: () => ({ id: '', textContent: '' }),
        head: { append () {} },
        documentElement: {
            setAttribute (k, v) { attrValue = v },
            getAttribute () { return attrValue },
            classList: { contains: c => htmlClasses.includes(c) }
        },
        getElementById: () => ({ textContent: '' })
    }
    globalThis.MutationObserver = class {
        constructor (cb) {
            this.cb = cb
            lastObserver = this
        }
        observe () { this.observed = true }
        disconnect () { this.observed = false }
    }
})
const fireClassChange = () => {
    if (lastObserver && lastObserver.observed) lastObserver.cb()
}
test('主题跟随：init 注入后默认应用 night', () => {
    ThemeManager.init()
    assert.equal(ThemeManager.getTheme(), DEFAULT_THEME)
    assert.equal(ThemeManager.isFollowing(), false)
})
test('主题跟随：follow 模式按 html.night-mode 解析为 dark', () => {
    setNightMode(true)
    ThemeManager.init()
    ThemeManager.setTheme(FOLLOW_THEME)
    assert.equal(ThemeManager.getTheme(), 'dark')
    assert.equal(ThemeManager.isFollowing(), true)
})
test('主题跟随：无 night-mode 时解析为 light', () => {
    ThemeManager.init()
    ThemeManager.setTheme(FOLLOW_THEME)
    assert.equal(ThemeManager.getTheme(), 'light')
})
test('主题跟随：MutationObserver 监听 class 变化持续跟随', () => {
    ThemeManager.init()
    ThemeManager.setTheme(FOLLOW_THEME)
    assert.equal(ThemeManager.getTheme(), 'light')
    setNightMode(true)
    fireClassChange()
    assert.equal(ThemeManager.getTheme(), 'dark')
    setNightMode(false)
    fireClassChange()
    assert.equal(ThemeManager.getTheme(), 'light')
})
test('主题跟随：setTheme 直接主题后退出跟随并停止观察', () => {
    ThemeManager.init()
    ThemeManager.setTheme(FOLLOW_THEME)
    ThemeManager.setTheme('night')
    assert.equal(ThemeManager.isFollowing(), false)
    assert.equal(ThemeManager.getTheme(), 'night')
    // 观察器已断开，class 变化不再影响
    setNightMode(true)
    fireClassChange()
    assert.equal(ThemeManager.getTheme(), 'night')
})
test('主题跟随：无效取值返回 false 不生效', () => {
    ThemeManager.init()
    assert.equal(ThemeManager.setTheme('rainbow'), false)
    assert.equal(ThemeManager.getTheme(), DEFAULT_THEME)
})
