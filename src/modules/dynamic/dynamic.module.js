import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponentV2 } from '@/components/settings-component-v2'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { createElementAndInsert, addEventListenerToElement, executeFunctionsSequentially, insertStyleToDocument } from '@/utils/common'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { stylesV2 } from '@/shared/styles'
import { commentEnhanceFeatures } from './comment-enhance'
const logger = new LoggerService('DynamicModule')
const settingsComponent = new SettingsComponentV2()
export default {
    name: 'dynamic',
    version: '2.0.0',
    ...commentEnhanceFeatures,
    async install () {
        this._cleanup = []
        this._cleanup.push(eventBus.on(EVENT_NAMES.APP_READY, async () => {
            logger.info('动态模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall () {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        document.getElementById('DynamicSettingsOpenButton')?.remove()
        document.getElementById('DynamicSettingsPopover')?.remove()
        insertStyleToDocument({ 'DynamicSettingStyle': '' })
    },
    async preFunctions () {
        this.userConfigs = await storageService.getAll('user')
        await this.registSettings()
        if (document.visibilityState === 'visible') {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'DynamicSettingStyle': stylesV2.DynamicSetting })
            this.handleExecuteFunctionsSequentially()
        }
    },
    async registSettings (){
        await settingsComponent.init(this.userConfigs)
    },
    changeCurrentHrefToVideoSubmissions (){
        const dynamic_video_link = this.userConfigs.dynamic_video_link
        // 若链接为空则跳过跳转，防止 location.href = '' 无限刷新
        if (!dynamic_video_link) {
            logger.warn('动态页｜「投稿视频」链接为空，跳过跳转，请重新设置')
            return false
        }
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
        const dynamicSidebar = await elementSelectors.wait('dynamicSidebar')
        if (!dynamicSidebar) {
            logger.warn('动态页侧边栏未找到，跳过插入设置按钮')
            return
        }
        const dynamicSettingsOpenButton = createElementAndInsert(getTemplates.dynamicSettingsOpenButton, dynamicSidebar, 'prepend')
        const cleanup = addEventListenerToElement(dynamicSettingsOpenButton, 'click', async () => {
            await settingsComponent.openSettings()
        })
        this._cleanup.push(cleanup)
        logger.debug('侧边栏工具丨插入成功')
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.insertSidebarButtons,
            this.changeCurrentHrefToVideoSubmissions,
            this.handleLoadComments
        ]
        executeFunctionsSequentially(functions)
    }
}
