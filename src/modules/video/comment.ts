import { LoggerService } from '@/services/logger.service'
import { getTemplates } from '@/shared/templates'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { createElementAndInsert, addEventListenerToElement, sleep } from '@/utils/common'
import { biliApis } from '@/shared/bili-apis'
import { styles } from '@/shared/styles'
import { renderVideoDescription } from '@/shared/templates/comments/video-description'
import { getDescriptionAvatarSync, refreshDescriptionAvatar } from '@/utils/description-avatar'
import { formatVideoCommentDescription, formatVideoCommentContents } from '@/shared/regexps'
const logger = new LoggerService('VideoModule')
const shadowDOMHelper = new ShadowDOMHelper()
/** 简介插入所需的视频信息子集 */
interface VideoInfoLike {
    desc?: string
    title?: string
    desc_v2?: Array<{ raw_text?: string; biz_id?: string | number }>
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface CommentContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _commentObservationCleanups?: Array<() => void>
    videoDescriptionObserver?: MutationObserver | null
    _descriptionSurvivalObserver?: MutationObserver | null
    _descriptionSurvivalRoot?: Element | null
    _descriptionWatchdog?: ReturnType<typeof setTimeout> | null
    _descriptionFallbackTimer?: ReturnType<typeof setTimeout> | null
    _descriptionFeedWaitStop?: (() => void) | null
    _descriptionRunToken?: number
    locateToPlayer: () => Promise<void>
    handleJumpToVideoTime: (video: HTMLVideoElement, target: HTMLElement) => void
    activeDescriptionTimeSeek: () => Promise<void>
    activeTimeSeek: (host: Element, video: HTMLVideoElement | null) => Promise<void>
    formatCommentContents: (host: Element) => void
    showLocation: (host: Element, location?: string | null) => void
    removeCommentTagElements: (host: Element) => void
    _observeVideoDescriptionDuplicates: (targetNode: Element) => void
}
export const commentFeatures = {
    // 显示评论IP属地
    showLocation (this: CommentContext, host: Element, location?: string | null): void {
        try {
            const existingLocation = shadowDOMHelper.queryDescendant(host, '#location')
            if (existingLocation) return
            const locationWrapperHtml = getTemplates.locationWrapper
            const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.CSS('videoReplyPubDate') as string)
            if (!pubdate) return
            const locationElement = createElementAndInsert(locationWrapperHtml, pubdate as Node, 'after') as HTMLElement | null
            if (locationElement) locationElement.textContent = location || 'IP属地：未知'
        } catch (error) {
            logger.error('插入位置信息失败:', error)
        }
    },
    // 激活评论时间锚点
    async activeTimeSeek (this: CommentContext, host: Element, video: HTMLVideoElement | null): Promise<void> {
        const descriptionTimeSeekElements = shadowDOMHelper.querySelectorAll('#adjustment-comment-description a[data-type="seek"]')
        const commentTimeSeekElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.timeSeekElement, true) as Element[]
        const timeSeekElements: Element[] = [...descriptionTimeSeekElements, ...commentTimeSeekElements]
        timeSeekElements.forEach(element => {
            addEventListenerToElement(element, 'click', async event => {
                event.stopPropagation()
                await this.locateToPlayer()
                this.handleJumpToVideoTime(video as HTMLVideoElement, element as HTMLElement)
            })
        })
    },
    // 移除评论标签
    removeCommentTagElements (this: CommentContext, host: Element): void {
        const tagElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.commentTags, true) as Element[]
        tagElements.forEach(tag => {
            tag.remove()
        })
    },
    // 格式化评论内容
    formatCommentContents (this: CommentContext, host: Element): void {
        const contents = shadowDOMHelper.queryDescendant(host, '#contents') as Element | null
        if (!contents) return
        // 已链接化过则跳过，防止多轮处理叠加产生嵌套链接
        if (contents.querySelector('bilibili-adjustment-element')) return
        contents.innerHTML = formatVideoCommentContents(contents)
    },
    // 绑定简介区替换内容中的时间锚点点击跳转（替换简介区后调用）
    async activeDescriptionTimeSeek (this: CommentContext): Promise<void> {
        const video = elementSelectors.get('video') as HTMLVideoElement | null
        if (!video) return
        const seekElements = document.querySelectorAll(`${elementSelectors.CSS('videoDescriptionText')} a[data-type="seek"]`)
        seekElements.forEach(element => {
            addEventListenerToElement(element, 'click', async event => {
                event.stopPropagation()
                await this.locateToPlayer()
                this.handleJumpToVideoTime(video as HTMLVideoElement, element as HTMLElement)
            })
        })
    },
    // 处理评论元素
    async doSomethingToCommentElements (this: CommentContext): Promise<void> {
        const video = elementSelectors.get('video') as HTMLVideoElement | null
        // 链接变化时重建观察器：先释放上一轮的外层与内层观察器，
        // 避免多套观察器叠加导致同一评论元素被重复处理（重复链接化会产生嵌套链接）
        this._commentObservationCleanups?.forEach(cleanup => cleanup())
        this._commentObservationCleanups = []
        const track = (cleanup: () => void): number => this._commentObservationCleanups!.push(cleanup)
        this._cleanup.push(() => this._commentObservationCleanups?.forEach(cleanup => cleanup()))
        track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, root => {
            if (root){
                track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_comment_location){
                        this.showLocation(renderder, (renderder as Element & { data?: { reply_control?: { location?: string }}}).data?.reply_control?.location ?? 'IP属地：未知')
                    }
                    if (this.userConfigs.remove_comment_tags){
                        this.removeCommentTagElements(renderder)
                    }
                }, root))
                track(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_comment_location){
                        this.showLocation(renderder, (renderder as Element & { data?: { reply_control?: { location?: string }}}).data?.reply_control?.location ?? 'IP属地：未知')
                    }
                }, root))
            }
        }))
    },
    async insertVideoDescriptionToComment (this: CommentContext): Promise<void> {
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
        let videoInfo: VideoInfoLike | null | undefined
        try {
            videoInfo = await biliApis.getVideoInformation(String(this.userConfigs.page_type), biliApis.getCurrentVideoID(window.location.href)) as VideoInfoLike | null | undefined
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
        const existingDescriptions = shadowDOMHelper.querySelectorAll(elementSelectors.CSS('adjustmentCommentDescription') as string)
        for (const el of existingDescriptions) {
            el.remove()
            logger.debug('视频简介丨插入前发现已存在，已移除')
        }
        // 断开旧的观察器，避免重复观察
        if (this.videoDescriptionObserver) {
            this.videoDescriptionObserver.disconnect()
            this.videoDescriptionObserver = null
        }
        // 断开旧的「生存守护」观察器（SPA 切换/重跑时不再补插旧视频内容）
        if (this._descriptionSurvivalObserver) {
            this._descriptionSurvivalObserver.disconnect()
            this._descriptionSurvivalObserver = null
            this._descriptionSurvivalRoot = null
        }
        const descriptionHtml = formatVideoCommentDescription(videoDescription, videoInfo.desc_v2)
        const insertToCommentArea = (feedElement?: Element | null): boolean => {
            const videoCommentReplyListShadowRoot = feedElement || shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
            if (!videoCommentReplyListShadowRoot) return false
            const template = document.createElement('template')
            template.innerHTML = renderVideoDescription({
                styleCss: styles.videoCommentDescription,
                avatarDataUri: getDescriptionAvatarSync(),
                bodyHtml: descriptionHtml
            })
            const clone = template.content.cloneNode(true)
            videoCommentReplyListShadowRoot.prepend(clone)
            // 后台刷新远程头像：成功后替换本容器内已插入的头像，失败沿用当前值（含内置兜底）
            void refreshDescriptionAvatar(dataUri => {
                videoCommentReplyListShadowRoot.querySelectorAll('img#bili-adjustment-avatar-picture').forEach(node => {
                    if (node instanceof HTMLImageElement) node.src = dataUri
                })
            })
            // 启动 MutationObserver 监控插入后的重复情况
            this._observeVideoDescriptionDuplicates(videoCommentReplyListShadowRoot)
            // 启动「生存守护」：B 站重渲染评论区清空插入内容时自动补插（见 startSurvivalWatch）
            startSurvivalWatch(videoCommentReplyListShadowRoot)
            return true
        }
        // 页面已渲染出当前视频内容的判断（SPA 切换视频时旧内容会短暂残留，
        // 过早插入会进到重渲染前的旧评论区）：
        // 1) 页面标题与当前视频一致；2) 简介区文本与当前视频简介开头一致（简介较长时 DOM 中可能只保留开头）
        const normalize = (text: unknown): string => String(text || '').replace(/\s+/g, ' ').trim()
        const pageRenderedForCurrentVideo = (): boolean => {
            const titleElement = elementSelectors.get('videoTitle')
            const currentTitle = normalize(videoInfo.title)
            if (currentTitle !== '' && normalize(titleElement?.textContent) === currentTitle) return true
            const descriptionTextElement = elementSelectors.get('videoDescriptionText')
            const descPrefix = normalize(videoDescription).slice(0, 20)
            return descPrefix !== '' && normalize(descriptionTextElement?.textContent).startsWith(descPrefix)
        }
        // 截断判断：只有简介被截断（需点击"展开"才能查看完整内容）的简介才插入评论区，
        // 短简介无需重复展示，直接跳过（这是本功能的设计初衷）
        const isDescriptionTruncated = (videoDescriptionElement: Element | null, videoDescriptionInfoElement: Element | null): boolean =>
            (videoDescriptionElement?.childElementCount ?? 0) > 1 && (videoDescriptionInfoElement?.childElementCount ?? 0) > 0
        // 阶段一：等待页面为当前视频渲染完成（标题匹配），最长约 10 秒。
        // 标题匹配后简介区随新视频一并渲染，其截断状态即已确定；
        // 连续两次读取结果一致才下结论，避免 SPA 渲染过渡期读到旧简介区的状态
        let pageReady = false
        let descBlockExists = false
        let truncated = false
        let prevTruncated: boolean | null = null
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
        const videoDescriptionInfoElement = elementSelectors.get('videoDescriptionInfo')
        const descriptionTextElement = videoDescriptionInfoElement?.querySelector(elementSelectors.CSS('videoDescriptionTextInner') || '.desc-info-text')
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
        // 「生存守护」：B 站可能重渲染评论区并清空我们插入的内容（多 P 选集切换/评论懒加载重绘时偶发）。
        // 监听评论区容器 childList，若 host 消失则在稳定后补插；SPA 取消（runToken 变化）即停止。
        let survivalTimer: ReturnType<typeof setTimeout> | undefined = 0
        const startSurvivalWatch = (targetRoot: Element | null): void => {
            if (!targetRoot || this._descriptionSurvivalRoot === targetRoot) return
            this._descriptionSurvivalRoot = targetRoot
            if (this._descriptionSurvivalObserver) {
                this._descriptionSurvivalObserver.disconnect()
            }
            this._descriptionSurvivalObserver = new MutationObserver(() => {
                if (isCancelled()) return
                clearTimeout(survivalTimer)
                survivalTimer = setTimeout(() => {
                    if (isCancelled()) return
                    if (shadowDOMHelper.querySelector(elementSelectors.CSS('adjustmentCommentDescription') as string)) return
                    insertToCommentArea()
                    logger.debug('视频简介丨评论区重渲染后已自动补插')
                }, 500)
            })
            this._descriptionSurvivalObserver.observe(targetRoot, { childList: true })
        }
        // 校验插入结果是否仍存在：B站 重渲染评论区可能清除插入内容，被清除则重新插入（最多 3 轮）
        const verifyAndRepairInsert = (rounds: number): void => {
            if (rounds <= 0) return
            this._descriptionWatchdog = setTimeout(async () => {
                this._descriptionWatchdog = null
                if (isCancelled()) return
                if (shadowDOMHelper.querySelector(elementSelectors.CSS('adjustmentCommentDescription') as string)) return
                if (insertToCommentArea()) {
                    logger.debug('视频简介丨插入内容被清除，已重新插入')
                    verifyAndRepairInsert(rounds - 1)
                }
            }, 1500)
        }
        // 阶段二：评论区为懒加载。若 #feed 已存在则立即插入；
        // 否则用 observeInsertion 监听，出现即插入。监听不设放弃时限，
        // 持续到插入成功或被取消（SPA 切换 / 卸载），且不阻塞顺序执行器
        const insertIntoFeed = (feedElement?: Element | null): void => {
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
            const videoDescriptionInfoElement = elementSelectors.get('videoDescriptionInfo')
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
    _observeVideoDescriptionDuplicates (this: CommentContext, targetNode: Element): void {
        if (this.videoDescriptionObserver) {
            this.videoDescriptionObserver.disconnect()
        }
        this.videoDescriptionObserver = new MutationObserver((mutations: MutationRecord[]) => {
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
