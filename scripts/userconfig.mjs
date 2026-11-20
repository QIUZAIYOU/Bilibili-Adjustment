/**
 * 从设置 schema 生成 ScriptCat「用户配置」（==UserConfig== YAML）
 *
 * 为什么要生成而不是手写：设置项有 30+，手写 YAML 必然漂移；生成保证两边永远同源。
 * ScriptCat 只认 text / checkbox / select / number / textarea / mult-select 六种类型，
 * 因此本项目的 radio 统一降级成 select，select/radio 的选项显示 label、存值也存 label，
 * 运行期由 scriptcat-config.service 负责 label ↔ 内部值互转。
 */
import { dynamicSettingsConfig, videoSettingsConfig } from '../src/config/settings-config.ts'
/** YAML 标量：统一用 JSON 双引号写法，YAML 1.2 与 JSON 兼容 */
const q = (value) => JSON.stringify(String(value ?? ''))
/** tips 是字符串或按 configs 计算的函数；这里用默认值求值，并去 HTML/换行 */
const tipsToDescription = (tips, configs) => {
    const raw = typeof tips === 'function' ? tips(configs) : tips
    if (!raw) return ''
    return String(raw)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\bundefined\b/g, '按当前屏幕实测')
        .replace(/\s*\n\s*/g, '\n')
        .trim()
}
/** 递归摊平 section 下的设置项（children 属于同一分组，ScriptCat 没有嵌套） */
const flattenItems = (items, out) => {
    for (const item of items || []) {
        if (!item || item.type === 'section') continue
        out.push(item)
        if (Array.isArray(item.children)) flattenItems(item.children, out)
    }
    return out
}
const collectDefaults = (schema) => {
    const configs = {}
    for (const section of schema) {
        for (const item of flattenItems(section.items || [], [])) {
            configs[item.id] = typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue
        }
    }
    return configs
}
/** radio / select 在 ScriptCat 里显示 label，值也写 label（运行期再映射回内部值） */
const optionLabel = (item, value) => {
    const matched = (item.options || []).find(option => option.value === value)
    return matched ? matched.label : value
}
const describeItem = (item, configs) => {
    const description = tipsToDescription(item.tips, configs)
    const lines = [`  ${item.id}:`, `    title: ${q(item.label || item.id)}`]
    if (description) {
        const quoted = JSON.stringify(description)
        lines.push(`    description: ${quoted}`)
    }
    switch (item.type) {
        case 'checkbox': {
            lines.push('    type: checkbox')
            lines.push(`    default: ${item.defaultValue ? 'true' : 'false'}`)
            break
        }
        case 'number':
        case 'input': {
            if (item.inputType === 'number') {
                lines.push('    type: number')
                lines.push(`    default: ${Number(item.defaultValue) || 0}`)
                break
            }
            lines.push('    type: text')
            if (item.inputType === 'password') lines.push('    password: true')
            lines.push(`    default: ${q(item.defaultValue ?? '')}`)
            break
        }
        case 'radio':
        case 'select': {
            if (!(item.options || []).length) {
                // 动态选项（如 AI 模型列表）：脚本猫面板拿不到运行时列表，降级成自由文本
                lines.push('    type: text')
                lines.push(`    default: ${q(item.defaultValue ?? '')}`)
                break
            }
            const values = (item.options || []).map(option => q(option.label))
            lines.push('    type: select')
            lines.push(`    default: ${q(optionLabel(item, item.defaultValue))}`)
            lines.push(`    values: [${values.join(', ')}]`)
            break
        }
        default: {
            lines.push('    type: text')
            lines.push(`    default: ${q(item.defaultValue ?? '')}`)
        }
    }
    return lines.join('\n')
}
/** 生成 ==UserConfig== 内部 YAML（不含外层注释块） */
export const buildUserConfigYaml = (schema = videoSettingsConfig) => {
    const configs = collectDefaults(schema)
    const groups = []
    for (const section of schema) {
        if (!section || section.type !== 'section') continue
        const items = flattenItems(section.items || [], [])
        if (!items.length) continue
        const groupLabel = String(section.label || section.id)
        const body = items.map(item => describeItem(item, configs)).join('\n')
        groups.push(`${q(groupLabel)}:\n${body}`)
    }
    return groups.join('\n---\n')
}
/** 带注释包裹的完整块，供 vite 注入到脚本头 */
export const buildUserConfigBlock = () => {
    const yaml = buildUserConfigYaml(videoSettingsConfig)
    const dynamic = buildUserConfigYaml(dynamicSettingsConfig)
    const body = dynamic ? `${yaml}\n---\n${dynamic}` : yaml
    return `/* ==UserConfig==\n${body}\n==/UserConfig== */`
}
