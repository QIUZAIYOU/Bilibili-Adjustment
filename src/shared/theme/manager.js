/**
 * ThemeManager：主题变量注入、单点切换与「跟随B站」
 *
 * 机制（docs/theme-system.md §3.1/§6）：
 * - 启动时把「全部主题」的 CSS 变量一次注入 <style id="adj-theme-vars">，
 *   每主题一块 :root[data-adj-theme="<id>"]，另附 :root 默认块（= night）兜底；
 * - 切换主题只需改一处：documentElement 的 data-adj-theme 属性 → 全站样式即时换肤；
 * - 设置项取值：night（夜间哔哩）/ follow（跟随B站）。
 *   follow 模式下依 B 站官方标记自动应用官方 light/dark：
 *   html 元素含 class="night-mode"（B 站深色模式标记）→ dark，否则 → light，
 *   并用 MutationObserver 监听 class 变化，B 站切换夜间模式时脚本 UI 自动跟随；
 * - 订阅 config:changed 事件（含跨标签页同步与本地设置变更），theme 值变化即应用；
 * - 所有变量定义于 :root，CSS 自定义属性沿继承穿透 shadow DOM / top layer。
 */
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { THEMES, night } from './themes'
const STYLE_ID = 'adj-theme-vars'
const ATTR = 'data-adj-theme'
export const DEFAULT_THEME = 'night'
/** 设置项取值：跟随B站 */
export const FOLLOW_THEME = 'follow'
/** B 站官方深色模式标记：<html class="night-mode"> */
const OFFICIAL_DARK_CLASS = 'night-mode'
const listeners = new Set()
let followObserver = null
let isFollowing = false
/** 生成单个主题的变量声明文本 */
const buildThemeBlock = theme => {
    const vars = []
    for (const [name, value] of Object.entries(theme.colors)) {
        vars.push(`--adj-${name}:${value}`)
    }
    for (const [key, value] of Object.entries(theme.shadows)) {
        vars.push(`--adj-shadow-${key}:${value}`)
    }
    const shared = theme.shared
    for (const [name, key] of [
        ['space', 'spacing'],
        ['radius', 'borderRadius'],
        ['font', 'fontSize'],
        ['motion', 'transitions'],
        ['z', 'zIndex']
    ]) {
        for (const [k, v] of Object.entries(shared[key])) {
            vars.push(`--adj-${name}-${k}:${v}`)
        }
    }
    return `:root[data-adj-theme="${theme.id}"]{${vars.join(';')}}`
}
/** 无属性默认块：任意未标注主题的页面兜底为 night 变量 */
const buildDefaultBlock = () => {
    const vars = []
    const push = (prefix, map) => {
        for (const [k, v] of Object.entries(map)) vars.push(`${prefix}${k}:${v}`)
    }
    push('--adj-', night.colors)
    push('--adj-shadow-', night.shadows)
    for (const [name, key] of [
        ['space', 'spacing'],
        ['radius', 'borderRadius'],
        ['font', 'fontSize'],
        ['motion', 'transitions'],
        ['z', 'zIndex']
    ]) {
        push(`--adj-${name}-`, night.shared[key])
    }
    return `:root{${vars.join(';')}}`
}
/** 默认块与全部主题块的拼接（一次注入，之后切换零成本） */
export const generateThemeVariables = () => {
    const blocks = [buildDefaultBlock()]
    for (const theme of Object.values(THEMES)) {
        blocks.push(buildThemeBlock(theme))
    }
    return blocks.join('\n')
}
/** 单个主题变量映射（JS 侧读取用，等价于 generateThemeVariables 中对应块） */
export const getThemeCssVariables = themeId => {
    const theme = THEMES[themeId]
    return theme ? buildThemeBlock(theme) : ''
}
/** 依 B 站官方标记解析应应用的主题：html.night-mode → dark，否则 light */
const resolveOfficialTheme = () =>
    document.documentElement.classList.contains(OFFICIAL_DARK_CLASS) ? 'dark' : 'light'
const applyThemeAttribute = id => {
    document.documentElement.setAttribute(ATTR, id)
}
const getStyleElement = () => document.getElementById(STYLE_ID)
const notify = id => {
    for (const fn of listeners) fn(id)
}
const stopFollow = () => {
    if (followObserver) {
        followObserver.disconnect()
        followObserver = null
    }
}
/** 进入跟随模式：先按当前标记应用一次，再监听 class 变化持续跟随 */
const startFollow = () => {
    stopFollow()
    applyThemeAttribute(resolveOfficialTheme())
    if (typeof MutationObserver !== 'undefined') {
        followObserver = new MutationObserver(() => {
            applyThemeAttribute(resolveOfficialTheme())
        })
        followObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class']})
    }
}
export const ThemeManager = {
    /** 注入主题变量 style 并订阅 config 变更；config 未就绪前先按默认主题，避免闪烁 */
    init ({ theme } = {}) {
        if (getStyleElement()) return this
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = generateThemeVariables()
        document.head.append(style)
        // 设置/跨标签页同步 theme 变更 → 即时应用（本地与远端均走同一事件）
        eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (ctx, { key, value } = {}) => {
            if (key === 'theme') this.setTheme(value)
        })
        if (theme && theme !== DEFAULT_THEME) this.setTheme(theme)
        else applyThemeAttribute(DEFAULT_THEME)
        return this
    },
    /**
     * 应用主题。value 支持：
     * - 'night' | 'light' | 'dark'：直接应用对应主题并退出跟随模式；
     * - 'follow'（设置项「跟随B站」）：按 B 站当前模式在 light/dark 间自动切换并持续跟随。
     */
    setTheme (value) {
        if (value === FOLLOW_THEME || value === 'auto') {
            isFollowing = true
            startFollow()
            return true
        }
        if (!THEMES[value]) return false
        stopFollow()
        isFollowing = false
        applyThemeAttribute(value)
        notify(value)
        return true
    },
    /** 当前实际生效的主题 id（night/light/dark） */
    getTheme () {
        return document.documentElement.getAttribute(ATTR) || DEFAULT_THEME
    },
    getThemeMeta () {
        return THEMES[this.getTheme()]
    },
    /** 是否处于「跟随B站」模式 */
    isFollowing () {
        return isFollowing
    },
    /** JS 侧需要色值时读取（getComputedStyle），用法同 CSS 变量名不带 --adj- 前缀 */
    getColor (tokenName) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(`--adj-${tokenName}`).trim()
    },
    /** 订阅主题变化（收到实际生效 id）；返回取消函数 */
    onChange (fn) {
        listeners.add(fn)
        return () => listeners.delete(fn)
    }
}
