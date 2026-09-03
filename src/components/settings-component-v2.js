import { LoggerService } from '@/services/logger.service'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, escapeHtml, enablePopoverLightDismiss } from '@/utils/common'
import { SettingsRenderer } from '@/components/settings-renderer'
import { updateService } from '@/services/update.service'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import { fetchModels, clearModelCache, validateApiKey } from '@/services/ai.service'
import { initTooltip, destroyTooltip, bindTooltipIcons } from '@/components/tooltip-component'
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
        // 订阅其他标签页的配置变更，实时同步设置弹窗状态（只订阅一次，SPA 导航重复 init 不重复订阅）
        if (!this._configSyncUnsubscribe) {
            this._configSyncUnsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, async (_, { key, value }) => {
                this.userConfigs[key] = value
                this.syncConfigControl(key, value)
                // 日志级别跨标签同步
                if (key.startsWith('log_level_')) {
                    await LoggerService.updateLogLevelsFromConfig(this.userConfigs)
                }
                // AI 凭证类配置变更时重新拉取模型列表，保持各标签页下拉选项一致
                if (key === 'ai_apikey' || key === 'ai_provider' || key === 'custom_base_url') {
                    const popover = document.getElementById('VideoSettingsPopover')
                    if (popover) {
                        await this.refreshModelList(popover)
                    }
                }
            })
        }
        await this.render(this.pageType)
    }
    /**
     * 打开设置弹窗：容器已在关闭时销毁，不存在则重新渲染再打开
     */
    async openSettings () {
        const popoverId = this.pageType === 'dynamic' ? 'DynamicSettingsPopover' : 'VideoSettingsPopover'
        let popover = document.getElementById(popoverId)
        if (!popover) {
            await this.init(this.userConfigs)
            popover = document.getElementById(popoverId)
        }
        if (popover) popover.showPopover()
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
            existingSettings.__popoverDismissCleanup?.()
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
        // 绑定弹窗开关事件；关闭后移除容器（统一关闭逻辑），重开时经 openSettings 重建
        const app = await elementSelectors.app || document.querySelector('#__next') || document.body
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                destroyTooltip()
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
        // 绑定所有设置项的 change 事件
        this.bindConfigChangeEvents(popover)
        // 绑定特殊按钮事件（验证、刷新等）
        this.bindSpecialButtonEvents(popover)
        // 绑定导入导出事件
        this.bindImportExportEvents(popover)
        this.bindVersionUpdateCheck(popover)
    }
    /**
     * 绑定版本号点击检查更新：结果小字展示在版本号下方
     */
    bindVersionUpdateCheck (popover) {
        const versionEl = popover.querySelector('.adjustment-popover-version')
        const statusEl = popover.querySelector('.adjustment-popover-version-status')
        if (!versionEl || !statusEl) return
        let checking = false
        let hideTimer = null
        const showStatus = (text, className = '') => {
            clearTimeout(hideTimer)
            statusEl.className = 'adjustment-popover-version-status'
            if (className) statusEl.classList.add(className)
            statusEl.textContent = text
            hideTimer = setTimeout(() => {
                statusEl.classList.add('hidden')
            }, 3000)
        }
        addEventListenerToElement(versionEl, 'click', async () => {
            if (checking) return
            checking = true
            statusEl.classList.remove('hidden')
            statusEl.className = 'adjustment-popover-version-status'
            statusEl.textContent = '检查更新中…'
            clearTimeout(hideTimer)
            try {
                const result = await updateService.checkForUpdatesManually(pkg.version, pkg.updates)
                if (result.type === 'latest') {
                    showStatus(`已是最新版本 v${pkg.version}`)
                } else if (result.type === 'update') {
                    showStatus(`发现新版本 v${result.latestVersion}`, 'update')
                } else {
                    showStatus('检查更新失败，请稍后重试', 'error')
                }
            } finally {
                checking = false
            }
        })
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
                const oldValue = this.userConfigs[configId]
                await this.saveConfig(configId, value)
                // 处理特殊下拉框变更
                await this.handleSpecialSelectChange(configId, value, oldValue, popover)
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
                // 刷新可见性（如 网页全屏模式解锁 仅在选择网页全屏时显示）
                this.refreshVisibility(popover)
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
                // 反馈期内重复点击时保留更早记录的原始文字
                if (button._feedbackOriginalText === undefined) {
                    button._feedbackOriginalText = button.textContent
                }
                if (!apiKey) {
                    this.setButtonFeedback(button, false, '', '验证失败')
                    return
                }
                button.textContent = '验证中...'
                button.style.opacity = '0.7'
                button.style.borderColor = ''
                button.style.color = ''
                try {
                    let result
                    if (targetId === 'ai_apikey') {
                        result = await validateApiKey(apiKey, this.userConfigs.ai_provider, this.userConfigs.custom_base_url)
                    } else if (targetId === 'custom_model_api_key') {
                        const apiUrl = popover.querySelector('#custom_model_api_url')?.value?.trim()
                        if (!apiUrl) {
                            this.setButtonFeedback(button, false, '', '验证失败')
                            return
                        }
                        result = await validateApiKey(apiKey, 'custom', apiUrl)
                    }
                    this.setButtonFeedback(button, result?.valid, '验证成功', '验证失败')
                } catch (error) {
                    logger.error('API Key 验证失败', error)
                    this.setButtonFeedback(button, false, '', '验证失败')
                } finally {
                    button.style.opacity = '1'
                }
            })
        })
        // 刷新按钮
        const refreshButtons = popover.querySelectorAll('[data-refresh-for]')
        refreshButtons.forEach(button => {
            addEventListenerToElement(button, 'click', async () => {
                const targetId = button.dataset.refreshFor
                if (targetId !== 'ai_model') return
                if (button._feedbackOriginalText === undefined) {
                    button._feedbackOriginalText = button.textContent
                }
                button.textContent = '刷新中...'
                button.style.opacity = '0.7'
                button.style.borderColor = ''
                button.style.color = ''
                try {
                    const success = await this.refreshModelList(popover)
                    this.setButtonFeedback(button, success, '刷新成功', '刷新失败')
                } catch (error) {
                    logger.error('刷新模型列表失败', error)
                    this.setButtonFeedback(button, false, '', '刷新失败')
                } finally {
                    button.style.opacity = '1'
                }
            })
        })
    }
    /**
     * 设置按钮结果反馈：成功绿色/失败红色边框与文字，3 秒后恢复默认样式
     * @param {HTMLElement} button - 按钮元素
     * @param {boolean} success - 是否成功
     * @param {string} successText - 成功时按钮文字（空则不改变文字）
     * @param {string} failureText - 失败时按钮文字（空则不改变文字）
     */
    setButtonFeedback (button, success, successText = '', failureText = '') {
        if (!button) return
        const isSuccess = Boolean(success)
        button.style.borderColor = isSuccess ? '#2ed573' : '#ff4757'
        if (successText || failureText) {
            button.textContent = isSuccess ? successText : failureText
            button.style.color = isSuccess ? '#2ed573' : '#ff4757'
        }
        clearTimeout(button._feedbackResetTimer)
        button._feedbackResetTimer = setTimeout(() => {
            button.style.borderColor = ''
            button.style.color = ''
            if (button._feedbackOriginalText !== undefined) {
                button.textContent = button._feedbackOriginalText
                button._feedbackOriginalText = undefined
            }
        }, 3000)
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
            const switchInput = await elementSelectors.AutoEnableSubtitleSwitchInput
            if (switchInput) {
                requestAnimationFrame(() => {
                    switchInput.checked = value
                    switchInput.toggleAttribute('checked', value)
                })
            }
            const autoSubtitleEl = document.getElementById('AutoSubtitle')
            if (autoSubtitleEl) {
                requestAnimationFrame(() => {
                    autoSubtitleEl.checked = value
                    autoSubtitleEl.toggleAttribute('checked', value)
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
    async handleSpecialSelectChange (configId, value, oldValue, popover) {
        // AI 提供商切换时刷新模型列表
        if (configId === 'ai_provider') {
            await this.switchAIProvider(value, oldValue, popover)
        }
    }
    /**
     * 切换 AI 提供商：按供应商隔离保存/恢复 API Key 与模型
     */
    async switchAIProvider (newProvider, oldProvider, popover) {
        // 将当前供应商的 API Key 与模型存入对应槽位
        if (oldProvider && oldProvider !== newProvider) {
            await this.saveConfig(`ai_apikey_${oldProvider}`, this.userConfigs.ai_apikey || '')
            await this.saveConfig(`ai_model_${oldProvider}`, this.userConfigs.ai_model || '')
        }
        // 恢复目标供应商的历史记录（未填过则为空）
        const savedKey = await ConfigService.getValue(`ai_apikey_${newProvider}`)
        const savedModel = await ConfigService.getValue(`ai_model_${newProvider}`)
        await this.saveConfig('ai_apikey', savedKey || '')
        // 同步设置弹窗中 API Key 输入框显示
        const keyInput = popover?.querySelector('#ai_apikey')
        if (keyInput) keyInput.value = savedKey || ''
        clearModelCache()
        await this.refreshModelList(popover, savedModel || '')
    }
    /**
     * 刷新模型列表
     * @param {HTMLElement} popover - 设置弹窗
     * @param {string} preferredModel - 优先选中的模型（供应商切换时传入，空则保留当前选中）
     */
    async refreshModelList (popover, preferredModel = '') {
        const modelSelect = popover.querySelector('#ai_model')
        if (!modelSelect) return false
        clearModelCache()
        try {
            const models = await fetchModels(
                this.userConfigs.ai_apikey,
                this.userConfigs.ai_provider,
                this.userConfigs.custom_base_url
            )
            if (models.length > 0) {
                // 优先保留指定模型（供应商切换时），否则保留当前选中模型，避免刷新后跳回第一个模型
                const currentModel = preferredModel || modelSelect.value
                modelSelect.innerHTML = models.map(model => `
                    <option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}</option>
                `).join('')
                modelSelect.disabled = false
                const keepCurrent = currentModel && Array.from(modelSelect.options).some(option => option.value === currentModel)
                if (keepCurrent) {
                    modelSelect.value = currentModel
                    if (preferredModel) await this.saveConfig('ai_model', currentModel)
                } else {
                    modelSelect.value = models[0].id
                    await this.saveConfig('ai_model', models[0].id)
                }
            } else {
                // 无可用模型：显示占位符并禁用下拉，刷新出可选项后恢复
                modelSelect.innerHTML = '<option value="" selected disabled>暂无可用选项</option>'
                modelSelect.value = ''
                modelSelect.disabled = true
            }
            logger.info('模型列表已刷新')
            return true
        } catch (error) {
            logger.error('刷新模型列表失败', error)
            return false
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
        // 从配置 schema 派生所有含 children 的父项 id，新增子项无需手动维护列表
        const parentIds = this.getAllConfigItems().filter(item => item.children?.length).map(item => item.id)
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
        const findInItems = items => {
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
        const collectItems = configItems => {
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
            existingSettings.__popoverDismissCleanup?.()
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
        this.bindVersionUpdateCheck(popover)
        const app = await elementSelectors.app || document.querySelector('#__next') || document.body
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
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
        await ConfigService.setValue(key, value)
        this.userConfigs[key] = value
        logger.debug(`配置已更新: ${key} = ${value}`)
    }
    /**
     * 同步其他标签页写入的配置到本地设置弹窗控件
     */
    syncConfigControl (key, value) {
        const popover = document.getElementById('VideoSettingsPopover') || document.getElementById('DynamicSettingsPopover')
        if (!popover) return
        let found = false
        // 复选框
        const checkbox = popover.querySelector(`input[data-config-type="checkbox"]#${key}`)
        if (checkbox) {
            const boolValue = Boolean(value)
            checkbox.checked = boolValue
            checkbox.toggleAttribute('checked', boolValue)
            const switchBtn = checkbox.closest('.adjustment-switch')
            if (switchBtn) switchBtn.classList.toggle('on', boolValue)
            found = true
        }
        // 单选框组（radio 无 id，按 name 匹配）
        const radios = popover.querySelectorAll(`input[data-config-type="radio"][name="${key}"]`)
        if (radios.length > 0) {
            radios.forEach(radio => {
                const isChecked = radio.value === value
                radio.checked = isChecked
                radio.toggleAttribute('checked', isChecked)
            })
            found = true
        }
        // 下拉框
        const select = popover.querySelector(`select[data-config-type="select"]#${key}`)
        if (select) {
            const optionExists = Array.from(select.options).some(option => option.value === value)
            if (!optionExists && value !== null && value !== undefined && value !== '') {
                const option = document.createElement('option')
                option.value = value
                option.textContent = value
                select.appendChild(option)
                // 占位禁用状态下收到有效值，恢复下拉可用
                select.disabled = false
            }
            select.value = value
            found = true
        }
        // 输入框
        const input = popover.querySelector(`input[data-config-type="input"]#${key}`)
        if (input) {
            input.value = value ?? ''
            found = true
        }
        if (found) {
            // 刷新依赖该配置项的可见性（如 is_vip、use_custom_model 等）
            this.refreshVisibility(popover)
        }
    }
    /**
     * 显示输入框验证状态（边框颜色反馈，3 秒后恢复默认）
     */
    showInputValidationStatus (input, isSuccess) {
        if (!input) return
        input.style.borderColor = isSuccess ? '#2ed573' : '#ff4757'
        input.style.boxShadow = isSuccess
            ? '0 0 0 3px rgba(46, 213, 115, 0.15)'
            : '0 0 0 3px rgba(255, 71, 87, 0.15)'
        setTimeout(() => {
            if (input) {
                input.style.borderColor = ''
                input.style.boxShadow = ''
            }
        }, 3000)
    }
    /**
     * 导出用户配置
     * 合并已存储的配置与默认值，确保所有已知配置项都被导出
     */
    async exportUserConfigs () {
        try {
            // 获取所有已存储的配置
            const storedSettings = await storageService.getAll('user')
            const storedMap = new Map(Object.entries(storedSettings || {}))
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
