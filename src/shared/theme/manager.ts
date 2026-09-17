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
import { applyThemeOverrides } from './overrides'
import { registerHotConfigTarget } from '@/shared/hot-config-registry'
import type { ThemeDefinition, ThemeId } from './themes'
const STYLE_ID = 'adj-theme-vars'
const ATTR = 'data-adj-theme'
export const DEFAULT_THEME = 'night'
/** 设置项取值：跟随B站 */
export const FOLLOW_THEME = 'follow'
const listeners = new Set<(id: string) => void>()
let followObserver: MutationObserver | null = null
let isFollowing = false
/** shared 分组 → CSS 变量前缀（--adj-<prefix>-<key>），两处生成逻辑共用 */
const SHARED_PREFIX_MAP: Array<[string, keyof typeof night.shared]> = [
    ['space', 'spacing'],
    ['radius', 'borderRadius'],
    ['font', 'fontSize'],
    ['motion', 'transitions'],
    ['z', 'zIndex']
]
/** 生成单个主题的变量声明文本 */
const buildThemeBlock = (theme: ThemeDefinition): string => {
    const vars = []
    for (const [name, value] of Object.entries(theme.colors)) {
        vars.push(`--adj-${name}:${value}`)
    }
    for (const [key, value] of Object.entries(theme.shadows)) {
        vars.push(`--adj-shadow-${key}:${value}`)
    }
    const shared = theme.shared
    for (const [name, key] of SHARED_PREFIX_MAP) {
        for (const [k, v] of Object.entries(shared[key])) {
            vars.push(`--adj-${name}-${k}:${v}`)
        }
    }
    return `:root[data-adj-theme="${theme.id}"]{${vars.join(';')}}`
}
/** 无属性默认块：任意未标注主题的页面兜底为 night 变量 */
const buildDefaultBlock = (): string => {
    const vars: string[] = []
    const push = (prefix: string, map: object): void => {
        for (const [k, v] of Object.entries(map)) vars.push(`${prefix}${k}:${v}`)
    }
    push('--adj-', night.colors)
    push('--adj-shadow-', night.shadows)
    for (const [name, key] of SHARED_PREFIX_MAP) {
        push(`--adj-${name}-`, night.shared[key])
    }
    return `:root{${vars.join(';')}}`
}
/** 默认块与全部主题块的拼接（一次注入，之后切换零成本） */
export const generateThemeVariables = (): string => {
    const blocks = [buildDefaultBlock()]
    for (const theme of Object.values(THEMES)) {
        blocks.push(buildThemeBlock(theme))
    }
    return blocks.join('\n')
}
/** 单个主题变量映射（JS 侧读取用，等价于 generateThemeVariables 中对应块） */
export const getThemeCssVariables = (themeId: string): string => {
    const theme = THEMES[themeId as ThemeId]
    return theme ? buildThemeBlock(theme) : ''
}
/**
 * 依 B 站官方标记解析应应用的主题
 *
 * B 站官方深色模式的标记发生过变更：旧版为 `night-mode`，现版本为 `bili_dark`
 * （`<html class="bili_dark">`）。两者都要识别，否则「跟随B站」会失效。
 * 注意：不要把通用的 `dark` 计入判据——很多站点/扩展都会加 `dark`，会导致误判为深色。
 */
const OFFICIAL_DARK_CLASSES = ['bili_dark', 'night-mode']
const resolveOfficialTheme = (): 'dark' | 'light' => {
    // 只看 class：B 站用 class 标记深色。不要额外检查 data-theme 等属性——
    // 那些属性可能被其它脚本/扩展写入，会造成误判为深色。
    const html = document.documentElement
    return OFFICIAL_DARK_CLASSES.some(cls => html.classList.contains(cls)) ? 'dark' : 'light'
}
const applyThemeAttribute = (id: string): void => {
    document.documentElement.setAttribute(ATTR, id)
}
const getStyleElement = (): HTMLElement | null => document.getElementById(STYLE_ID)
/**
 * 重新生成变量表（热更覆盖色值后调用）
 * 变量表是「一次注入、之后只切 data-adj-theme」的结构，所以色值变了必须整块重写。
 */
export const reloadThemeVariables = (): void => {
    const style = getStyleElement()
    if (style) style.textContent = generateThemeVariables()
}
// 注册热更目标（主题色值表）：本模块自带变量生成逻辑，故在这里自注册
registerHotConfigTarget('themes', {
    keys: () => Object.keys(THEMES),
    apply: (themeId, value) => applyThemeOverrides(themeId, value).length > 0,
    afterApply: () => reloadThemeVariables()
})
const notify = (id: string): void => {
    for (const fn of listeners) fn(id)
}
const stopFollow = (): void => {
    if (followObserver) {
        followObserver.disconnect()
        followObserver = null
    }
}
/** 进入跟随模式：先按当前标记应用一次，再监听 class 变化持续跟随 */
const startFollow = (): void => {
    stopFollow()
    applyThemeAttribute(resolveOfficialTheme())
    if (typeof MutationObserver !== 'undefined') {
        followObserver = new MutationObserver(() => {
            applyThemeAttribute(resolveOfficialTheme())
        })
        followObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class']})
    }
}
/** ThemeManager 对外 API */
export interface ThemeManagerApi {
    /** 注入主题变量 style 并订阅 config 变更；config 未就绪前先按默认主题，避免闪烁 */
    init: (options?: { theme?: string }) => ThemeManagerApi
    /** 应用主题：night/light/dark 直接应用；follow（含 alias auto）跟随 B 站官方 */
    setTheme: (value: string) => boolean
    /** 当前实际生效的主题 id（night/light/dark） */
    getTheme: () => string
    getThemeMeta: () => ThemeDefinition | undefined
    /** 是否处于「跟随B站」模式 */
    isFollowing: () => boolean
    /** JS 侧需要色值时读取（getComputedStyle），用法同 CSS 变量名不带 --adj- 前缀 */
    getColor: (tokenName: string) => string
    /** 订阅主题变化（收到实际生效 id）；返回取消函数 */
    onChange: (fn: (id: string) => void) => () => void
}
export const ThemeManager: ThemeManagerApi = {
    /** 注入主题变量 style 并订阅 config 变更；config 未就绪前先按默认主题，避免闪烁 */
    init ({ theme }: { theme?: string } = {}) {
        if (getStyleElement()) return this
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = generateThemeVariables()
        document.head.append(style)
        // 设置/跨标签页同步 theme 变更 → 即时应用（本地与远端均走同一事件）
        eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, ...args: unknown[]) => {
            // eventBus 的 handler 形参是 rest，这里按原实现解构首个负载
            const { key, value } = (args[0] ?? {}) as { key?: string; value?: string }
            if (key === 'theme' && typeof value === 'string') this.setTheme(value)
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
    setTheme (value: string): boolean {
        if (value === FOLLOW_THEME || value === 'auto') {
            isFollowing = true
            startFollow()
            return true
        }
        if (!THEMES[value as ThemeId]) return false
        stopFollow()
        isFollowing = false
        applyThemeAttribute(value)
        notify(value)
        return true
    },
    /** 当前实际生效的主题 id（night/light/dark） */
    getTheme (): string {
        return document.documentElement.getAttribute(ATTR) || DEFAULT_THEME
    },
    getThemeMeta (): ThemeDefinition | undefined {
        return THEMES[this.getTheme() as ThemeId]
    },
    /** 是否处于「跟随B站」模式 */
    isFollowing (): boolean {
        return isFollowing
    },
    /** JS 侧需要色值时读取（getComputedStyle），用法同 CSS 变量名不带 --adj- 前缀 */
    getColor (tokenName: string): string {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(`--adj-${tokenName}`).trim()
    },
    /** 订阅主题变化（收到实际生效 id）；返回取消函数 */
    onChange (fn: (id: string) => void) {
        listeners.add(fn)
        return () => listeners.delete(fn)
    }
}
