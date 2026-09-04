import { registerTemplates, recordTemplateUsage, getTemplate } from '../template-registry'

import { buttonTemplates } from './buttons'
import { videoSettingsTemplate } from './popovers/video-settings'
import { dynamicSettingsTemplate } from './popovers/dynamic-settings'
import { skipSegmentManagerTemplate } from './popovers/skip-segment-manager'
import { updateNotificationTemplate } from './popovers/update-notification'
import { upSpacePopupTemplate } from './popovers/up-space-popup'
import { historyPopoverTemplate } from './popovers/history-popover'
import { videoDescriptionTemplate } from './comments/video-description'
import { subtitleSwitchTemplates } from './subtitle/subtitle-switch'

const templates = {
    ...buttonTemplates,
    ...videoSettingsTemplate,
    ...dynamicSettingsTemplate,
    ...skipSegmentManagerTemplate,
    ...updateNotificationTemplate,
    ...upSpacePopupTemplate,
    ...historyPopoverTemplate,
    ...videoDescriptionTemplate,
    ...subtitleSwitchTemplates,
}

// 初始化注册所有模板到 TemplateRegistry
registerTemplates(templates)

const replaceTemplateKeywords = (template, variables) => {
    if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
            template = template.replaceAll(`[[${key.toUpperCase()}]]`, value)
        })
        return template
    }
    return template
}

export const getTemplates = new Proxy(templates, {
    get (target, prop) {
        if (prop === 'replace') {
            return (template, variables) => {
                recordTemplateUsage(template)
                const templateContent = getTemplate(template) || templates[template]
                return replaceTemplateKeywords(templateContent, variables)
            }
        }
        recordTemplateUsage(prop)
        return target[prop]
    }
})
