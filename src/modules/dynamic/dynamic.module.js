import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponent } from '@/components/settings.component'
import { isTabActive, createElementAndInsert, addEventListenerToElement, executeFunctionsSequentially, insertStyleToDocument } from '@/utils/common'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { elementSelectors } from '@/shared/element-selectors'
import { styles } from '@/shared/styles'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponent()
export default {
    name: 'dynamic',
    version: '1.0.0',
    async install () {
        eventBus.on('app:ready', async () => {
            logger.info('动态模块｜已加载')
            await this.preFunctions()
        })
    },
    async preFunctions () {
        this.userConfigs = await storageService.getAll('user')
        this.registSettings()
        if (isTabActive()) {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'DynamicSettingStyle': styles.DynamicSetting })
            this.handleExecuteFunctionsSequentially()
        }
    },
    async registSettings (){
        await settingsComponent.init(this.userConfigs)
    },
    changeCurrentHrefToVideoSubmissions (){
        const dynamic_video_link = this.userConfigs.dynamic_video_link
        const currentHref = location.href
        const indexLink = 'https://t.bilibili.com/pages/nav/index'
        if (
            currentHref === indexLink ||
            regexps.dynamic.newIndexLink.test(currentHref) ||
            regexps.dynamic.indexVoteLink.test(currentHref) ||
            regexps.dynamic.webVoteLink.test(currentHref) ||
            regexps.dynamic.indexLotteryLink.test(currentHref) ||
            regexps.dynamic.webLotteryLink.test(currentHref) ||
            regexps.dynamic.moreDataLink.test(currentHref) ||
            regexps.dynamic.DetailLink.test(currentHref) ||
            regexps.dynamic.TopicDetailLink.test(currentHref)
        ) {
            return false
        }
        if (currentHref !== dynamic_video_link) {
            location.href = dynamic_video_link
        } else {
            logger.info('动态页｜已切换至投稿视频')
        }
    },
    async insertSidebarButtons (){
        const batchSelectors = ['dynamicSidebar', 'DynamicSettingsPopover']
        const [dynamicSidebar, DynamicSettingsPopover] = await elementSelectors.batch(batchSelectors)
        const dynamicSettingsOpenButton = createElementAndInsert(getTemplates.dynamicSettingsOpenButton, dynamicSidebar, 'prepend')
        addEventListenerToElement(dynamicSettingsOpenButton, 'click', () => {
            DynamicSettingsPopover.showPopover()
        })
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.insertSidebarButtons,
            this.changeCurrentHrefToVideoSubmissions
        ]
        executeFunctionsSequentially(functions)
    }
}
