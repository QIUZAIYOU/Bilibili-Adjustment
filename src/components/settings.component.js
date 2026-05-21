/* global _ */
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, initializeCheckbox } from '@/utils/common'
import { getTemplates } from '@/shared/templates'
import { fetchModels, clearModelCache, validateApiKey } from '@/services/ai.service'
const logger = new LoggerService('Settings')
export class SettingsComponent {
    constructor () {
        this.userConfigs = {}
    }
    async init (userConfigs) {
        this.userConfigs = userConfigs
        this.pageType = detectivePageType()
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
    async renderVideoSettings (){
        // 先检查是否已经存在设置面板，如果存在，就先移除它
        const existingSettings = document.getElementById('VideoSettingsPopover')
        if (existingSettings) {
            existingSettings.remove()
        }
        // 获取当前提供商和模型
        const currentProvider = this.userConfigs.ai_provider || 'siliconflow'
        const currentModel = this.userConfigs.ai_model || 'deepseek-ai/DeepSeek-V3'
        const useCustomModel = this.userConfigs.use_custom_model || false
        const customModelId = this.userConfigs.custom_model_id || ''
        const customBaseURL = this.userConfigs.custom_base_url || ''
        const customModelApiUrl = this.userConfigs.custom_model_api_url || ''
        const customModelApiKey = this.userConfigs.custom_model_api_key || ''
        // 生成提供商选项
        const providerOptions = [
            { value: 'siliconflow', label: '硅基流动' },
            { value: 'custom', label: '自定义 OpenAI 格式' }
        ].map(option => `
            <option value="${option.value}" ${option.value === currentProvider ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('')
        // 获取模型列表（根据提供商，仅在未开启自定义模型时获取）
        let aiModelOptions = ''
        let apiStatusMessage = ''
        if (!useCustomModel) {
            try {
                const models = await fetchModels(this.userConfigs.ai_apikey, currentProvider, customBaseURL)
                aiModelOptions = models.map(model => `
                    <option value="${model.id}" ${model.id === currentModel ? 'selected' : ''}>
                        ${model.label}
                    </option>
                `).join('')
            } catch (error) {
                logger.error('获取模型列表失败', error)
                // 根据错误类型显示不同的提示信息
                if (error.code === 'AUTH_FAILED') {
                    apiStatusMessage = '<span class="adjustment-tips error">API Key 无效，请检查设置中的 API Key</span>'
                } else if (error.code === 'FORBIDDEN') {
                    apiStatusMessage = '<span class="adjustment-tips error">API Key 权限不足</span>'
                } else {
                    apiStatusMessage = '<span class="adjustment-tips warn">获取模型列表失败，使用默认模型</span>'
                }
                aiModelOptions = `<option value="${currentModel}" selected>${currentModel}</option>`
            }
        } else {
            aiModelOptions = `<option value="${currentModel}" selected>${currentModel}</option>`
        }
        // 生成更新检查频率选项
        const updateCheckFrequencyOptions = [
            { value: 6, label: '6小时' },
            { value: 12, label: '12小时' },
            { value: 24, label: '24小时' },
            { value: 48, label: '48小时' },
            { value: 72, label: '72小时' }
        ].map(option => `
            <option value="${option.value}" ${this.userConfigs.update_check_frequency === option.value ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('')
        // 日志级别已改为四个独立复选框，无需生成下拉选项
        const videoSettings = getTemplates.replace('videoSettings', {
            IsVip: this.userConfigs.is_vip,
            AutoLocate: this.userConfigs.auto_locate,
            AutoLocateVideo: this.userConfigs.auto_locate_video,
            AutoLocateBangumi: this.userConfigs.auto_locate_bangumi,
            OffsetTop: this.userConfigs.offset_top,
            PlayerOffsetTop: this.userConfigs.player_offset_top,
            ClickPlayerAutoLocate: this.userConfigs.click_player_auto_location,
            SelectedPlayerModeClose: this.userConfigs.selected_player_mode === 'normal',
            SelectedPlayerModeWide: this.userConfigs.selected_player_mode === 'wide',
            SelectedPlayerModeWeb: this.userConfigs.selected_player_mode === 'web',
            WebfullUnlock: this.userConfigs.webfull_unlock,
            AutoSelectVideoHighestQuality: this.userConfigs.auto_select_video_highest_quality,
            ContainQuality4kStyle: this.userConfigs.is_vip ? 'flex' : 'none',
            ContainQuality4k: this.userConfigs.contain_quality4k,
            ContainQuality8kStyle: this.userConfigs.is_vip ? 'flex' : 'none',
            ContainQuality8k: this.userConfigs.contain_quality8k,
            InsertVideoDescriptionToComment: this.userConfigs.insert_video_description_to_comment,
            AutoSkip: this.userConfigs.auto_skip,
            PauseVideo: this.userConfigs.pause_video,
            ContinuePlayStyle: this.userConfigs.is_vip ? 'flex' : 'none',
            ContinuePlay: this.userConfigs.continue_play,
            AutoSubtitle: this.userConfigs.auto_subtitle,
            AutoReload: this.userConfigs.auto_reload,
            RemoveCommentTags: this.userConfigs.hide_reply_tag,
            AutoHiRes: this.userConfigs.auto_hi_res,
            AutoHiResStyle: this.userConfigs.is_vip ? 'flex' : 'none',
            AutoCheckUpdate: this.userConfigs.auto_check_update,
            AiApikey: this.userConfigs.ai_apikey,
            // 日志级别配置
            LOGLEVELINFO: this.userConfigs.log_level_info,
            LOGLEVELERROR: this.userConfigs.log_level_error,
            LOGLEVELWARN: this.userConfigs.log_level_warn,
            LOGLEVELDEBUG: this.userConfigs.log_level_debug,
            // 更新配置
            UpdateCheckFrequency: this.userConfigs.update_check_frequency,
            UPDATECHECKFREQUENCYOPTIONS: updateCheckFrequencyOptions,
            AutoUpdate: this.userConfigs.auto_update,
            SkipUpdateCheck: this.userConfigs.skip_update_check,
            // AI 服务配置
            AIPROVIDER: currentProvider,
            AIPROVIDEROPTIONS: providerOptions,
            AIPROVIDERSTYLE: useCustomModel ? 'none' : 'flex',
            CUSTOMBASEURL: customBaseURL,
            CUSTOMBASEURLSTYLE: useCustomModel || currentProvider !== 'custom' ? 'none' : 'flex',
            AIModel: currentModel,
            AIMODELOPTIONS: aiModelOptions,
            AIMODELSTYLE: useCustomModel ? 'none' : 'flex',
            AIAPIKEY: this.userConfigs.ai_apikey,
            AIAPIKEYSTYLE: useCustomModel ? 'none' : 'flex',
            USECUSTOMMODEL: useCustomModel,
            CUSTOMMODELSTYLE: useCustomModel ? 'flex' : 'none',
            CUSTOMMODELID: customModelId,
            CUSTOMMODELAPIURL: customModelApiUrl,
            CUSTOMMODELAPIKEY: customModelApiKey,
            APISTATUSMESSAGE: apiStatusMessage,
            // 显示评论IP属地
            ShowCommentLocation: this.userConfigs.show_comment_location
        })
        createElementAndInsert(videoSettings, document.body)
    }
    async initVideoSettingsEventListeners () {
        const batchSelectors = ['app', 'VideoSettingsPopover', 'IsVip', 'AutoLocate', 'AutoLocateVideo', 'AutoLocateBangumi', 'ClickPlayerAutoLocate', 'WebfullUnlock', 'AutoSelectVideoHighestQuality', 'ContainQuality4k', 'ContainQuality8k', 'InsertVideoDescriptionToComment', 'AutoSkip', 'PauseVideo', 'ContinuePlay', 'AutoSubtitle', 'OffsetTop', 'Checkbox4K', 'Checkbox8K', 'AutoReload', 'RemoveCommentTags', 'AutoHiRes', 'AutoCheckUpdate', 'AiApikey', 'LogLevelInfo', 'LogLevelError', 'LogLevelWarn', 'LogLevelDebug', 'UpdateCheckFrequency', 'AutoUpdate', 'SkipUpdateCheck', 'AIProvider', 'CustomBaseURL', 'AIModel', 'UseCustomModel', 'CustomModelId', 'RefreshModels', 'ShowCommentLocation', 'CustomModelApiUrl', 'CustomModelApiKey']
        // 批量获取元素，并验证选择器是否存在
        const elements = await elementSelectors.batch(batchSelectors)
        // 验证必要的选择器是否存在
        const requiredSelectors = ['app', 'VideoSettingsPopover']
        const missingSelectors = requiredSelectors.filter((selector, index) => !elements[index])
        if (missingSelectors.length > 0) {
            logger.warn(`缺少必要的选择器: ${missingSelectors.join(', ')}`)
            return
        }
        // 使用对象映射方式，安全处理选择器不存在的情况
        const elementsMap = {
            app: elements[0],
            VideoSettingsPopover: elements[1],
            IsVip: elements[2],
            AutoLocate: elements[3],
            AutoLocateVideo: elements[4],
            AutoLocateBangumi: elements[5],
            ClickPlayerAutoLocate: elements[6],
            WebfullUnlock: elements[7],
            AutoSelectVideoHighestQuality: elements[8],
            ContainQuality4k: elements[9],
            ContainQuality8k: elements[10],
            InsertVideoDescriptionToComment: elements[11],
            AutoSkip: elements[12],
            PauseVideo: elements[13],
            ContinuePlay: elements[14],
            AutoSubtitle: elements[15],
            OffsetTop: elements[16],
            Checkbox4K: elements[17],
            Checkbox8K: elements[18],
            AutoReload: elements[19],
            RemoveCommentTags: elements[20],
            AutoHiRes: elements[21],
            AutoCheckUpdate: elements[22],
            AiApikey: elements[23],
            LogLevelInfo: elements[24],
            LogLevelError: elements[25],
            LogLevelWarn: elements[26],
            LogLevelDebug: elements[27],
            UpdateCheckFrequency: elements[28],
            AutoUpdate: elements[29],
            SkipUpdateCheck: elements[30],
            AIProvider: elements[31],
            CustomBaseURL: elements[32],
            AIModel: elements[33],
            UseCustomModel: elements[34],
            CustomModelId: elements[35],
            RefreshModels: elements[36],
            ShowCommentLocation: elements[37],
            CustomModelApiUrl: elements[38],
            CustomModelApiKey: elements[39]
        }
        // 从对象中提取元素，使用解构赋值提高代码可读性
        const { app, VideoSettingsPopover, IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, OffsetTop, Checkbox4K, Checkbox8K, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate, AiApikey, LogLevelInfo, LogLevelError, LogLevelWarn, LogLevelDebug, UpdateCheckFrequency, AutoUpdate, SkipUpdateCheck, AIProvider, CustomBaseURL, AIModel, UseCustomModel, CustomModelId, RefreshModels, ShowCommentLocation, CustomModelApiUrl, CustomModelApiKey } = elementsMap
        addEventListenerToElement(VideoSettingsPopover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })
        const checkboxElements = [IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate, LogLevelInfo, LogLevelError, LogLevelWarn, LogLevelDebug, AutoUpdate, SkipUpdateCheck, UseCustomModel, ShowCommentLocation]
        // AI API Key 输入框需要单独处理
        addEventListenerToElement(AiApikey, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('ai_apikey', value)
            this.userConfigs.ai_apikey = value
            // API Key 变更时，清空模型缓存并刷新模型列表
            clearModelCache()
            try {
                const models = await fetchModels(value, this.userConfigs.ai_provider, this.userConfigs.custom_base_url)
                if (AIModel && models.length > 0) {
                    AIModel.innerHTML = models.map(model => `
                        <option value="${model.id}">${model.label}</option>
                    `).join('')
                    AIModel.value = models[0].id
                    await storageService.userSet('ai_model', models[0].id)
                    this.userConfigs.ai_model = models[0].id
                }
            } catch (error) {
                logger.error('API Key 变更后刷新模型列表失败', error)
            }
        })
        // 验证 API Key 按钮点击事件
        const ValidateApiKey = await elementSelectors.ValidateApiKey
        addEventListenerToElement(ValidateApiKey, 'click', async () => {
            const apiKey = AiApikey?.value?.trim()
            if (!apiKey) {
                this.showApiStatusMessage('请先输入 API Key', 'warn')
                return
            }
            const button = ValidateApiKey
            const originalText = button.textContent
            button.textContent = '验证中...'
            button.style.opacity = '0.7'
            try {
                const result = await validateApiKey(apiKey, this.userConfigs.ai_provider, this.userConfigs.custom_base_url)
                if (result.valid) {
                    this.showApiStatusMessage('API Key 验证成功 ✓', 'success')
                } else {
                    this.showApiStatusMessage(`验证失败: ${result.message}`, 'error')
                }
            } catch (error) {
                this.showApiStatusMessage(`验证失败: ${error.message}`, 'error')
                logger.error('API Key 验证失败', error)
            } finally {
                button.textContent = originalText
                button.style.opacity = '1'
            }
        })
        initializeCheckbox(checkboxElements, this.userConfigs)
        addEventListenerToElement(checkboxElements, 'change', async e => {
            const configKey = _.snakeCase(e.target.id).replace(/_(\d)_k/g, '$1k')
            const value = Boolean(e.target.checked)
            // 更新 storageService 中的值
            await storageService.userSet(configKey, value)
            // 更新 this.userConfigs 中的值
            this.userConfigs[configKey] = value
            // 更新元素的 checked 属性
            e.target.setAttribute('checked', value)
            if (e.target.id === 'IsVip'){
                const relyElements = [Checkbox4K, Checkbox8K, AutoHiRes]
                relyElements.forEach( element => {
                    if (element.id === 'AutoHiRes') element.closest('.adjustment-form-item').style.display = e.target.checked ? 'flex' : 'none'
                    else element.style.display = e.target.checked ? 'flex' : 'none'
                })
            }
            if (e.target.id === 'AutoSubtitle'){
                const AutoEnableSubtitleSwitchInput = await elementSelectors.AutoEnableSubtitleSwitchInput
                if (AutoEnableSubtitleSwitchInput){
                    AutoEnableSubtitleSwitchInput.checked = e.target?.checked
                    AutoEnableSubtitleSwitchInput.setAttribute('checked', e.target?.checked.toString())
                }
            }
            // 使用自定义模型开关切换时，显示/隐藏相关输入框
            if (e.target.id === 'UseCustomModel') {
                const aiProviderContainer = document.getElementById('AIProviderContainer')
                const aiModelContainer = document.getElementById('AIModelContainer')
                const aiApikeyContainer = document.getElementById('AiApikeyContainer')
                const customModelApiUrlContainer = document.getElementById('CustomModelApiUrlContainer')
                const customModelApiKeyContainer = document.getElementById('CustomModelApiKeyContainer')
                const customModelContainer = document.getElementById('CustomModelContainer')
                const customBaseURLContainer = document.getElementById('CustomBaseURLContainer')

                if (value) {
                    // 开启自定义模型：隐藏内置 AI 配置，显示自定义配置
                    if (aiProviderContainer) aiProviderContainer.style.display = 'none'
                    if (aiModelContainer) aiModelContainer.style.display = 'none'
                    if (aiApikeyContainer) aiApikeyContainer.style.display = 'none'
                    if (customBaseURLContainer) customBaseURLContainer.style.display = 'none'
                    if (customModelApiUrlContainer) customModelApiUrlContainer.style.display = 'flex'
                    if (customModelApiKeyContainer) customModelApiKeyContainer.style.display = 'flex'
                    if (customModelContainer) customModelContainer.style.display = 'flex'
                    // 同步更新 ai_model 配置
                    const customModelId = this.userConfigs.custom_model_id
                    if (customModelId) {
                        await storageService.userSet('ai_model', customModelId)
                        this.userConfigs.ai_model = customModelId
                    }
                } else {
                    // 关闭自定义模型：显示内置 AI 配置，隐藏自定义配置
                    if (aiProviderContainer) aiProviderContainer.style.display = 'flex'
                    if (aiModelContainer) aiModelContainer.style.display = 'flex'
                    if (aiApikeyContainer) aiApikeyContainer.style.display = 'flex'
                    const provider = this.userConfigs.ai_provider
                    if (customBaseURLContainer) customBaseURLContainer.style.display = provider === 'custom' ? 'flex' : 'none'
                    if (customModelApiUrlContainer) customModelApiUrlContainer.style.display = 'none'
                    if (customModelApiKeyContainer) customModelApiKeyContainer.style.display = 'none'
                    if (customModelContainer) customModelContainer.style.display = 'none'
                    // 主动获取一次模型列表并刷新下拉框
                    clearModelCache()
                    try {
                        const models = await fetchModels(this.userConfigs.ai_apikey, provider, this.userConfigs.custom_base_url)
                        if (AIModel) {
                            AIModel.innerHTML = models.map(model => `
                                <option value="${model.id}">${model.label}</option>
                            `).join('')
                            if (models.length > 0) {
                                AIModel.value = models[0].id
                                await storageService.userSet('ai_model', models[0].id)
                                this.userConfigs.ai_model = models[0].id
                            }
                        }
                        logger.info('关闭自定义模型后已刷新模型列表')
                    } catch (error) {
                        logger.error('关闭自定义模型后刷新模型列表失败', error)
                    }
                }
            }
            // 当日志级别配置变化时，更新日志级别，动态导入 LoggerService 避免循环依赖
            if (e.target.id.startsWith('LogLevel')) {
                const { LoggerService } = await import('@/services/logger.service')
                await LoggerService.updateLogLevelsFromConfig()
            }
        })
        addEventListenerToElement(OffsetTop, 'change', async e => {
            const configKey = _.snakeCase(e.target.id).replace(/_(\d)_k/g, '$1k')
            const value = e.target.value
            // 更新 storageService 中的值
            await storageService.userSet(configKey, value)
            // 更新 this.userConfigs 中的值
            this.userConfigs[configKey] = value
        })
        // 自定义 API 地址变更时，保存配置并刷新模型列表
        addEventListenerToElement(CustomBaseURL, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('custom_base_url', value)
            this.userConfigs.custom_base_url = value
            // 刷新模型列表
            clearModelCache()
            try {
                const models = await fetchModels(this.userConfigs.ai_apikey, this.userConfigs.ai_provider, value)
                if (AIModel && models.length > 0) {
                    AIModel.innerHTML = models.map(model => `
                        <option value="${model.id}">${model.label}</option>
                    `).join('')
                    AIModel.value = models[0].id
                    await storageService.userSet('ai_model', models[0].id)
                    this.userConfigs.ai_model = models[0].id
                }
            } catch (error) {
                logger.error('自定义地址变更后刷新模型列表失败', error)
            }
        })
        // AI 提供商切换时，刷新模型列表并显示/隐藏自定义地址输入框
        addEventListenerToElement(AIProvider, 'change', async e => {
            const provider = e.target.value
            await storageService.userSet('ai_provider', provider)
            this.userConfigs.ai_provider = provider
            // 显示/隐藏自定义 API 地址输入框
            const customBaseURLContainer = document.getElementById('CustomBaseURLContainer')
            if (customBaseURLContainer) {
                customBaseURLContainer.style.display = provider === 'custom' ? 'flex' : 'none'
            }
            // 清空缓存并刷新模型列表
            clearModelCache()
            try {
                const models = await fetchModels(this.userConfigs.ai_apikey, provider, this.userConfigs.custom_base_url)
                if (AIModel) {
                    AIModel.innerHTML = models.map(model => `
                        <option value="${model.id}">${model.label}</option>
                    `).join('')
                    if (models.length > 0) {
                        AIModel.value = models[0].id
                        await storageService.userSet('ai_model', models[0].id)
                        this.userConfigs.ai_model = models[0].id
                    }
                }
            } catch (error) {
                logger.error('切换提供商后刷新模型列表失败', error)
            }
        })
        // 自定义 API 地址变更时，保存配置并刷新模型列表
        addEventListenerToElement(CustomBaseURL, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('custom_base_url', value)
            this.userConfigs.custom_base_url = value
            // 刷新模型列表
            clearModelCache()
            try {
                const models = await fetchModels(this.userConfigs.ai_apikey, this.userConfigs.ai_provider, value)
                if (AIModel && models.length > 0) {
                    AIModel.innerHTML = models.map(model => `
                        <option value="${model.id}">${model.label}</option>
                    `).join('')
                    AIModel.value = models[0].id
                    await storageService.userSet('ai_model', models[0].id)
                    this.userConfigs.ai_model = models[0].id
                }
            } catch (error) {
                logger.error('自定义地址变更后刷新模型列表失败', error)
            }
        })
        addEventListenerToElement(UpdateCheckFrequency, 'change', async e => {
            const value = parseInt(e.target.value) || 24
            // 更新 storageService 中的值
            await storageService.userSet('update_check_frequency', value)
            // 更新 this.userConfigs 中的值
            this.userConfigs.update_check_frequency = value
        })
        // AI 模型切换时，保存配置
        addEventListenerToElement(AIModel, 'change', async e => {
            const value = e.target.value
            await storageService.userSet('ai_model', value)
            this.userConfigs.ai_model = value
        })
        // 自定义模型ID变更时，保存配置
        addEventListenerToElement(CustomModelId, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('custom_model_id', value)
            this.userConfigs.custom_model_id = value
            if (this.userConfigs.use_custom_model) {
                await storageService.userSet('ai_model', value)
                this.userConfigs.ai_model = value
            }
        })
        // 自定义模型 API 地址变更时，保存配置
        addEventListenerToElement(CustomModelApiUrl, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('custom_model_api_url', value)
            this.userConfigs.custom_model_api_url = value
        })
        // 自定义模型 API Key 变更时，保存配置
        addEventListenerToElement(CustomModelApiKey, 'change', async e => {
            const value = e.target.value.trim()
            await storageService.userSet('custom_model_api_key', value)
            this.userConfigs.custom_model_api_key = value
        })
        // 验证自定义模型 API Key 按钮点击事件
        const ValidateCustomModelApiKey = await elementSelectors.ValidateCustomModelApiKey
        addEventListenerToElement(ValidateCustomModelApiKey, 'click', async () => {
            const apiKey = CustomModelApiKey?.value?.trim()
            const apiUrl = CustomModelApiUrl?.value?.trim()
            if (!apiKey) {
                this.showApiStatusMessage('请先输入自定义 API Key', 'warn')
                return
            }
            if (!apiUrl) {
                this.showApiStatusMessage('请先输入自定义 API 地址', 'warn')
                return
            }
            const button = ValidateCustomModelApiKey
            const originalText = button.textContent
            button.textContent = '验证中...'
            button.style.opacity = '0.7'
            try {
                const result = await validateApiKey(apiKey, 'custom', apiUrl)
                if (result.valid) {
                    this.showApiStatusMessage('自定义 API Key 验证成功 ✓', 'success')
                } else {
                    this.showApiStatusMessage(`验证失败: ${result.message}`, 'error')
                }
            } catch (error) {
                this.showApiStatusMessage(`验证失败: ${error.message}`, 'error')
                logger.error('自定义 API Key 验证失败', error)
            } finally {
                button.textContent = originalText
                button.style.opacity = '1'
            }
        })
        // 手动刷新模型列表按钮
        addEventListenerToElement(RefreshModels, 'click', async () => {
            clearModelCache()
            try {
                const models = await fetchModels(this.userConfigs.ai_apikey, this.userConfigs.ai_provider, this.userConfigs.custom_base_url)
                if (AIModel) {
                    AIModel.innerHTML = models.map(model => `
                        <option value="${model.id}">${model.label}</option>
                    `).join('')
                    if (models.length > 0) {
                        AIModel.value = models[0].id
                        await storageService.userSet('ai_model', models[0].id)
                        this.userConfigs.ai_model = models[0].id
                    }
                }
                logger.info('模型列表已手动刷新')
            } catch (error) {
                logger.error('手动刷新模型列表失败', error)
            }
        })
        elementSelectors.each('SelectPlayerModeButtons', btn => {
            addEventListenerToElement(btn, 'click', async e => {
                const buttons = btn.closest('.adjustment-checkboxGroup').querySelectorAll('input[name="PlayerMode"]')
                buttons.forEach(b => {
                    b.checked = false
                    b.setAttribute('checked', 'false')
                })
                e.target.checked = true
                e.target.setAttribute('checked', 'true')
                const selectedMode = e.target.value
                // 更新 storageService 中的值
                await storageService.userSet('selected_player_mode', selectedMode)
                // 更新 this.userConfigs 中的值
                this.userConfigs.selected_player_mode = selectedMode
            })
        })
        const handleSettingsFileSelectors = ['ExportUserConfigs', 'ImportUserConfigs', 'ImportUserConfigsFileInput']
        const [ExportUserConfigs, ImportUserConfigs, ImportUserConfigsFileInput] = await elementSelectors.batch(handleSettingsFileSelectors)
        const handleSettingsFileElements = [ExportUserConfigs, ImportUserConfigs, ImportUserConfigsFileInput]
        addEventListenerToElement(handleSettingsFileElements, 'click', async e => {
            if (e.target.id === 'ExportUserConfigs') this.exportUserConfigs()
            if (e.target.id === 'ImportUserConfigs') {
                ImportUserConfigsFileInput.click()
            }
        })
        addEventListenerToElement(ImportUserConfigsFileInput, 'change', e => this.importUserConfigs(e))
    }
    renderDynamicSettings (){
        // 先检查是否已经存在设置面板，如果存在，就先移除它
        const existingSettings = document.getElementById('DynamicSettingsPopover')
        if (existingSettings) {
            existingSettings.remove()
        }
        const dynamicSettings = getTemplates.replace('dynamicSettings', {
            DynamicVideoLink: this.userConfigs.dynamic_video_link
        })
        createElementAndInsert(dynamicSettings, document.body)
    }
    async initDynamicSettingsEventListeners (){
        const batchSelectors = ['app', 'DynamicSettingsPopover']
        const [app, DynamicSettingsPopover] = await elementSelectors.batch(batchSelectors)
        addEventListenerToElement(DynamicSettingsPopover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })
    }
    async exportUserConfigs () {
        try {
            const settings = await storageService.getAll('user')
            const blob = new Blob([JSON.stringify(settings)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `bilibili_adjustment_settings_${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            logger.error('导出设置失败:', error)
        }
    }
    async importUserConfigs (event) {
        const file = event?.target?.files?.[0]
        if (!file) return
        try {
            const reader = new FileReader()
            reader.onload = async e => {
                try {
                    const userConfigs = JSON.parse(e.target.result)
                    const userConfigsArray = Object.entries(userConfigs).map(([key, value]) => ({
                        key,
                        value
                    }))
                    await storageService.batchSet('user', userConfigsArray)
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
    showApiStatusMessage (message, type = 'info') {
        const statusContainer = document.querySelector('[data-status-container]') ||
                               document.getElementById('VideoSettingsPopover')?.querySelector('.adjustment-form-item.ai-auto-skip')
        if (statusContainer) {
            let statusElement = statusContainer.querySelector('.api-status-message')
            if (!statusElement) {
                statusElement = document.createElement('span')
                statusElement.className = 'api-status-message adjustment-tips info'
                statusElement.style.marginTop = '8px'
                statusContainer.appendChild(statusElement)
            }
            statusElement.textContent = message
            statusElement.className = `api-status-message adjustment-tips ${type}`
            if (!message) {
                statusElement.style.display = 'none'
            } else {
                statusElement.style.display = ''
            }
            // 3秒后自动清除消息
            setTimeout(() => {
                if (statusElement && statusElement.parentNode) {
                    statusElement.textContent = ''
                    statusElement.className = 'api-status-message adjustment-tips info'
                    statusElement.style.display = 'none'
                }
            }, 3000)
        }
    }
}
