import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { createElementAndInsert, addEventListenerToElement, sleep } from '@/utils/common'
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
        // 已链接化过则跳过，防止多轮处理叠加产生嵌套链接
        if (contents.querySelector('bilibili-adjustment-element')) return
        contents.innerHTML = formatVideoCommentContents(contents)
    },
    // 绑定简介区替换内容中的时间锚点点击跳转（替换简介区后调用）
    async activeDescriptionTimeSeek () {
        const video = await elementSelectors.video
        if (!video) return
        const seekElements = document.querySelectorAll(`${elementSelectors.value('videoDescriptionText')} a[data-type="seek"]`)
        seekElements.forEach(element => {
            addEventListenerToElement(element, 'click', async event => {
                event.stopPropagation()
                await this.locateToPlayer()
                this.handleJumpToVideoTime(video, element)
            })
        })
    },
    // 处理评论元素
    async doSomethingToCommentElements () {
        const video = await elementSelectors.video
        // 链接变化时重建观察器：先释放上一轮的外层与内层观察器，
        // 避免多套观察器叠加导致同一评论元素被重复处理（重复链接化会产生嵌套链接）
        this._commentObservationCleanups?.forEach(cleanup => cleanup())
        this._commentObservationCleanups = []
        const track = cleanup => this._commentObservationCleanups.push(cleanup)
        this._cleanup.push(() => this._commentObservationCleanups?.forEach(cleanup => cleanup()))
        track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, root => {
            if (root){
                track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_comment_location){
                        this.showLocation(renderder, renderder.data?.reply_control?.location ?? 'IP属地：未知')
                    }
                    if (this.userConfigs.remove_comment_tags){
                        this.removeCommentTagElements(renderder)
                    }
                }, root))
                track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
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
        // 清理上一次的执行：旧闭包持有上一个视频的简介数据，不清理会在切换视频后把旧简介重新插入
        if (this._descriptionFeedWaitStop) {
            this._descriptionFeedWaitStop()
            this._descriptionFeedWaitStop = null
        }
        if (this._descriptionFallbackTimer) {
            clearTimeout(this._descriptionFallbackTimer)
            this._descriptionFallbackTimer = null
        }
        if (this._descriptionWatchdog) {
            clearTimeout(this._descriptionWatchdog)
            this._descriptionWatchdog = null
        }
        // 运行令牌：SPA 切换触发的下一次调用会让旧调用在等待中途主动放弃，避免并发插入
        this._descriptionRunToken = (this._descriptionRunToken || 0) + 1
        const runToken = this._descriptionRunToken
        const isCancelled = () => runToken !== this._descriptionRunToken
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
        // 没有简介内容的视频无需插入
        if (!videoDescription.trim()) {
            logger.debug('视频简介丨简介为空，跳过插入')
            return
        }
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
        const insertToCommentArea = feedElement => {
            const videoCommentReplyListShadowRoot = feedElement || shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
            if (!videoCommentReplyListShadowRoot) return false
            const upAvatarFaceLink = 'data:image/png;base64,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'
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
        // 页面已渲染出当前视频内容的判断（SPA 切换视频时旧内容会短暂残留，
        // 过早插入会进到重渲染前的旧评论区）：
        // 1) 页面标题与当前视频一致；2) 简介区文本与当前视频简介开头一致（简介较长时 DOM 中可能只保留开头）
        const normalize = text => String(text || '').replace(/\s+/g, ' ').trim()
        const pageRenderedForCurrentVideo = () => {
            const titleElement = elementSelectors.query('videoTitle')
            const currentTitle = normalize(videoInfo.title)
            if (currentTitle !== '' && normalize(titleElement?.textContent) === currentTitle) return true
            const descriptionTextElement = elementSelectors.query('videoDescriptionText')
            const descPrefix = normalize(videoDescription).slice(0, 20)
            return descPrefix !== '' && normalize(descriptionTextElement?.textContent).startsWith(descPrefix)
        }
        // 截断判断：只有简介被截断（需点击"展开"才能查看完整内容）的简介才插入评论区，
        // 短简介无需重复展示，直接跳过（这是本功能的设计初衷）
        const isDescriptionTruncated = (videoDescriptionElement, videoDescriptionInfoElement) =>
            videoDescriptionElement?.childElementCount > 1 && videoDescriptionInfoElement?.childElementCount > 0
        // 阶段一：等待页面为当前视频渲染完成（标题匹配），最长约 10 秒。
        // 标题匹配后简介区随新视频一并渲染，其截断状态即已确定；
        // 连续两次读取结果一致才下结论，避免 SPA 渲染过渡期读到旧简介区的状态
        let pageReady = false
        let descBlockExists = false
        let truncated = false
        let prevTruncated = null
        for (let attempt = 0; attempt < 40; attempt++) {
            if (isCancelled()) return
            pageReady = pageRenderedForCurrentVideo()
            if (pageReady) {
                const [videoDescriptionElement, videoDescriptionInfoElement] = await elementSelectors.batch(['videoDescription', 'videoDescriptionInfo'])
                descBlockExists = Boolean(videoDescriptionElement && videoDescriptionInfoElement)
                truncated = isDescriptionTruncated(videoDescriptionElement, videoDescriptionInfoElement)
                if (descBlockExists && truncated === prevTruncated && prevTruncated !== null) break
                prevTruncated = truncated
            }
            await sleep(250)
        }
        if (isCancelled()) return
        if (!pageReady) {
            logger.info('视频简介丨页面未完成渲染，跳过插入')
            return
        }
        if (!descBlockExists) {
            logger.info('视频简介丨未找到简介信息区，跳过插入')
            return
        }
        // 替换原简介区内容为链接化版本（时间锚点/URL/BV号/cv号/@用户），不论简介长短都要执行，
        // 与插入评论区解耦；仅替换 .desc-info-text 内部内容，保留 B 站原始 DOM 结构
        const videoDescriptionInfoElement = elementSelectors.query('videoDescriptionInfo')
        const descriptionTextElement = videoDescriptionInfoElement?.querySelector('.desc-info-text')
        if (descriptionTextElement) {
            // 简介区无 pre-line 样式保证时换行会被 HTML 折叠，显式转为 <br>
            descriptionTextElement.innerHTML = descriptionHtml.replace(/\n/g, '<br>')
            await this.activeDescriptionTimeSeek()
            logger.info('视频简介丨已替换简介区内容')
        }
        if (!truncated) {
            logger.debug('视频简介丨简介未截断，无需插入评论区')
            return
        }
        // 校验插入结果是否仍存在：B站 重渲染评论区可能清除插入内容，被清除则重新插入（最多 3 轮）
        const verifyAndRepairInsert = rounds => {
            if (rounds <= 0) return
            this._descriptionWatchdog = setTimeout(async () => {
                this._descriptionWatchdog = null
                if (isCancelled()) return
                if (shadowDOMHelper.querySelector(elementSelectors.value('adjustmentCommentDescription'))) return
                if (insertToCommentArea()) {
                    logger.debug('视频简介丨插入内容被清除，已重新插入')
                    verifyAndRepairInsert(rounds - 1)
                }
            }, 1500)
        }
        // 阶段二：评论区为懒加载。若 #feed 已存在则立即插入；
        // 否则用 observeInsertion 监听，出现即插入。监听不设放弃时限，
        // 持续到插入成功或被取消（SPA 切换 / 卸载），且不阻塞顺序执行器
        const insertIntoFeed = feedElement => {
            if (isCancelled()) return
            if (!insertToCommentArea(feedElement)) return
            if (this._descriptionFeedWaitStop) {
                this._descriptionFeedWaitStop()
                this._descriptionFeedWaitStop = null
            }
            if (this._descriptionFallbackTimer) {
                clearTimeout(this._descriptionFallbackTimer)
                this._descriptionFallbackTimer = null
            }
            logger.info('视频简介丨已插入评论区')
            verifyAndRepairInsert(3)
        }
        const existingFeed = shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
        if (existingFeed) {
            insertIntoFeed(existingFeed)
            return
        }
        this._descriptionFeedWaitStop = shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, insertIntoFeed)
        // 评论区始终不可用（如关闭评论区）时退化为替换简介区，让用户无需点击"展开"即可阅读完整简介；
        // 监听不取消，之后评论区出现仍会正常插入
        this._descriptionFallbackTimer = setTimeout(() => {
            this._descriptionFallbackTimer = null
            if (isCancelled()) return
            const videoDescriptionInfoElement = elementSelectors.query('videoDescriptionInfo')
            if (videoDescriptionInfoElement) {
                videoDescriptionInfoElement.innerHTML = descriptionHtml
                logger.info('视频简介丨评论区不可用，已替换简介区内容')
            }
        }, 15000)
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
