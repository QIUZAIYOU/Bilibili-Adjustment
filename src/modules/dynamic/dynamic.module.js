/* global requestAnimationFrame */
import { shadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponent } from '@/components/settings.component'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { isTabActive, createElementAndInsert, addEventListenerToElement, executeFunctionsSequentially, insertStyleToDocument } from '@/utils/common'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { styles } from '@/shared/styles'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponent()
export default {
    name: 'dynamic',
    version: '1.1.0',
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
        const observers = new Set()
        const listItem = buttonElement.closest(elementSelectors.value('dynamicListItem'))
        const host = await shadowDOMHelper.queryUntil(listItem, elementSelectors.value('videoCommentRoot'), {
            forever: true,
            timeout: 5000,
            interval: 200
        })
        // logger.debug('评论区元素:', host)
        const insertLocation = (element, location) => {
            try {
                const locationWrapperHtml = `<div id="location" style="margin-left:5px">${location}</div>`
                const pubdate = shadowDOMHelper.querySelectorAll(element, shadowDomSelectors.replyPublicDate)
                requestAnimationFrame(() => {
                    pubdate.forEach(date => {
                        if (date.isConnected) {
                            createElementAndInsert(locationWrapperHtml, date, 'after')
                        }
                    })
                })
            } catch (error) {
                logger.error('插入位置信息失败:', error)
            }
        }
        const watchMoreRepliesElements = element => {
            const observer = shadowDOMHelper.watchQuery(element, '', async reply => {
                if (reply?.data?.reply_control?.location) {
                    insertLocation(reply, reply.data.reply_control.location)
                } else {
                    insertLocation(reply, 'IP属地：未知')
                }
            }, {
                nodeNameFilter: 'bili-comment-reply-renderer',
                debounce: 100,
                maxRetries: 5,
                observeExisting: true,
                scanInterval: 1000
            })
            observers.add(observer)
        }
        const showLocation = (host, elements) => {
            const repliesElements = shadowDOMHelper.querySelectorAll(host, shadowDomSelectors.commentRepliesRenderer)
            const allRepliesElements = [...elements, ...repliesElements]
            allRepliesElements.forEach(reply => {
                insertLocation(reply, reply.data.reply_control.location ?? 'IP属地：未知')
                if (reply.nodeName.toLowerCase() === 'bili-comment-replies-renderer'){
                    watchMoreRepliesElements(reply)
                }
            })
        }
        const removeCommentTagElements = host => {
            const tagElements = shadowDOMHelper.querySelectorAll(host, shadowDomSelectors.commentTags)
            tagElements.forEach(tag => {
                tag.remove()
            })
        }
        const commentRenderderContainer = await shadowDOMHelper.queryUntil(host, shadowDomSelectors.commentRenderderContainer, { forever: true })
        if (commentRenderderContainer){
            shadowDOMHelper.watchQuery(
                host,
                shadowDomSelectors.commentRenderderContainer,
                async item => {
                    const replyElements = shadowDOMHelper.querySelectorAll(item, shadowDomSelectors.commentRenderder)
                    if (this.userConfigs.show_location){
                        showLocation(item, replyElements)
                    }
                    if (this.userConfigs.remove_comment_tags){
                        removeCommentTagElements(item)
                    }
                },
                {
                    nodeNameFilter: 'bili-comment-thread-renderer',
                    debounce: 100,
                    maxRetries: 5,
                    observeExisting: true,
                    scanInterval: 100
                }
            )
        }
    },
    handleLoadComments () {
        // 使用WeakMap记录已添加过监听器的按钮
        const handledButtons = new WeakMap()
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    const commentButtons = elementSelectors.queryAll('dynamicCommentLoadButton')
                    if (commentButtons.length > 0) {
                        commentButtons.forEach(button => {
                            // 检查是否已经添加过监听器
                            if (!handledButtons.has(button)) {
                                addEventListenerToElement(button, 'click', () => {
                                    // logger.debug('点击评论按钮', button)
                                    this.doSomethingToCommentElements(button)
                                })
                                handledButtons.set(button, true)
                            }
                        })
                    }
                }
            })
        })
        observer.observe(document.body, {
            childList: true,
            subtree: true
        })
        // 处理已存在的按钮
        const existingButtons = elementSelectors.queryAll('dynamicCommentLoadButton')
        existingButtons.forEach(button => {
            addEventListenerToElement(button, 'click', () => {
                // logger.info('点击评论按钮')
                this.doSomethingToCommentElements(button)
            })
            handledButtons.set(button, true)
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
