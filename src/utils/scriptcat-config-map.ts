/**
 * ScriptCat 用户配置的值映射（纯函数）
 *
 * 脚本猫的 select 只支持 values 列表、不展示选项 label，所以面板里存的是 label；
 * 本项目内部用真实 value（night/follow、数字等）。两个方向的转换都放这里，便于单测。
 */
import type { SettingItemSchema } from '@/config/settings-config'
/** 内部值 → 脚本猫面板值：单选/下拉显示 label */
export const toScriptCatValue = (item: SettingItemSchema, value: unknown): unknown => {
    if (item.type === 'radio' || item.type === 'select') {
        const matched = (item.options || []).find(option => option.value === value)
        return matched ? matched.label : value
    }
    if (item.type === 'checkbox') return Boolean(value)
    if (item.inputType === 'number') return Number(value) || 0
    return value ?? ''
}
/** 脚本猫面板值 → 内部值：label 反查真实 value */
export const fromScriptCatValue = (item: SettingItemSchema, raw: unknown): unknown => {
    if (raw === undefined || raw === null) return undefined
    if (item.type === 'radio' || item.type === 'select') {
        const options = item.options || []
        const byLabel = options.find(option => String(option.label) === String(raw))
        if (byLabel) return byLabel.value
        const byValue = options.find(option => String(option.value) === String(raw))
        return byValue ? byValue.value : raw
    }
    if (item.type === 'checkbox') return raw === true || raw === 'true'
    if (item.inputType === 'number') {
        const num = Number(raw)
        return Number.isFinite(num) ? num : undefined
    }
    return raw
}
