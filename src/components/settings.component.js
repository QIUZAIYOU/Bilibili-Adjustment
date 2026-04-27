/* global _ */
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, initializeCheckbox } from '@/utils/common'
import { getTemplates } from '@/shared/templates'
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
                    this.renderVideoSettings()
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
    renderVideoSettings (){
        // 先检查是否已经存在设置面板，如果存在，就先移除它
        const existingSettings = document.getElementById('VideoSettingsPopover')
        if (existingSettings) {
            existingSettings.remove()
        }
        // 生成 AI 服务提供商选项
        const aiProviderOptions = [
            { value: 'deepseek', label: 'DeepSeek' },
            { value: 'openai', label: 'OpenAI' }
        ].map(option => `
            <option value="${option.value}" ${this.userConfigs.ai_provider === option.value ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('')
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
            AIProvider: this.userConfigs.ai_provider,
            AIPROVIDEROPTIONS: aiProviderOptions,
            // 显示评论IP属地
            ShowCommentLocation: this.userConfigs.show_comment_location
        })
        createElementAndInsert(videoSettings, document.body)
    }
    async initVideoSettingsEventListeners () {
        const batchSelectors = ['app', 'VideoSettingsPopover', 'IsVip', 'AutoLocate', 'AutoLocateVideo', 'AutoLocateBangumi', 'ClickPlayerAutoLocate', 'WebfullUnlock', 'AutoSelectVideoHighestQuality', 'ContainQuality4k', 'ContainQuality8k', 'InsertVideoDescriptionToComment', 'AutoSkip', 'PauseVideo', 'ContinuePlay', 'AutoSubtitle', 'OffsetTop', 'Checkbox4K', 'Checkbox8K', 'AutoReload', 'RemoveCommentTags', 'AutoHiRes', 'AutoCheckUpdate', 'AiApikey', 'LogLevelInfo', 'LogLevelError', 'LogLevelWarn', 'LogLevelDebug', 'UpdateCheckFrequency', 'AutoUpdate', 'SkipUpdateCheck', 'AIProvider', 'ShowCommentLocation']
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
            ShowCommentLocation: elements[32]
        }
        // 从对象中提取元素，使用解构赋值提高代码可读性
        const { app, VideoSettingsPopover, IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, OffsetTop, Checkbox4K, Checkbox8K, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate, AiApikey, LogLevelInfo, LogLevelError, LogLevelWarn, LogLevelDebug, UpdateCheckFrequency, AutoUpdate, SkipUpdateCheck, AIProvider, ShowCommentLocation } = elementsMap
        addEventListenerToElement(VideoSettingsPopover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })
        const checkboxElements = [IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate, LogLevelInfo, LogLevelError, LogLevelWarn, LogLevelDebug, AutoUpdate, SkipUpdateCheck, ShowCommentLocation]
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
        addEventListenerToElement(AiApikey, 'change', async e => {
            const value = e.target.value
            // 更新 storageService 中的值
            await storageService.userSet('ai_apikey', value)
            // 更新 this.userConfigs 中的值
            this.userConfigs.ai_apikey = value
        })
        addEventListenerToElement(UpdateCheckFrequency, 'change', async e => {
            const value = parseInt(e.target.value) || 24
            // 更新 storageService 中的值
            await storageService.userSet('update_check_frequency', value)
            // 更新 this.userConfigs 中的值
            this.userConfigs.update_check_frequency = value
        })
        addEventListenerToElement(AIProvider, 'change', async e => {
            const value = e.target.value
            // 更新 storageService 中的值
            await storageService.userSet('ai_provider', value)
            // 更新 this.userConfigs 中的值
            this.userConfigs.ai_provider = value
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
}
