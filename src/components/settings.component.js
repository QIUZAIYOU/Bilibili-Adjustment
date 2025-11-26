/* global FileReader,Blob,_ */
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
        this.render(this.pageType)
    }
    render (pageType) {
        switch (pageType) {
            case 'video':
                this.renderVideoSettings()
                this.initVideoSettingsEventListeners()
                break
            case 'dynamic':
                this.renderDynamicSettings()
                this.initDynamicSettingsEventListeners()
                break
            default:
                break
        }
    }
    renderVideoSettings (){
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
            AutoCheckUpdate: this.userConfigs.auto_check_update
        })
        createElementAndInsert(videoSettings, document.body)
    }
    async initVideoSettingsEventListeners () {
        const batchSelectors = ['app', 'VideoSettingsPopover', 'IsVip', 'AutoLocate', 'AutoLocateVideo', 'AutoLocateBangumi', 'ClickPlayerAutoLocate', 'WebfullUnlock', 'AutoSelectVideoHighestQuality', 'ContainQuality4k', 'ContainQuality8k', 'InsertVideoDescriptionToComment', 'AutoSkip', 'PauseVideo', 'ContinuePlay', 'AutoSubtitle', 'OffsetTop', 'Checkbox4K', 'Checkbox8K', 'AutoReload', 'RemoveCommentTags', 'AutoHiRes', 'AutoCheckUpdate']
        const [app, VideoSettingsPopover, IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, OffsetTop, Checkbox4K, Checkbox8K, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate] = await elementSelectors.batch(batchSelectors)
        addEventListenerToElement(VideoSettingsPopover, 'toggle', e => {
            if (e.newState === 'open') app.style.pointerEvents = 'none'
            if (e.newState === 'closed') app.style.pointerEvents = 'auto'
        })
        const checkboxElements = [IsVip, AutoLocate, AutoLocateVideo, AutoLocateBangumi, ClickPlayerAutoLocate, WebfullUnlock, AutoSelectVideoHighestQuality, ContainQuality4k, ContainQuality8k, InsertVideoDescriptionToComment, AutoSkip, PauseVideo, ContinuePlay, AutoSubtitle, AutoReload, RemoveCommentTags, AutoHiRes, AutoCheckUpdate]
        initializeCheckbox(checkboxElements, this.userConfigs)
        addEventListenerToElement(checkboxElements, 'change', async e => {
            const configKey = _.snakeCase(e.target.id).replace(/_(\d)_k/g, '$1k')
            await storageService.userSet(configKey, Boolean(e.target.checked))
            e.target.setAttribute('checked', await storageService.userGet(configKey))
            if (e.target.id === 'IsVip'){
                const relyElements = [Checkbox4K, Checkbox8K, AutoHiRes]
                relyElements.forEach( element => {
                    if (element.id === 'AutoHiRes') element.closest('.adjustment-form-item').style.display = e.target.checked ? 'flex' : 'none'
                    else element.style.display = e.target.checked ? 'flex' : 'none'
                })
            }
            if (e.target.id === 'OffsetTop'){
                await storageService.userSet(configKey, e.target.value)
            }
            if (e.target.id === 'AutoSubtitle'){
                const AutoEnableSubtitleSwitchInput = await elementSelectors.AutoEnableSubtitleSwitchInput
                if (AutoEnableSubtitleSwitchInput){
                    AutoEnableSubtitleSwitchInput.checked = e.target?.checked
                    AutoEnableSubtitleSwitchInput.setAttribute('checked', e.target?.checked.toString())
                }
            }
        })
        addEventListenerToElement(OffsetTop, 'change', async e => {
            await storageService.userSet('offset_top', e.target.value)
        })
        elementSelectors.each('SelectPlayerModeButtons', btn => {
            addEventListenerToElement(btn, 'click', async e => {
                const buttons = btn.closest('.adjustment-checkboxGroup').querySelectorAll('input[name="PlayerMode"]')
                buttons.forEach(b => {
                    b.checked = false
                    b.setAttribute('checked', 'false')
                })
                btn.checked = true
                btn.setAttribute('checked', 'true')
                await storageService.userSet('selected_player_mode', e.target.value)
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
