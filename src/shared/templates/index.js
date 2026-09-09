import { registerTemplates, recordTemplateUsage } from '../template-registry'
import { buttonTemplates } from './buttons'
import { historyPopoverTemplate } from './popovers/history-popover'
import { subtitleSwitchTemplates } from './subtitle/subtitle-switch'
const templates = {
    ...buttonTemplates,
    ...historyPopoverTemplate,
    ...subtitleSwitchTemplates
}
// 初始化注册所有模板到 TemplateRegistry
registerTemplates(templates)
export const getTemplates = new Proxy(templates, {
    get (target, prop) {
        recordTemplateUsage(prop)
        return target[prop]
    }
})
