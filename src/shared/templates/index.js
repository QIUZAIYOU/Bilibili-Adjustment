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
 * ⚠️ 不要在这里新增「渲染模板」之类的导出（2026-09-25 实测踩坑）：
 * 从本 barrel 新增导出的函数在生产产物里会被**错误绑定** —— 调用它对任何模板都返回空串
 * （`getTemplates.xxx` 本身正常），随后 `createElementAndInsert` 抛「Invalid HTML string provided」。
 * 需要替换模板占位符时，请在调用点直接 `getTemplates.xxx.replaceAll('[[KEY]]', 值)`
 * （这也正是 `buttons.js` 的 `renderButton` 的做法，它从自己的模块导出、不受此影响）。
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
