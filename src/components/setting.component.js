// SettingsComponent.js
import { detectivePageType, insertStyleToDocument, createElementAndInsert } from '@/utils/common'
import { styles } from '@/shared/styles'
import { getTemplates } from '@/shared/templates'
export class SettingsComponent {
    constructor () {
        this.userConfigs = {}
    }
    async init (userConfigs) {
        this.userConfigs = userConfigs
        this.pageType = detectivePageType()
        insertStyleToDocument({ 'BilibiliAdjustmentStyle': styles.BilibiliAdjustment })
        this.render(this.pageType)
        this.addEventListeners()
    }
    render (pageType) {
        switch (pageType) {
            case 'video':
                this.renderVideoSetting()
                break
            case 'dynamic':
                this.renderDynamicSetting()
                break
            case 'home':
                this.renderHomeSetting()
                break
            default:
                break
        }
    }
    renderVideoSetting (){
        createElementAndInsert(getTemplates.replace('videoSettings', {
            isVip: this.userConfigs.is_vip
        }), document.body, 'append')
    }
    addEventListeners () {
    }
}
