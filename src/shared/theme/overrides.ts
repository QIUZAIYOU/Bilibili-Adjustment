/**
 * 主题色值的热更覆盖（纯逻辑）
 *
 * 为什么可以热更：主题只是「token → 色值」的映射，改色值不改变任何行为契约；
 * 而它必须**三主题同步**这条不变量，在「只允许覆盖已有 token」的约束下**自动成立**
 * （覆盖不会新增 token，三个主题的 key 集合始终与内置一致，`test/theme.test.ts` 的全量覆盖校验仍然有效）。
 *
 * 安全点：
 * - 远端值最终会被拼进 `--adj-xxx:<值>` 的样式表文本 → 必须挡住「逃出声明」的写法（见 isSafeCssValue）；
 * - 覆盖时**克隆** color/shadow 映射再改，避免 `night.colors` 与 tokens.ts 的 `defaultColors` 是同一对象
 *   （直接改会连内置默认色板一起改掉，影响「未标注主题」的兜底块）。
 */
import { THEMES } from './themes'
import { colorTokenKeys, defaultShadows } from './tokens'
import { isSafeCssColor, isSafeCssValue } from '@/shared/hot-config'
/** 可覆盖的阴影 key（与 tokens.ts 的 defaultShadows 一致） */
export const shadowTokenKeys = Object.keys(defaultShadows)
/** 覆盖载荷：{ colors?: { token: 色值 }, shadows?: { key: 阴影值 } } */
export interface ThemeOverridePayload {
    colors?: Record<string, unknown>
    shadows?: Record<string, unknown>
}
/**
 * 应用某个主题的覆盖（就地合并到 THEMES 上）
 * @param {string} themeId night/light/dark
 * @param {unknown} payload 该主题的覆盖载荷
 * @returns {string[]} 实际生效的 token（供日志）
 */
export const applyThemeOverrides = (themeId: string, payload: unknown): string[] => {
    const theme = THEMES[themeId as keyof typeof THEMES]
    if (!theme || !payload || typeof payload !== 'object' || Array.isArray(payload)) return []
    const { colors, shadows } = payload as ThemeOverridePayload
    const applied: string[] = []
    const safeColors: Record<string, string> = {}
    for (const [token, value] of Object.entries(colors || {})) {
        // 只覆盖内置 token（不能新增），值必须是合法且安全的色值
        if (!colorTokenKeys.includes(token)) continue
        if (!isSafeCssColor(value)) continue
        safeColors[token] = String(value).trim()
        applied.push(token)
    }
    const safeShadows: Record<string, string> = {}
    for (const [key, value] of Object.entries(shadows || {})) {
        if (!shadowTokenKeys.includes(key)) continue
        if (!isSafeCssValue(value, 200)) continue
        safeShadows[key] = String(value).trim()
        applied.push(`shadow.${key}`)
    }
    if (Object.keys(safeColors).length) theme.colors = { ...theme.colors, ...safeColors }
    if (Object.keys(safeShadows).length) theme.shadows = { ...theme.shadows, ...safeShadows }
    return applied
}
