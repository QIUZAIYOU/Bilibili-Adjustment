import { registerTemplates, recordTemplateUsage, updateTemplate } from '../template-registry'
import { registerHotConfigTarget } from '../hot-config-registry'
import { checkTemplateOverride } from '../hot-config'
import { buttonTemplates } from './buttons'
import { historyPopoverTemplate } from './popovers/history-popover'
import { subtitleSwitchTemplates } from './subtitle/subtitle-switch'
import { commentWrapperTemplates } from './comment/comment-wrappers'
import { homePreviewTemplates } from './home/home-preview'
import { loadingTemplates } from './loading'
const templates = {
    ...buttonTemplates,
    ...historyPopoverTemplate,
    ...subtitleSwitchTemplates,
    ...commentWrapperTemplates,
    ...homePreviewTemplates,
    ...loadingTemplates
}
// 初始化注册所有模板到 TemplateRegistry
registerTemplates(templates)
export const getTemplates = new Proxy(templates, {
    get (target, prop) {
        // prop 实际只用字符串键；symbol 仅来自运行时特性探测，统一转字符串便于类型检查
        recordTemplateUsage(String(prop))
        return Reflect.get(target, prop)
    }
})
/**
 * 模板占位符的两条用法（2026-09-25 起）：
 * 1. **运行时内容一律用填充钩子**，不要往 HTML 里拼字符串：文本用 `data-adj-field="text"`
 *    标出、由调用点用 `queryTemplateTextField()` 填；类名/内联样式/B 站作用域属性（`data-v-xxxx`）
 *    由调用点用 DOM API 补（`classList.add` / `setAttribute`）。
 *    好处：不用拼 HTML（无引号转义风险）、类型可见、覆盖校验能按钩子把关（`checkTemplateOverride`）。
 * 2. `[[UPPER_SNAKE]]` 占位符**只留给本身就是字符串的场景**（如 `[[BVID]]` 这类 URL 模板），
 *    由调用点的纯函数（如 `buildPreviewUrl`）替换。
 *
 * ⚠️ 不要在本 barrel 里新增「渲染模板」之类的导出（2026-09-25 实测踩坑）：从 barrel 新增导出的函数
 * 在生产产物里会被**错误绑定** —— 调用它对任何模板都返回空串（`getTemplates.xxx` 本身正常），
 * 随后 `createElementAndInsert` 抛「Invalid HTML string provided」。需要渲染函数时，放到自己的模块里
 * 并从该模块直接 import（`buttons.js` 的 `queryTemplateTextField` 就是这种用法）。
 */
/**
 * 模板热更覆盖（改注入页面的 HTML 不必等发版）
 *
 * 这里**只能覆盖 `templates` 里已有的 key**（即上面三份模板合并后的名字），因此：
 * - `comments/video-description.js` 的 `renderVideoDescription` 是函数、被直接 import，**不在覆盖范围**；
 * - 覆盖时要过契约校验 `checkTemplateOverride`：内置模板的 `[[占位符]]` 与 `id="..."` 必须全部保留
 *   （调用点按 id 取元素、按占位符替换，缺任何一个都会静默失效），并拦掉脚本/内联事件等可执行内容。
 */
/** @type {Record<string, string>} 可用作「字符串键索引」的同一份模板表（热更覆盖就地改写它） */
const templateMap = templates
registerHotConfigTarget('templates', {
    keys: () => Object.keys(templateMap),
    apply: (name, value) => {
        const reason = checkTemplateOverride(value, templateMap[name])
        if (reason) throw new Error(reason)
        const html = String(value).trim()
        templateMap[name] = html
        // 同步注册表元数据（选择器/id 提取、版本号），保持与 getTemplates 一致
        updateTemplate(name, html)
        return true
    }
})
