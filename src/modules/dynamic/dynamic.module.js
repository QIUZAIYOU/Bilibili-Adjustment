/* global requestAnimationFrame */
import { ShadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponent } from '@/components/settings.component'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { sleep, isTabActive, createElementAndInsert, addEventListenerToElement, executeFunctionsSequentially, insertStyleToDocument } from '@/utils/common'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { styles } from '@/shared/styles'
const shadowDOMHelper = new ShadowDOMHelper()
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponent()
export default {
    name: 'dynamic',
    version: '2.0.0',
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
    async doSomethingToCommentElements (buttonElement){
        const listItem = buttonElement.closest(elementSelectors.value('dynamicListItem'))
        const showLocation = (host, location) => {
            try {
                const locationWrapperHtml = `<div id="location" style="margin-left:5px">${location}</div>`
                const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.value('videoReplyPubDate'))
                createElementAndInsert(locationWrapperHtml, pubdate, 'after')
            } catch (error) {
                logger.error('插入位置信息失败:', error)
            }
        }
        const removeCommentTagElements = host => {
            const tagElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.commentTags, true)
            tagElements.forEach(tag => {
                tag.remove()
            })
        }
        await sleep(500)
        const videoCommentRenderders = shadowDOMHelper.queryDescendant(listItem, shadowDomSelectors.commentRenderder, true)
        videoCommentRenderders.forEach(renderder => {
            if (this.userConfigs.show_location){
                showLocation(renderder, renderder.data.reply_control.location ?? 'IP属地：未知')
            }
            if (this.userConfigs.remove_comment_tags){
                removeCommentTagElements(renderder)
            }
        })
        shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
            if (this.userConfigs.show_location){
                showLocation(renderder, renderder.data.reply_control.location ?? 'IP属地：未知')
            }
        }, listItem)
    },
    handleLoadComments () {
        const handledButtons = new WeakMap()
        shadowDOMHelper.observeInsertion(elementSelectors.value('dynamicCommentLoadButton'), button => {
            if (!handledButtons.has(button)) {
                addEventListenerToElement(button, 'click', () => {
                    // logger.debug('点击评论按钮', button)
                    this.doSomethingToCommentElements(button)
                    handledButtons.set(button, true)
                })
            }
        })
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
