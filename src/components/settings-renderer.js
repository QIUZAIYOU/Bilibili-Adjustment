import { LoggerService } from '@/services/logger.service'
import { initTooltip } from '@/components/tooltip.component'
const logger = new LoggerService('SettingsRenderer')

/**
 * 设置项渲染器
 * 根据配置定义动态生成设置面板 HTML
 */
export class SettingsRenderer {
    constructor(config) {
        this.config = config
        this.tooltip = null
    }

    /**
     * 初始化 tooltip
     */
    initTooltip() {
        if (!this.tooltip) {
            this.tooltip = initTooltip({ delay: 300, hideDelay: 100 })
        }
    }

    /**
     * 渲染完整设置表单
     * @param {Object} userConfigs - 当前用户配置值
     * @param {Object} dynamicOptions - 动态选项（如模型列表）
     * @returns {string} HTML 字符串
     */
    render(userConfigs, dynamicOptions = {}) {
        const items = this.config.map(item => this.renderItem(item, userConfigs, dynamicOptions)).join('')
        return `<div class="adjustment-form">${items}</div>`
    }

    /**
     * 渲染单个设置项 - 始终渲染，只是设置 display 样式
     */
    renderItem(item, userConfigs, dynamicOptions = {}) {
        // 计算可见性
        const isVisible = this.isVisible(item, userConfigs)
        const displayStyle = isVisible ? 'block' : 'none'
        
        // 获取内容
        let content = ''
        switch (item.type) {
            case 'section':
                content = this.renderSection(item, userConfigs, dynamicOptions)
                break
            case 'checkbox':
                content = this.renderCheckbox(item, userConfigs)
                break
            case 'input':
                content = this.renderInput(item, userConfigs)
                break
            case 'select':
                content = this.renderSelect(item, userConfigs, dynamicOptions)
                break
            case 'radio':
                content = this.renderRadio(item, userConfigs)
                break
            default:
                logger.warn(`未知的设置项类型: ${item.type}`)
                return ''
        }
        
        // 如果是普通设置项（非section），包裹并设置 display
        if (item.id && item.type !== 'section') {
            return `<div class="adjustment-setting-item-wrapper" data-config-id="${item.id}" style="display: ${displayStyle};">${content}</div>`
        }
        
        return content
    }

    /**
     * 渲染区域（section）
     */
    renderSection(item, userConfigs, dynamicOptions) {
        // 检测是否所有子项都是 inline checkbox，如果是则使用紧凑网格布局
        const allInline = item.items?.every(subItem => subItem.inline && subItem.type === 'checkbox')
        const layoutClass = allInline ? 'adjustment-section-content compact-grid' : 'adjustment-section-content'

        const content = item.items
            .map(subItem => this.renderItem(subItem, userConfigs, dynamicOptions))
            .join('')

        return `
            <div class="adjustment-section ${item.id}">
                <div class="adjustment-section-title">${item.label}</div>
                <div class="${layoutClass}">
                    ${content}
                </div>
            </div>
        `.trim()
    }

    /**
     * 生成提示图标 HTML - 使用 SVG
     */
    renderTipsIcon(item, userConfigs) {
        if (!item.tips) return ''
        const tipsContent = this.resolveTips(item.tips, userConfigs)
        // 转义 HTML 特殊字符，但保留换行符用于后续转换
        const escapedContent = tipsContent
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
        return `<span class="adjustment-tips-icon" data-tooltip="${escapedContent}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>`
    }

    /**
     * 渲染复选框 - 新布局
     */
    renderCheckbox(item, userConfigs) {
        const value = userConfigs[item.id] || false
        const children = item.children
            ?.map(child => this.renderItem(child, userConfigs))
            .join('') || ''

        const switchClass = value ? 'on' : ''
        const hasChildren = item.children && item.children.length > 0
        const childrenDisplayStyle = value ? 'flex' : 'none'
        const tipsIcon = this.renderTipsIcon(item, userConfigs)

        // 日志配置等inline项：紧凑布局，一行多个
        if (item.inline) {
            return `
                <div class="adjustment-setting-item inline-checkbox" data-config-id="${item.id}">
                    <div class="adjustment-setting-label">${item.label}${tipsIcon}</div>
                    <div class="adjustment-switch ${switchClass}">
                        <input type="checkbox" id="${item.id}" ${value ? 'checked' : ''} class="adjustment-checkbox checkbox" data-config-type="checkbox">
                        <div class="adjustment-switch-knob"></div>
                    </div>
                </div>
            `.trim()
        }

        // 普通项：标签+开关横向，子项在下方紧凑排列
        return `
            <div class="adjustment-setting-item" data-config-id="${item.id}">
                <div class="adjustment-setting-main">
                    <div class="adjustment-setting-info">
                        <div class="adjustment-setting-label">${item.label}${tipsIcon}</div>
                        ${item.description ? `<div class="adjustment-setting-desc">${item.description}</div>` : ''}
                    </div>
                    <div class="adjustment-setting-control">
                        <div class="adjustment-switch ${switchClass}">
                            <input type="checkbox" id="${item.id}" ${value ? 'checked' : ''} class="adjustment-checkbox checkbox" data-config-type="checkbox">
                            <div class="adjustment-switch-knob"></div>
                        </div>
                    </div>
                </div>
                ${hasChildren ? `<div class="adjustment-setting-children" style="display: ${childrenDisplayStyle};">${children}</div>` : ''}
            </div>
        `.trim()
    }

    /**
     * 渲染输入框 - 新布局
     */
    renderInput(item, userConfigs) {
        const value = userConfigs[item.id] || ''
        const inputType = item.inputType || 'text'
        const placeholder = item.placeholder || ''
        const validateButton = item.hasValidateButton
            ? `<div id="Validate${this.toPascalCase(item.id)}" class="adjustment-button secondary" style="padding:4px 12px;font-size:12px;white-space:nowrap;cursor:pointer;height:32px;" data-validate-for="${item.id}">${item.validateButtonText}</div>`
            : ''
        const tipsIcon = this.renderTipsIcon(item, userConfigs)

        return `
            <div class="adjustment-setting-item" data-config-id="${item.id}">
                <div class="adjustment-setting-main">
                    <div class="adjustment-setting-info">
                        <div class="adjustment-setting-label">${item.label}${tipsIcon}</div>
                        ${item.description ? `<div class="adjustment-setting-desc">${item.description}</div>` : ''}
                    </div>
                    <div class="adjustment-setting-control">
                        <input id="${item.id}" class="adjustment-input" type="${inputType}" value="${this.escapeHtml(value)}" placeholder="${placeholder}" data-config-type="input">
                        ${validateButton}
                    </div>
                </div>
            </div>
        `.trim()
    }

    /**
     * 渲染下拉选择框 - 新布局
     */
    renderSelect(item, userConfigs, dynamicOptions = {}) {
        const value = userConfigs[item.id] || ''
        const options = dynamicOptions[item.id] || item.options || []
        const optionsHtml = options.map(opt => `
            <option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.label}</option>
        `).join('')

        const refreshButton = item.hasRefreshButton
            ? `<div id="Refresh${this.toPascalCase(item.id)}" class="adjustment-button secondary" style="padding:4px 12px;font-size:12px;white-space:nowrap;cursor:pointer;height:32px;" data-refresh-for="${item.id}">${item.refreshButtonText}</div>`
            : ''
        const tipsIcon = this.renderTipsIcon(item, userConfigs)

        return `
            <div class="adjustment-setting-item" data-config-id="${item.id}">
                <div class="adjustment-setting-main">
                    <div class="adjustment-setting-info">
                        <div class="adjustment-setting-label">${item.label}${tipsIcon}</div>
                        ${item.description ? `<div class="adjustment-setting-desc">${item.description}</div>` : ''}
                    </div>
                    <div class="adjustment-setting-control">
                        <div class="adjustment-select">
                            <select id="${item.id}" data-config-type="select">${optionsHtml}</select>
                        </div>
                        ${refreshButton}
                    </div>
                </div>
            </div>
        `.trim()
    }

    /**
     * 渲染单选框组 - 新布局
     */
    renderRadio(item, userConfigs) {
        const value = userConfigs[item.id] || ''
        const optionsHtml = item.options?.map(opt => `
            <label class="adjustment-radio-item">
                <input class="radio" type="radio" name="${item.id}" value="${opt.value}" ${value === opt.value ? 'checked' : ''} data-config-type="radio">
                <span>${opt.label}</span>
            </label>
        `).join('') || ''
        const tipsIcon = this.renderTipsIcon(item, userConfigs)

        return `
            <div class="adjustment-setting-item" data-config-id="${item.id}">
                <div class="adjustment-setting-main">
                    <div class="adjustment-setting-info">
                        <div class="adjustment-setting-label">${item.label}${tipsIcon}</div>
                        ${item.description ? `<div class="adjustment-setting-desc">${item.description}</div>` : ''}
                    </div>
                    <div class="adjustment-setting-control">
                        <div class="adjustment-radio-group">${optionsHtml}</div>
                    </div>
                </div>
            </div>
        `.trim()
    }

    /**
     * 检查设置项是否可见
     */
    isVisible(item, userConfigs) {
        if (!item.visible) return true
        if (typeof item.visible === 'function') {
            return item.visible(userConfigs)
        }
        return Boolean(item.visible)
    }

    /**
     * 解析提示文本（支持函数和字符串）
     */
    resolveTips(tips, userConfigs) {
        if (typeof tips === 'function') {
            return tips(userConfigs)
        }
        return tips
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return text
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    /**
     * 转换为 PascalCase（用于生成按钮 ID）
     */
    toPascalCase(str) {
        return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())
    }

    /**
     * 生成完整弹窗 HTML
     */
    renderPopover(title, version, formContent, extraButtons = '') {
        return `
            <bilibili-adjustment-video-setting id="VideoSettingsPopover" class="adjustment-popover" popover bilibili-adjustment-element>
                <div class="adjustment-popover-header">
                    <div class="adjustment-popover-header-top">
                        <div class="adjustment-popover-title">${title}</div>
                        <div class="adjustment-popover-version">v${version}</div>
                    </div>
                    <div class="adjustment-popover-subtitle">以下设置更改即生效，刷新页面即可应用</div>
                </div>
                <div class="adjustment-recommend">
                    推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a>
                </div>
                ${formContent}
                <div class="adjustment-buttonGroup">
                    <div id="ExportUserConfigs" class="adjustment-button secondary">导出配置</div>
                    <div id="ImportUserConfigs" class="adjustment-button primary">导入配置</div>
                    <input type="file" id="ImportUserConfigsFileInput" accept=".json" style="display:none">
                    ${extraButtons}
                </div>
            </bilibili-adjustment-video-setting>
        `.trim()
    }

    /**
     * 生成动态页设置弹窗 HTML
     */
    renderDynamicPopover(title, version, formContent) {
        return `
            <bilibili-adjustment-dynamic-setting id="DynamicSettingsPopover" class="adjustment-popover" popover bilibili-adjustment-element>
                <div class="adjustment-popover-header">
                    <div class="adjustment-popover-header-top">
                        <div class="adjustment-popover-title">${title}</div>
                        <div class="adjustment-popover-version">v${version}</div>
                    </div>
                    <div class="adjustment-popover-subtitle">以下设置更改即生效，刷新页面即可应用</div>
                </div>
                <div class="adjustment-recommend">
                    推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a>
                </div>
                ${formContent}
                <div class="adjustment-buttonGroup">
                    <button id="DynamicSettingsSaveButton" class="adjustment-button primary">保存</button>
                </div>
            </bilibili-adjustment-dynamic-setting>
        `.trim()
    }
}
