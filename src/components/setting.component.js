// SettingsComponent.js
import { storageService } from '@/services/storage.service'
import { insertStyleToDocument, createElementAndInsert } from '@/utils/common'
import { styles } from '@/shared/styles'
import { getTemplates } from '@/shared/templates'
export class SettingsComponent {
    constructor () {
        this.userConfigs = {}
        this.activeSection = 'player-settings'
        this.container = null
    }
    async init () {
        this.userConfigs = await storageService.getAll('user')
        insertStyleToDocument({ 'BilibiliAdjustmentStyle': styles.BilibiliAdjustment })
        this.render()
        this.addEventListeners()
    }
    render () {
        // createElementAndInsert(getTemplates.)
    }
    addEventListeners () {
    }
}
