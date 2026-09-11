import { LoggerService } from '@/services/logger.service'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
import { SettingsRenderer } from '@/components/settings-renderer'
import { enhanceCustomSelects, refreshCustomSelects } from '@/components/custom-select'
import { updateService } from '@/services/update.service'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import { fetchModels, clearModelCache, validateApiKey } from '@/services/ai.service'
import { initTooltip, destroyTooltip, bindTooltipIcons } from '@/components/tooltip-component'
import { mountVueSettingsPanel } from '@/ui/settings'
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
        // Vue 设置面板（settings_panel = 'v3'）状态：
        // - _vuePanel：应用实例（关闭/重建时 unmount）
        // - _vueConfigsProxy / _vueDynamicOptionsProxy：**Vue 响应式代理**，宿主所有写入都必须经它们
        //   （写原始对象会绕过 Proxy 的 set trap，面板不会重渲染）
        this._vuePanel = null
        this._vueBridge = null
        this._vueConfigsProxy = null
        this._vueDynamicOptionsProxy = null
        this._activeSchema = null
    }
    /** 卸载 Vue 设置面板（幂等） */
    unmountVuePanel () {
        if (this._vuePanel) {
            this._vuePanel.unmount()
            this._vuePanel = null
        }
        this._vueBridge = null
        this._vueConfigsProxy = null
        this._vueDynamicOptionsProxy = null
    }
    /**
     * 同步动态选项（模型列表等）到 Vue 面板
     *
     * 必须写**代理**（`bridge.dynamicOptions`）：写原始对象不会触发 Vue 的更新。
     * 代理与宿主对象共享同一 target，因此宿主侧读数也同步更新。
     */
    syncVueDynamicOptions (options) {
        const target = this._vueDynamicOptionsProxy
        if (!target) return
        Object.assign(target, options)
    }
    /**
     * 挂载 Vue 设置面板
     * @param {HTMLElement} popover 设置弹窗根元素
     * @param {string} mountId 挂载点元素 id
     * @param {Array} schema 设置项 schema
     */
    async mountVuePanel (popover, mountId, schema) {
        this.unmountVuePanel()
        this._activeSchema = schema
        const mountEl = popover?.querySelector(`#${mountId}`)
        if (!mountEl) return null
        // 动态选项对象必须与面板共享**同一引用**（面板对其做 reactive 代理，就地更新才触发重渲染）
        const dynamicOptions = this._pendingModelOptions || (this.userConfigs.ai_model
            ? { ai_model: [{ value: this.userConfigs.ai_model, label: this.userConfigs.ai_model }]}
            : { ai_model: []})
        this._pendingModelOptions = dynamicOptions
        try {
            const panel = await mountVueSettingsPanel(mountEl, {
                schema,
                // configs / dynamicOptions 传宿主自身持有的对象；面板据此建立**响应式代理**并回传，
                // 宿主后续所有写入必须走 these proxy（见 saveConfig / syncVueDynamicOptions）
                configs: this.userConfigs,
                dynamicOptions,
                onChange: (key, value) => this.handleVueConfigChange(key, value, popover),
                onValidate: key => this.handleValidateClick(key, popover),
                onRefresh: key => this.handleRefreshClick(key, popover),
                // 渲染期错误（如响应式/渲染函数异常）改为轻量提示，避免面板空白卡死
                onError: error => this.showPanelLoadFailure(error)
            })
            this._vuePanel = panel
            this._vueBridge = panel.bridge
            this._vueConfigsProxy = panel.bridge?.configs || null
            this._vueDynamicOptionsProxy = panel.bridge?.dynamicOptions || null
            return panel
        } catch (error) {
            this.showPanelLoadFailure(error)
            return null
        }
    }
    /**
     * Vue 面板不可用时的兜底提示（加载/渲染失败）
     *
     * 不再回退到经典渲染器（该路径已移除），只在挂载点内显示轻量提示 + 重试按钮，
     * 保证用户能看见发生了什么并可自行重试；不会写库、不会改变任何配置。
     */
    showPanelLoadFailure (error) {
        logger.error('Vue 设置面板不可用', error)
        // 先卸载可能已存在的 Vue 实例：若「挂载后才抛错」，实例仍在而容器会被清空，
        // 不卸载会导致实例残留与后续 patch 报错
        this.unmountVuePanel()
        const mountEl = document.querySelector('#VideoSettingsFormMount, #DynamicSettingsFormMount')
        if (!mountEl) return
        mountEl.textContent = ''
        const tip = document.createElement('div')
        tip.className = 'adjustment-panel-fallback'
        tip.textContent = '设置面板加载失败，请重试或刷新页面'
        const retry = document.createElement('div')
        retry.className = 'adjustment-button secondary'
        retry.textContent = '重试'
        retry.addEventListener('click', () => {
            // 重试再失败则再次走兜底提示；catch 避免 unhandled rejection
            Promise.resolve(this.render(this.pageType)).catch(err => this.showPanelLoadFailure(err))
        })
        mountEl.appendChild(tip)
        mountEl.appendChild(retry)
    }
    /**
     * Vue 面板配置变更统一处理（等价于经典模式 bindConfigChangeEvents 的链路）
     */
    async handleVueConfigChange (key, value, popover) {
        const item = this.findConfigItem(key)
        const oldValue = this.userConfigs[key]
        let next = value
        if (item?.type === 'input') next = String(value ?? '').trim()
        if (item?.type === 'checkbox') next = Boolean(value)
        await this.saveConfig(key, next)
        // 复用经典模式的特殊联动逻辑（AI 凭证、日志级别、字幕开关、自定义模型等）
        if (item?.type === 'checkbox') {
            await this.handleSpecialCheckboxChange(key, next, popover)
        } else if (item?.type === 'input') {
            await this.handleSpecialInputChange(key, next, popover)
        } else if (item?.type === 'select') {
            await this.handleSpecialSelectChange(key, next, oldValue, popover)
        }
        // 说明：`settings_panel`（面板实现）切换后的弹窗重建统一在 saveConfig 内完成，
        // 以覆盖「Vue 面板回调」与「经典渲染器 DOM 事件」两条路径。
    }
    async init (userConfigs) {
        this.userConfigs = userConfigs
        // 弹窗重建时重新读取最新配置：Stylus「夜间哔哩」样式、其它标签页等**外部来源**
        // 会在设置弹窗关闭期间直接改存储，仅靠内存里的 userConfigs 会显示旧值
        //（主题二态自动切换依赖这里拿到 follow/night 的最新值）
        try {
            const latest = await storageService.getAll('user')
            if (latest && typeof latest === 'object') Object.assign(this.userConfigs, latest)
        } catch { /* 读取失败时沿用已有配置 */ }
        this.pageType = await detectivePageType()
        // 订阅其他标签页的配置变更，实时同步设置弹窗状态（只订阅一次，SPA 导航重复 init 不重复订阅）
        if (!this._configSyncUnsubscribe) {
            this._configSyncUnsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, async (_, { key, value }) => {
                // 写 Vue 响应式代理才会驱动面板刷新；但面板未挂载时（如设置弹窗关闭状态下
                // 由 Stylus 夜间样式、跨标签页等外部来源改配置）代理为 null，
                // 此时必须回退写宿主对象，否则既会抛错又丢失配置
                if (this._vueConfigsProxy) {
                    this._vueConfigsProxy[key] = value
                } else {
                    this.userConfigs[key] = value
                }
                // 自绘下拉替身需显式刷新：它包裹原生 select、不监听其 value 变化，
                // 外部来源改配置（如主题跟随 Stylus 夜间样式）时替身文本会停在旧值
                {
                    const popover = document.getElementById('VideoSettingsPopover') || document.getElementById('DynamicSettingsPopover')
                    if (popover) refreshCustomSelects(popover)
                }
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
                    await this.renderDynamicSettings()
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
        // 面板重建前先卸载旧的 Vue 实例（避免泄漏）
        this.unmountVuePanel()
        // 销毁旧的 tooltip
        destroyTooltip()
        // 不 await fetchDynamicOptions（fetchModels 有 10s 超时）：动态选项由 mountVuePanel
        // 内部从 _pendingModelOptions / 当前 ai_model 推导，面板挂载后再异步更新
        // 创建渲染器：只用于生成弹窗壳（表单由 Vue 面板 SettingsPanelV3 渲染）
        this.renderer = new SettingsRenderer()
        this._activeSchema = videoSettingsConfig
        // 挂载点本身即 .adjustment-form 容器：面板以多根 fragment 渲染，
        // 最终 DOM 与旧渲染器一致（.adjustment-popover > .adjustment-form > 各设置项）
        const formContent = '<div class="adjustment-form" id="VideoSettingsFormMount"></div>'
        // 生成完整弹窗
        const popoverHtml = this.renderer.renderPopover(
            '哔哩哔哩播放页设置',
            pkg.version,
            formContent
        )
        createElementAndInsert(popoverHtml, document.body)
        // 获取 popover DOM 元素（需要等 DOM 插入后才能获取）
        const popover = document.getElementById('VideoSettingsPopover')
        // Vue 面板挂载（懒加载 Vue 运行时 + SFC）；挂载完成后再做自绘下拉与 tooltip 增强，
        // 因为对应 DOM（select/输入框）由组件渲染
        await this.mountVuePanel(popover, 'VideoSettingsFormMount', videoSettingsConfig)
        // 原生 select 视觉替身：套自绘下拉（trigger+菜单），数据/事件仍走原生 select
        enhanceCustomSelects(popover)
        // 初始化 tooltip 并将 tooltip 元素插入 popover 内，避免被 popover 的顶层(top layer)遮挡
        this.tooltip = initTooltip({ delay: 300, hideDelay: 100, container: popover })
        requestAnimationFrame(() => {
            bindTooltipIcons()
        })
        // 异步获取完整模型列表并更新（不阻塞初始化流程）
        this.fetchDynamicOptions().then(options => {
            if (!options?.ai_model) return
            // Vue 面板：就地合并到共享的动态选项对象（面板已代理该对象；替换引用不会触发重渲染）
            // 就地合并到共享的动态选项对象（面板已代理该对象；替换引用不会触发重渲染）
            Object.assign(this._pendingModelOptions, options)
            refreshCustomSelects(popover)
        }).catch(() => {})
    }
    /**
     * 获取动态选项（如模型列表）
     */
    async fetchDynamicOptions () {
        const options = {}
        // 「AI 自动识别广告」未开启时不拉取模型列表：无意义的网络请求且未配置 API Key 时会告警（手动/共享片段跳过不依赖 AI）
        if (!this.userConfigs.ai_auto_identify) return options
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
        const app = elementSelectors.get('app') || elementSelectors.get('bangumiApp') || document.body
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                destroyTooltip()
                // 关闭即卸载 Vue 面板（容器随后被移除，不卸载会残留实例与响应式副作用）
                this.unmountVuePanel()
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
        // 表单交互（change/validate/refresh）全部由 Vue 面板的组件事件回调处理，
        // 无需绑定 DOM 事件；自绘下拉/tooltip 的增强仍走公共逻辑
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
    /**
     * 处理 API Key 验证按钮点击（Vue 面板由 onValidate 回调调用）
     * @param {string} targetId 目标输入框 id（ai_apikey / custom_model_api_key）
     * @param {HTMLElement} popover 设置弹窗
     * @param {HTMLElement} [buttonEl] 按钮元素（缺省时按 targetId 查找，兼容 Vue 面板）
     */
    async handleValidateClick (targetId, popover, buttonEl = null) {
        const button = buttonEl || popover?.querySelector(`[data-validate-for="${targetId}"]`)
        if (!button) return
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
    }
    /**
     * 处理模型列表刷新按钮点击（经典模式由 DOM 事件调用，Vue 面板由 onRefresh 回调调用）
     * @param {string} targetId 目标下拉 id（当前仅支持 ai_model）
     * @param {HTMLElement} popover 设置弹窗
     * @param {HTMLElement} [buttonEl] 按钮元素（缺省时按 targetId 查找，兼容 Vue 面板）
     */
    async handleRefreshClick (targetId, popover, buttonEl = null) {
        if (targetId !== 'ai_model') return
        const button = buttonEl || popover?.querySelector(`[data-refresh-for="${targetId}"]`)
        if (!button) return
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
        button.style.borderColor = isSuccess ? 'var(--adj-success)' : 'var(--adj-danger)'
        if (successText || failureText) {
            button.textContent = isSuccess ? successText : failureText
            button.style.color = isSuccess ? 'var(--adj-success)' : 'var(--adj-danger)'
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
        }
        // 「AI 自动识别广告」开启时：拉取模型列表填充下拉（默认关闭状态下打开设置不会预取）
        if (configId === 'ai_auto_identify' && value && !this.userConfigs.use_custom_model) {
            await this.refreshModelList(popover)
        }
        // 日志级别变更
        if (configId.startsWith('log_level_')) {
            await LoggerService.updateLogLevelsFromConfig(this.userConfigs)
        }
        // 自动开启字幕同步到播放器开关
        if (configId === 'auto_subtitle') {
            const switchInput = elementSelectors.get('AutoEnableSubtitleSwitchInput')
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
        // API Key 输入框由面板按 props.configs 自动重渲染（saveConfig 已写入同一对象），无需操作 DOM
        clearModelCache()
        await this.refreshModelList(popover, savedModel || '')
    }
    /**
     * 刷新模型列表
     * @param {HTMLElement} popover - 设置弹窗
     * @param {string} preferredModel - 优先选中的模型（供应商切换时传入，空则保留当前选中）
     */
    async refreshModelList (popover, preferredModel = '') {
        clearModelCache()
        try {
            const models = await fetchModels(
                this.userConfigs.ai_apikey,
                this.userConfigs.ai_provider,
                this.userConfigs.custom_base_url
            )
            // 更新响应式桥的模型选项与选中值（面板据此重渲染下拉）
            const optionList = models.map(model => ({ value: model.id, label: model.label }))
            this.syncVueDynamicOptions({ ai_model: optionList })
            const currentModel = preferredModel || this.userConfigs.ai_model
            if (models.length > 0) {
                const keepCurrent = currentModel && optionList.some(option => option.value === currentModel)
                const nextModel = keepCurrent ? currentModel : models[0].id
                if (nextModel !== this.userConfigs.ai_model) {
                    await this.saveConfig('ai_model', nextModel)
                }
            } else if (this.userConfigs.ai_model) {
                // 无可用模型：清空选中值（组件渲染「暂无可用选项」占位）
                await this.saveConfig('ai_model', '')
            }
            refreshCustomSelects(popover)
            logger.info('模型列表已刷新')
            return true
        } catch (error) {
            logger.error('刷新模型列表失败', error)
            return false
        }
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
        // 优先在「当前面板使用的 schema」中查找（动态页为 dynamicSettingsConfig），
        // 再回退 videoSettingsConfig，保证两类页面的事件归一逻辑都能拿到设置项定义
        const primary = this._activeSchema || videoSettingsConfig
        const found = findInItems(primary)
        if (found) return found
        return primary === videoSettingsConfig ? null : findInItems(videoSettingsConfig)
    }
    // ==================== 动态页设置 ====================
    async renderDynamicSettings () {
        const existingSettings = document.getElementById('DynamicSettingsPopover')
        if (existingSettings) {
            existingSettings.__popoverDismissCleanup?.()
            existingSettings.remove()
        }
        // 面板重建前先卸载旧的 Vue 实例（避免泄漏）
        this.unmountVuePanel()
        this.renderer = new SettingsRenderer()
        // 表单区由 Vue 面板（SettingsPanelV3）按 dynamicSettingsConfig 渲染；
        // 挂载点本身即 .adjustment-form 容器，DOM 结构与经典渲染器一致
        const formContent = '<div class="adjustment-form" id="DynamicSettingsFormMount"></div>'
        const popoverHtml = this.renderer.renderDynamicPopover(
            '哔哩哔哩动态页设置',
            pkg.version,
            formContent
        )
        createElementAndInsert(popoverHtml, document.body)
        const popover = document.getElementById('DynamicSettingsPopover')
        const panel = await this.mountVuePanel(popover, 'DynamicSettingsFormMount', dynamicSettingsConfig)
        if (panel) {
            // 表单 DOM 就绪后应用自绘下拉与 tooltip 增强
            enhanceCustomSelects(popover)
            this.tooltip = initTooltip({ delay: 300, hideDelay: 100, container: popover })
            requestAnimationFrame(() => {
                bindTooltipIcons()
            })
        }
    }
    async initDynamicSettingsEventListeners () {
        const popover = document.getElementById('DynamicSettingsPopover')
        if (!popover) return
        this.bindVersionUpdateCheck(popover)
        const app = elementSelectors.get('app') || elementSelectors.get('bangumiApp') || document.body
        addEventListenerToElement(popover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                destroyTooltip()
                // 关闭即卸载 Vue 面板（容器随后被移除）
                this.unmountVuePanel()
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
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
        // 写 Vue 响应式代理（触发面板重渲染）；代理与 this.userConfigs 共享同一 target，读数同步。
        // 面板未挂载时代理为 null，必须回退写宿主对象，否则会抛错且配置丢失
        if (this._vueConfigsProxy) {
            this._vueConfigsProxy[key] = value
        } else {
            this.userConfigs[key] = value
        }
        logger.debug(`配置已更新: ${key} = ${value}`)
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
