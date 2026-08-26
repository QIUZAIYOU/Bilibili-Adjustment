import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { createElementAndInsert, addEventListenerToElement } from '@/utils/common'
import { biliApis } from '@/shared/bili-apis'
import { stylesV2 } from '@/shared/styles'
import { getTemplates } from '@/shared/templates'
import { formatVideoCommentDescription, formatVideoCommentContents } from '@/shared/regexps'
const logger = new LoggerService('VideoModule')
const shadowDOMHelper = new ShadowDOMHelper()
export const commentFeatures = {
    // 显示评论IP属地
    showLocation (host, location) {
        try {
            const existingLocation = shadowDOMHelper.queryDescendant(host, '#location')
            if (existingLocation) return
            const locationWrapperHtml = '<div id="location" style="margin-left:5px"></div>'
            const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.value('videoReplyPubDate'))
            if (!pubdate) return
            const locationElement = createElementAndInsert(locationWrapperHtml, pubdate, 'after')
            if (locationElement) locationElement.textContent = location || 'IP属地：未知'
        } catch (error) {
            logger.error('插入位置信息失败:', error)
        }
    },
    // 激活评论时间锚点
    async activeTimeSeek (host, video) {
        const descriptionTimeSeekElements = shadowDOMHelper.querySelectorAll('#adjustment-comment-description a[data-type="seek"]')
        const commentTimeSeekElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.timeSeekElement, true)
        const timeSeekElements = [...descriptionTimeSeekElements, ...commentTimeSeekElements]
        timeSeekElements.forEach(element => {
            addEventListenerToElement(element, 'click', async event => {
                event.stopPropagation()
                await this.locateToPlayer()
                this.handleJumpToVideoTime(video, element)
            })
        })
    },
    // 移除评论标签
    removeCommentTagElements (host) {
        const tagElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.commentTags, true)
        tagElements.forEach(tag => {
            tag.remove()
        })
    },
    // 格式化评论内容
    formatCommentContents (host) {
        const contents = shadowDOMHelper.queryDescendant(host, '#contents')
        if (!contents) return
        contents.innerHTML = formatVideoCommentContents(contents)
    },
    // 处理评论元素
    async doSomethingToCommentElements () {
        const video = await elementSelectors.video
        this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, root => {
            if (root){
                this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_comment_location){
                        this.showLocation(renderder, renderder.data?.reply_control?.location ?? 'IP属地：未知')
                    }
                    if (this.userConfigs.remove_comment_tags){
                        this.removeCommentTagElements(renderder)
                    }
                }, root))
                this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_comment_location){
                        this.showLocation(renderder, renderder.data?.reply_control?.location ?? 'IP属地：未知')
                    }
                }, root))
            }
        }))
    },
    async insertVideoDescriptionToComment () {
        // 清理上一次的轮询：旧闭包持有上一个视频的简介数据，不清理会在切换视频后把旧简介重新插入
        if (this._checkDescriptionInterval) {
            clearInterval(this._checkDescriptionInterval)
            this._checkDescriptionInterval = null
        }
        let videoInfo
        try {
            videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        } catch (error) {
            logger.error('视频简介丨获取视频信息失败', error)
            return
        }
        if (!videoInfo) {
            logger.info('视频简介丨未获取到视频信息，跳过插入')
            return
        }
        const videoDescription = videoInfo.desc || ''
        // 插入前检查：移除所有已存在的视频简介元素
        const existingDescriptions = shadowDOMHelper.querySelectorAll(elementSelectors.value('adjustmentCommentDescription'))
        for (const el of existingDescriptions) {
            el.remove()
            logger.debug('视频简介丨插入前发现已存在，已移除')
        }
        // 断开旧的观察器，避免重复观察
        if (this.videoDescriptionObserver) {
            this.videoDescriptionObserver.disconnect()
            this.videoDescriptionObserver = null
        }
        const descriptionHtml = formatVideoCommentDescription(videoDescription, videoInfo.desc_v2)
        const insertToCommentArea = () => {
            const videoCommentReplyListShadowRoot = shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
            if (!videoCommentReplyListShadowRoot) return false
            const upAvatarFaceLink = '//www.asifadeaway.com/Stylish/bilibili/avatar-description.png'
            const template = document.createElement('template')
            template.innerHTML = getTemplates.replace('shadowRootVideoDescriptionReply', {
                videoCommentDescription: stylesV2.videoCommentDescription,
                upAvatarFaceLink: upAvatarFaceLink,
                processVideoCommentDescription: descriptionHtml
            })
            const clone = template.content.cloneNode(true)
            videoCommentReplyListShadowRoot.prepend(clone)
            // 启动 MutationObserver 监控插入后的重复情况
            this._observeVideoDescriptionDuplicates(videoCommentReplyListShadowRoot)
            return true
        }
        // 轮询等待新页面渲染完成：简介信息区出现新视频内容后才插入，
        // 避免过早插入到 B站 重渲染前的旧评论区导致简介丢失或残留
        const MAX_ATTEMPTS = 30 // 约 9 秒
        let attempts = 0
        const checkAndTrigger = setInterval(async () => {
            attempts++
            const [videoDescriptionElement, videoDescriptionInfoElement] = await elementSelectors.batch(['videoDescription', 'videoDescriptionInfo'])
            // 信息区已渲染出新视频内容（含标题与简介正文）视为页面就绪
            const infoReady = videoDescriptionElement?.childElementCount > 1 && videoDescriptionInfoElement?.childElementCount > 0
            // 已插入且校验通过，结束轮询
            if (infoReady && shadowDOMHelper.querySelector(shadowDomSelectors.descriptionRenderer)) {
                clearInterval(checkAndTrigger)
                this._checkDescriptionInterval = null
                return
            }
            if (infoReady && insertToCommentArea() && shadowDOMHelper.querySelector(shadowDomSelectors.descriptionRenderer)) {
                clearInterval(checkAndTrigger)
                this._checkDescriptionInterval = null
                logger.info('视频简介丨已插入评论区')
                return
            }
            // 页面未就绪或评论区插入未生效（B站可能正在重渲染评论区），继续轮询等待
            if (attempts < MAX_ATTEMPTS) return
            clearInterval(checkAndTrigger)
            this._checkDescriptionInterval = null
            if (infoReady) {
                // 评论区始终不可用时退化为替换简介区
                const videoDescriptionInfoElement = await elementSelectors.query('videoDescriptionInfo')
                if (videoDescriptionInfoElement) {
                    videoDescriptionInfoElement.innerHTML = descriptionHtml
                    logger.debug('视频简介丨已替换')
                }
            } else {
                logger.info('视频简介丨等待页面渲染超时，跳过插入')
            }
        }, 300)
        this._checkDescriptionInterval = checkAndTrigger
    },
    /**
     * 使用 MutationObserver 监控视频简介元素的重复情况
     * 若发现多个 #adjustment-comment-description，只保留最新插入的
     * @param {Element} targetNode - 需要观察的父节点
     */
    _observeVideoDescriptionDuplicates (targetNode) {
        if (this.videoDescriptionObserver) {
            this.videoDescriptionObserver.disconnect()
        }
        this.videoDescriptionObserver = new MutationObserver(mutations => {
            const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length > 0)
            if (!hasAddedNodes) return
            // 延迟检查，确保 DOM 已稳定
            requestAnimationFrame(() => {
                const descriptions = shadowDOMHelper.querySelectorAll('#adjustment-comment-description')
                if (descriptions.length > 1) {
                    // 保留最后一个（最新插入的），移除其余
                    for (let i = 0; i < descriptions.length - 1; i++) {
                        descriptions[i].remove()
                        logger.debug('视频简介丨插入后发现重复，已移除旧的')
                    }
                }
            })
        })
        this.videoDescriptionObserver.observe(targetNode, { childList: true, subtree: false })
    }
}
