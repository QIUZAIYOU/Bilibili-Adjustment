/* global _ */
import { LoggerService } from '@/services/logger.service'
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, initializeCheckbox } from '@/utils/common'
import { SettingsRenderer } from '@/components/settings-renderer'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import { fetchModels, clearModelCache, validateApiKey } from '@/services/ai.service'
import { initTooltip, destroyTooltip, bindTooltipIcons } from '@/components/tooltip.component'
import pkg from '../../package.json'
const logger = new LoggerService('SettingsV2')

/**
 * 新设置组件（基于配置驱动）
 * 与旧版 SettingsComponent 独立，后续可替换旧版
 */
export class SettingsComponentV2 {
    constructor () {
        this.userConfigs = {}
        this.renderer = null
        this.pageType = null
        this.tooltip = null
    }

    async init (userConfigs) {
        this.userConfigs = userConfigs
        this.pageType = await detectivePageType()
        await this.render(this.pageType)
    }

    async render (pageType) {
        try {
            switch (pageType) {
                case 'video':
                    await this.renderVideoSettings()
                    await this.initVideoSettingsEventListeners()
                    break
                case 'dynamic':
                    this.renderDynamicSettings()
                    await this.initDynamicSettingsEventListeners()
                    break
                default:
                    logger.debug(`不支持的页面类型: ${pageType}`)
                    break
            }
        } catch (error) {
            logger.error('设置面板渲染失败', error)
        }
    }

    // ==================== 视频页设置 ====================

    async renderVideoSettings () {
        // 先检查是否已经存在设置面板，如果存在，就先移除它
        const existingSettings = document.getElementById('VideoSettingsPopover')
        if (existingSettings) {
            existingSettings.remove()
        }

        // 销毁旧的 tooltip
        destroyTooltip()

        // 获取动态选项（模型列表等）
        const dynamicOptions = await this.fetchDynamicOptions()

        // 创建渲染器并渲染
        this.renderer = new SettingsRenderer(videoSettingsConfig)
        const formContent = this.renderer.render(this.userConfigs, dynamicOptions)

        // 生成完整弹窗
        const popoverHtml = this.renderer.renderPopover(
            '哔哩哔哩播放页设置',
            pkg.version,
            formContent
        )

        createElementAndInsert(popoverHtml, document.body)

        // 获取 popover DOM 元素（需要等 DOM 插入后才能获取）
        const popover = document.getElementById('VideoSettingsPopover')

        // 初始化 tooltip 并将 tooltip 元素插入 popover 内，避免被 popover 的顶层(top layer)遮挡
        this.tooltip = initTooltip({ delay: 300, hideDelay: 100, container: popover })
        requestAnimationFrame(() => {
            bindTooltipIcons()
        })
    }

    /**
     * 获取动态选项（如模型列表）
     */
    async fetchDynamicOptions () {
        const options = {}
        const useCustomModel = this.userConfigs.use_custom_model || false

        if (!useCustomModel) {
            try {
                const models = await fetchModels(
                    this.userConfigs.ai_apikey,
                    this.userConfigs.ai_provider,
                    this.userConfigs.custom_base_url
                )
                options.ai_model = models.map(model => ({
                    value: model.id,
                    label: model.label
                }))
            } catch (error) {
                logger.error('获取模型列表失败', error)
                // 使用当前模型作为备选
                options.ai_model = [{
                    value: this.userConfigs.ai_model,
                    label: this.userConfigs.ai_model
                }]
            }
        }

        return options
    }

    async initVideoSettingsEventListeners () {
        const popover = document.getElementById('VideoSettingsPopover')
        if (!popover) {
            logger.warn('设置弹窗未找到')
            return
        }

        // 绑定弹窗开关事件
        const app = await elementSelectors.app
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })

        // 绑定所有设置项的 change 事件
        this.bindConfigChangeEvents(popover)

        // 绑定特殊按钮事件（验证、刷新等）
        this.bindSpecialButtonEvents(popover)

        // 绑定导入导出事件
        this.bindImportExportEvents(popover)
    }

    /**
     * 绑定配置项变更事件
     */
    bindConfigChangeEvents (popover) {
        // 复选框
        const checkboxes = popover.querySelectorAll('input[type="checkbox"][data-config-type="checkbox"]')
        checkboxes.forEach(checkbox => {
            addEventListenerToElement(checkbox, 'change', async e => {
                if (!e.target) return
                const configId = e.target.id
                const value = Boolean(e.target.checked)
                await this.saveConfig(configId, value)
                
                // 更新开关样式
                const switchBtn = e.target.closest('.adjustment-switch')
                if (switchBtn) {
                    switchBtn.classList.toggle('on', value)
                }

                // 处理特殊逻辑
                await this.handleSpecialCheckboxChange(configId, value, popover)
                // 刷新可见性
                this.refreshVisibility(popover)
            })
        })

        // 输入框
        const inputs = popover.querySelectorAll('input[data-config-type="input"]')
        inputs.forEach(input => {
            addEventListenerToElement(input, 'change', async e => {
                if (!e.target) return
                const configId = e.target.id
                const value = e.target.value.trim()
                await this.saveConfig(configId, value)

                // 处理特殊输入框变更
                await this.handleSpecialInputChange(configId, value, popover)
            })
        })

        // 下拉框
        const selects = popover.querySelectorAll('select[data-config-type="select"]')
        selects.forEach(select => {
            addEventListenerToElement(select, 'change', async e => {
                if (!e.target) return
                const configId = e.target.id
                const value = e.target.value
                await this.saveConfig(configId, value)

                // 处理特殊下拉框变更
                await this.handleSpecialSelectChange(configId, value, popover)
            })
        })

        // 单选框
        const radios = popover.querySelectorAll('input[data-config-type="radio"]')
        radios.forEach(radio => {
            addEventListenerToElement(radio, 'click', async e => {
                if (!e.target) return
                const name = e.target.name
                const value = e.target.value

                // 更新同组其他单选框状态
                requestAnimationFrame(() => {
                    const group = popover.querySelectorAll(`input[name="${name}"]`)
                    group.forEach(r => {
                        r.checked = false
                        r.removeAttribute('checked')
                    })
                    if (e.target) {
                        e.target.checked = true
                        e.target.setAttribute('checked', 'true')
                    }
                })

                await this.saveConfig(name, value)
            })
        })
    }

    /**
     * 绑定特殊按钮事件（验证、刷新等）
     */
    bindSpecialButtonEvents (popover) {
        // 验证按钮
        const validateButtons = popover.querySelectorAll('[data-validate-for]')
        validateButtons.forEach(button => {
            addEventListenerToElement(button, 'click', async () => {
                const targetId = button.dataset.validateFor
                const input = popover.querySelector(`#${targetId}`)
                const apiKey = input?.value?.trim()

                if (!apiKey) {
                    this.showInputValidationStatus(input, '请先输入 API Key', false)
                    return
                }

                const originalText = button.textContent
                button.textContent = '验证中...'
                button.style.opacity = '0.7'

                try {
                    let result
                    if (targetId === 'ai_apikey') {
                        result = await validateApiKey(apiKey, this.userConfigs.ai_provider, this.userConfigs.custom_base_url)
                    } else if (targetId === 'custom_model_api_key') {
                        const apiUrl = popover.querySelector('#custom_model_api_url')?.value?.trim()
                        if (!apiUrl) {
                            this.showInputValidationStatus(input, '请先输入自定义 API 地址', false)
                            return
                        }
                        result = await validateApiKey(apiKey, 'custom', apiUrl)
                    }

                    if (result?.valid) {
                        this.showInputValidationStatus(input, 'API Key 验证成功 ✓', true)
                    } else {
                        this.showInputValidationStatus(input, `验证失败: ${result?.message}`, false)
                    }
                } catch (error) {
                    this.showInputValidationStatus(input, `验证失败: ${error.message}`, false)
                    logger.error('API Key 验证失败', error)
                } finally {
                    button.textContent = originalText
                    button.style.opacity = '1'
                }
            })
        })

        // 刷新按钮
        const refreshButtons = popover.querySelectorAll('[data-refresh-for]')
        refreshButtons.forEach(button => {
            addEventListenerToElement(button, 'click', async () => {
                const targetId = button.dataset.refreshFor
                if (targetId === 'ai_model') {
                    await this.refreshModelList(popover)
                }
            })
        })
    }

    /**
     * 绑定导入导出事件
     */
    bindImportExportEvents (popover) {
        const exportBtn = popover.querySelector('#ExportUserConfigs')
        const importBtn = popover.querySelector('#ImportUserConfigs')
        const fileInput = popover.querySelector('#ImportUserConfigsFileInput')

        if (exportBtn) {
            addEventListenerToElement(exportBtn, 'click', () => this.exportUserConfigs())
        }
        if (importBtn && fileInput) {
            addEventListenerToElement(importBtn, 'click', () => fileInput.click())
            addEventListenerToElement(fileInput, 'change', e => this.importUserConfigs(e))
        }
    }

    // ==================== 特殊处理逻辑 ====================

    /**
     * 处理特殊复选框变更
     */
    async handleSpecialCheckboxChange (configId, value, popover) {
        // 使用自定义模型开关
        if (configId === 'use_custom_model') {
            if (value) {
                // 开启自定义模型：同步 ai_model
                const customModelId = this.userConfigs.custom_model_id
                if (customModelId) {
                    await this.saveConfig('ai_model', customModelId)
                }
            } else {
                // 关闭自定义模型：先刷新可见性，再刷新模型列表
                await this.refreshModelList(popover)
            }
            // 刷新可见性以显示/隐藏相关配置项
            this.refreshVisibility(popover)
        }

        // 日志级别变更
        if (configId.startsWith('log_level_')) {
            await LoggerService.updateLogLevelsFromConfig(this.userConfigs)
        }

        // 自动开启字幕同步到播放器开关
        if (configId === 'auto_subtitle') {
            console.log('[SettingsV2] auto_subtitle 变更:', { configId, value, configId_type: typeof configId, value_type: typeof value })
            const switchInput = await elementSelectors.AutoEnableSubtitleSwitchInput
            if (switchInput) {
                requestAnimationFrame(() => {
                    switchInput.checked = value
                    switchInput.toggleAttribute('checked', value)
                    console.log('[SettingsV2] 已同步 AutoEnableSubtitleSwitchInput:', switchInput.checked)
                })
            }
            const autoSubtitleEl = document.getElementById('AutoSubtitle')
            if (autoSubtitleEl) {
                requestAnimationFrame(() => {
                    autoSubtitleEl.checked = value
                    autoSubtitleEl.toggleAttribute('checked', value)
                    console.log('[SettingsV2] 已同步 AutoSubtitle:', autoSubtitleEl.checked)
                })
            }
        }
    }

    /**
     * 处理特殊输入框变更
     */
    async handleSpecialInputChange (configId, value, popover) {
        // API Key 变更时刷新模型列表
        if (configId === 'ai_apikey') {
            clearModelCache()
            await this.refreshModelList(popover)
        }

        // 自定义 API 地址变更时刷新模型列表
        if (configId === 'custom_base_url') {
            clearModelCache()
            await this.refreshModelList(popover)
        }

        // 自定义模型 ID 变更时同步 ai_model
        if (configId === 'custom_model_id' && this.userConfigs.use_custom_model) {
            await this.saveConfig('ai_model', value)
        }
    }

    /**
     * 处理特殊下拉框变更
     */
    async handleSpecialSelectChange (configId, value, popover) {
        // AI 提供商切换时刷新模型列表
        if (configId === 'ai_provider') {
            clearModelCache()
            await this.refreshModelList(popover)
        }
    }

    /**
     * 刷新模型列表
     */
    async refreshModelList (popover) {
        const modelSelect = popover.querySelector('#ai_model')
        if (!modelSelect) return

        clearModelCache()
        try {
            const models = await fetchModels(
                this.userConfigs.ai_apikey,
                this.userConfigs.ai_provider,
                this.userConfigs.custom_base_url
            )
            if (models.length > 0) {
                modelSelect.innerHTML = models.map(model => `
                    <option value="${model.id}">${model.label}</option>
                `).join('')
                modelSelect.value = models[0].id
                await this.saveConfig('ai_model', models[0].id)
            }
            logger.info('模型列表已刷新')
        } catch (error) {
            logger.error('刷新模型列表失败', error)
        }
    }

    /**
     * 刷新设置项可见性 —— 遍历所有配置项，重新评估 visible 条件
     */
    refreshVisibility (popover) {
        const allItems = this.getAllConfigItems()

        allItems.forEach(item => {
            if (!item.visible) return // 没有 visible 条件的项不处理

            const isVisible = typeof item.visible === 'function'
                ? item.visible(this.userConfigs)
                : Boolean(item.visible)

            // 查找 DOM：先找 wrapper，再找 item 本身
            let domItem = popover.querySelector(`.adjustment-setting-item-wrapper[data-config-id="${item.id}"]`)
            if (!domItem) {
                domItem = popover.querySelector(`[data-config-id="${item.id}"]`)
            }
            if (!domItem) return

            domItem.style.display = isVisible ? 'block' : 'none'

            logger.debug(`刷新可见性: ${item.id} = ${isVisible}`)
        })

        // 处理设置有子项的可见性（父开关关闭时隐藏子项）
        this.handleChildrenVisibility(popover)
    }

    /**
     * 处理父子设置项的可见性
     * 容器可见条件：父 checkbox 开启 且 至少有一个子项满足自身 visible 条件
     * 子项自身的 visible 条件（如 is_vip）作用于容器层而非单个子项 wrapper
     */
    handleChildrenVisibility (popover) {
        // 所有包含 children 的父项 id 列表
        const parentIds = ['auto_locate', 'auto_select_video_highest_quality', 'pause_video']

        parentIds.forEach(parentId => {
            const parentCheckbox = popover.querySelector(`#${parentId}`)
            if (!parentCheckbox) return

            const parentEnabled = parentCheckbox.checked
            const parentConfig = this.findConfigItem(parentId)
            if (!parentConfig?.children) return

            // 检查是否有子项在当前配置下可见
            const anyChildVisible = parentConfig.children.some(child => {
                if (!child.visible) return true
                if (typeof child.visible === 'function') return child.visible(this.userConfigs)
                return Boolean(child.visible)
            })

            const containerVisible = parentEnabled && anyChildVisible

            // 查找父项下的 .adjustment-setting-children 容器
            const childrenContainer = popover.querySelector(
                `.adjustment-setting-item[data-config-id="${parentId}"] > .adjustment-setting-children`
            )

            if (childrenContainer) {
                childrenContainer.style.display = containerVisible ? 'flex' : 'none'
                logger.debug(`刷新子项容器可见性: ${parentId} 容器 = ${containerVisible} (父=${parentEnabled}, 有子项可见=${anyChildVisible})`)
            }
        })
    }

    /**
     * 在配置中查找设置项
     */
    findConfigItem (id) {
        const findInItems = (items) => {
            for (const item of items) {
                if (item.id === id) return item
                if (item.children) {
                    const found = findInItems(item.children)
                    if (found) return found
                }
                if (item.items) {
                    const found = findInItems(item.items)
                    if (found) return found
                }
            }
            return null
        }
        return findInItems(videoSettingsConfig)
    }

    /**
     * 获取所有配置项（扁平化）
     */
    getAllConfigItems () {
        const items = []
        const collectItems = (configItems) => {
            for (const item of configItems) {
                items.push(item)
                if (item.children) {
                    collectItems(item.children)
                }
                if (item.items) {
                    collectItems(item.items)
                }
            }
        }
        collectItems(videoSettingsConfig)
        return items
    }

    // ==================== 动态页设置 ====================

    renderDynamicSettings () {
        const existingSettings = document.getElementById('DynamicSettingsPopover')
        if (existingSettings) {
            existingSettings.remove()
        }

        this.renderer = new SettingsRenderer(dynamicSettingsConfig)
        const formContent = this.renderer.render(this.userConfigs)

        const popoverHtml = this.renderer.renderDynamicPopover(
            '哔哩哔哩动态页设置',
            pkg.version,
            formContent
        )

        createElementAndInsert(popoverHtml, document.body)
    }

    async initDynamicSettingsEventListeners () {
        const popover = document.getElementById('DynamicSettingsPopover')
        if (!popover) return

        const app = await elementSelectors.app
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })

        // 绑定动态页输入框事件
        const inputs = popover.querySelectorAll('input[data-config-type="input"]')
        inputs.forEach(input => {
            addEventListenerToElement(input, 'change', async e => {
                await this.saveConfig(e.target.id, e.target.value.trim())
            })
        })

        // 绑定保存按钮点击事件 — 配置已即时保存，点击仅关闭弹窗
        const saveBtn = document.getElementById('DynamicSettingsSaveButton')
        if (saveBtn) {
            addEventListenerToElement(saveBtn, 'click', () => {
                popover.hidePopover()
            })
        }
    }

    // ==================== 通用方法 ====================

    /**
     * 保存配置
     */
    async saveConfig (key, value) {
        await storageService.userSet(key, value)
        this.userConfigs[key] = value
        logger.debug(`配置已更新: ${key} = ${value}`)
    }

    /**
     * 显示输入框验证状态
     * @param {HTMLElement} input - 输入框元素
     * @param {string} message - 提示消息
     * @param {boolean} isSuccess - 是否成功
     */
    showInputValidationStatus (input, message, isSuccess) {
        if (!input) return

        // 设置边框颜色
        input.style.borderColor = isSuccess ? '#2ed573' : '#ff4757'
        input.style.boxShadow = isSuccess 
            ? '0 0 0 3px rgba(46, 213, 115, 0.15)' 
            : '0 0 0 3px rgba(255, 71, 87, 0.15)'

        // 创建或更新提示消息元素
        let statusElement = input.parentElement.querySelector('.validation-status-message')
        if (!statusElement) {
            statusElement = document.createElement('div')
            statusElement.className = 'validation-status-message'
            statusElement.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                margin-top: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 10;
            `
            input.parentElement.style.position = 'relative'
            input.parentElement.appendChild(statusElement)
        }

        statusElement.textContent = message
        statusElement.style.color = isSuccess ? '#2ed573' : '#ff4757'
        statusElement.style.display = 'block'

        // 3秒后恢复默认状态
        setTimeout(() => {
            if (input) {
                input.style.borderColor = ''
                input.style.boxShadow = ''
            }
            if (statusElement) {
                statusElement.style.display = 'none'
            }
        }, 3000)
    }

    /**
     * 显示 API 状态消息（兼容旧版）
     */
    showApiStatusMessage (message, type = 'info') {
        // 使用新的输入框验证状态显示
        const popover = document.getElementById('VideoSettingsPopover')
        if (popover) {
            const input = popover.querySelector('#ai_apikey') || popover.querySelector('#custom_model_api_key')
            const isSuccess = type === 'success'
            this.showInputValidationStatus(input, message, isSuccess)
        }
    }

    /**
     * 导出用户配置
     * 合并已存储的配置与默认值，确保所有已知配置项都被导出
     */
    async exportUserConfigs () {
        try {
            // 获取所有已存储的配置
            const storedSettings = await storageService.getAll('user')
            const storedMap = new Map(storedSettings.map(s => [s.key, s.value]))

            // 合并默认值与已存值，确保每项都被导出
            const mergedConfigs = {}
            for (const [key, defaultValue] of ConfigService.DEFAULT_VALUES.entries()) {
                mergedConfigs[key] = storedMap.has(key) ? storedMap.get(key) : defaultValue
            }

            const configCount = Object.keys(mergedConfigs).length
            const blob = new Blob([JSON.stringify(mergedConfigs, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `bilibili_adjustment_settings_${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            logger.info(`配置已导出，共 ${configCount} 项`)
        } catch (error) {
            logger.error('导出设置失败:', error)
        }
    }

    /**
     * 导入用户配置
     * 兼容新版 {key: value} 和旧版 [{key, value, timestamp}] 两种格式
     * 只导入已知的有效配置项，忽略未知键
     */
    async importUserConfigs (event) {
        const file = event?.target?.files?.[0]
        if (!file) return
        try {
            const reader = new FileReader()
            reader.onload = async e => {
                try {
                    const data = JSON.parse(e.target.result)
                    let configEntries = []

                    if (Array.isArray(data)) {
                        // 兼容旧版导出格式: [{key, value, timestamp}]
                        configEntries = data
                            .filter(item => item && item.key)
                            .map(item => ({ key: item.key, value: item.value }))
                    } else if (typeof data === 'object' && data !== null) {
                        // 新版格式: {key: value}
                        configEntries = Object.entries(data).map(([key, value]) => ({ key, value }))
                    } else {
                        alert('导入失败：文件格式不正确')
                        return
                    }

                    // 只导入已知的配置项，过滤掉未知的键
                    const validKeys = new Set(ConfigService.DEFAULT_VALUES.keys())
                    const validEntries = configEntries.filter(entry => validKeys.has(entry.key))
                    const skippedCount = configEntries.length - validEntries.length

                    if (validEntries.length === 0) {
                        alert('导入失败：文件中没有有效的配置项')
                        return
                    }

                    await storageService.batchSet('user', validEntries)

                    let message = `成功导入 ${validEntries.length} 项配置`
                    if (skippedCount > 0) {
                        message += `，已忽略 ${skippedCount} 项未知配置`
                    }
                    alert(message)
                    location.reload()
                } catch (parseError) {
                    logger.error('解析设置文件失败:', parseError)
                    alert('导入失败：文件格式不正确')
                }
            }
            reader.onerror = () => {
                logger.error('读取文件失败')
                alert('读取文件失败，请重试')
            }
            reader.readAsText(file)
        } catch (error) {
            logger.error('导入设置失败:', error)
            alert('导入设置失败: ' + error.message)
        }
    }
}
