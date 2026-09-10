import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponentV2 } from '@/components/settings-component-v2'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { createElementAndInsert, addEventListenerToElement, executeFunctionsSequentially, insertStyleToDocument } from '@/utils/common'
import { waitForCondition } from '@/utils/dom-wait'
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
    async insertSidebarButtons () {
        const insert = () => {
            if (this._dynamicSidebarButtonInserted) return true
            const dynamicSidebar = elementSelectors.get('dynamicSidebar')
            if (!dynamicSidebar) return false
            const dynamicSettingsOpenButton = createElementAndInsert(getTemplates.dynamicSettingsOpenButton, dynamicSidebar, 'prepend')
            const cleanup = addEventListenerToElement(dynamicSettingsOpenButton, 'click', async () => {
                await settingsComponent.openSettings()
            })
            this._cleanup.push(cleanup)
            this._dynamicSidebarButtonInserted = true
            logger.debug('侧边栏工具丨插入成功')
            return true
        }
        // 立即尝试一次；未命中则条件等待（选择器 wait + Observer 兜底），
        // 替代原先「wait(4s) + 6 次 sleep(1000)」的粗放轮询（P1-4.4）
        if (insert()) return
        await elementSelectors.wait('dynamicSidebar', 4000)
        if (insert()) return
        const stopWaiting = waitForCondition({
            probe: () => elementSelectors.get('dynamicSidebar'),
            onFound: () => insert(),
            timeout: 10000
        })
        this._cleanup.push(stopWaiting)
        logger.debug('动态页侧边栏未就绪，已挂起等待（最长 10s）')
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
