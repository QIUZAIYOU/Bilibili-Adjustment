/* global queueMicrotask */
import { shadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { sleep, debounce, delay, isElementSizeChange, documentScrollTo, getElementOffsetToDocumentTop, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially, isTabActive, monitorHrefChange, createElementAndInsert, getTotalSecondsFromTimeString } from '@/utils/common'
import { styles } from '@/shared/styles'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
const logger = new LoggerService('VideoModule')
export default {
    name: 'video',
    dependencies: [],
    version: '1.9.0',
    async install () {
        eventBus.on('app:ready', () => {
            logger.info('视频模块｜已加载')
            this.preFunctions()
        })
    },
    async preFunctions () {
        storageService.legacySet('player_type', window.location.pathname.startsWith('/video/') ? 'video' : 'bangumi')
        this.userConfigs = await storageService.getAll('user')
        this.initEventListeners()
        this.initMonitors()
        if (isTabActive()) {
            logger.info('标签页｜已激活')
            this.checkVideoCanplaythrough(await elementSelectors.video)
        }
    },
    async initEventListeners () {
        eventBus.on('logger:show', (_, { type, message }) => {
            logger[type](message)
        })
        eventBus.on('video:canplaythrough', debounce(this.autoSelectPlayerMode, true))
        eventBus.on('video:playerModeSelected', debounce(this.autoLocateToPlayer, true))
        eventBus.once('video:startOtherFunctions', debounce(this.handleExecuteFunctionsSequentially, 500, true))
    },
    initMonitors () {
        monitorHrefChange( () => {
            logger.info('视频资源丨链接已改变')
            delay(this.handleHrefChangedFunctionsSequentially, 1500)
        })
    },
    isVideoCanplaythrough (videoElement) {
        return new Promise(resolve => {
            if (videoElement?.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                return resolve(true)
            }
            const ac = new AbortController()
            const handler = () => {
                if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    ac.abort()
                    resolve(true)
                }
            }
            const events = ['canplaythrough', 'loadeddata']
            events.forEach(event =>
                videoElement.addEventListener(event, handler, { signal: ac.signal }))
            // const TIMEOUT = 1e4
            // setTimeout(() => {
            //     ac.abort()
            //     logger.debug('视频资源丨加载超时')
            //     resolve(false)
            // }, TIMEOUT)
        })
    },
    async checkVideoCanplaythrough (videoElement) {
        const canplaythrough = await this.isVideoCanplaythrough(videoElement)
        if (canplaythrough) {
            eventBus.emit('video:canplaythrough')
            logger.info('视频资源｜可以播放')
            return true
        }
    },
    async autoSelectPlayerMode () {
        const selectPlayerModeStrategies = [
            {
                type: 'wide',
                action: async () => {
                    const playerModeWideEnterButton = await elementSelectors.playerModeWideEnterButton
                    playerModeWideEnterButton.click()
                }
            },
            {
                type: 'web',
                action: async () => {
                    const playerModeWebEnterButton = await elementSelectors.playerModeWebEnterButton
                    playerModeWebEnterButton.click()
                }
            },
            {
                type: 'normal',
                action: async () => {
                    logger.info('屏幕模式丨功能已关闭')
                    eventBus.emit('video:playerModeSelected')
                }
            }
        ]
        selectPlayerModeStrategies.find(strategy => strategy.type === this.userConfigs.selected_player_mode).action()
        await sleep(350)
        if (this.userConfigs.selected_player_mode !== 'normal') {
            if (await this.isPlayerModeSwitchSuccess(this.userConfigs.selected_player_mode, await elementSelectors.video)) {
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
                eventBus.emit('video:playerModeSelected')
            }
        }
    },
    async isPlayerModeSwitchSuccess (selectedPlayerMode, videoElement) {
        const playerContainer = await elementSelectors.playerContainer
        storageService.legacySet('player_offset_top', await getElementOffsetToDocumentTop(playerContainer))
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        // eslint-disable-next-line no-unused-vars
        const observer = isElementSizeChange(videoElement, async (changed, _) => {
            if (changed) {
                const currentPlayerMode = playerContainer.getAttribute('data-screen')
                if (currentPlayerMode === selectedPlayerMode) {
                    observer.disconnect()
                    return true
                }
            }
        })
        this.autoSelectPlayerMode()
    },
    async autoLocateToPlayer () {
        if (!this.userConfigs.auto_locate) {
            logger.info('自动定位丨功能已关闭')
            eventBus.emit('video:locateToPlayer')
        }
        await sleep(300)
        this.locateToPlayer()
        logger.info('自动定位丨成功')
        eventBus.emit('video:locateToPlayer')
    },
    async locateToPlayer () {
        const playerContainer = await elementSelectors.playerContainer
        const playerMode = playerContainer.getAttribute('data-screen')
        const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocumentTop(playerContainer) : this.userConfigs.player_offset_top
        const headerComputedStyle = getElementComputedStyle(await elementSelectors.headerMini, ['position', 'height'])
        // logger.debug(headerComputedStyle.position, headerComputedStyle.height)
        const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - parseInt(headerComputedStyle.height) : playerContainerOffsetTop
        documentScrollTo(playerOffsetTop - this.userConfigs.offset_top)
        eventBus.emit('video:startOtherFunctions')
    },
    async clickPlayerAutoLocate () {
        if (!this.userConfigs.click_player_auto_locate) return
        addEventListenerToElement(await elementSelectors.video, 'click', () => {
            this.locateToPlayer()
        })
    },
    handleJumpToVideoTime (video, target) {
        const targetTime = target.dataset.videoTime
        if (targetTime > video.duration) alert('当前时间点大于视频总时长，将跳到视频结尾！')
        video.currentTime = targetTime
        video.play()
    },
    async clickVideoTimeAutoLocation () {
        const [video, host] = await elementSelectors.batch(['video', 'videoCommentRoot'])
        const descriptionClickTargets = this.userConfigs.player_type === 'video' ? await shadowDOMHelper.querySelectorAll(host, shadowDomSelectors.descriptionVideoTime) : []
        if (descriptionClickTargets.length > 0) {
            descriptionClickTargets.forEach(target => {
                addEventListenerToElement(target, 'click', event => {
                    event.stopPropagation()
                    this.locateToPlayer()
                    this.handleJumpToVideoTime(video, target)
                })
            })
        }
    },
    async doSomethingToCommentElements () {
        const [video, host] = await elementSelectors.batch(['video', 'videoCommentRoot'])
        const insertLocation = (element, location) => {
            const locationWrapperHtml = `<div id="location" style="margin-left:5px">${location}</div>`
            const pubdate = shadowDOMHelper.querySelectorAll(element, shadowDomSelectors.replyPublicDate)
            queueMicrotask(() => {
                pubdate.forEach(date => {
                    createElementAndInsert(locationWrapperHtml, date, 'after')
                })
            })
        }
        const watchMoreRepliesElements = element => {
            shadowDOMHelper.watchQuery(element, '', async reply => {
                insertLocation(reply, reply.data.reply_control.location ?? 'IP属地：未知')
            }, {
                nodeNameFilter: 'bili-comment-reply-renderer',
                debounce: 100,
                maxRetries: 5,
                observeExisting: true,
                scanInterval: 1000
            })
        }
        shadowDOMHelper.watchQuery(
            host,
            shadowDomSelectors.commentRenderderContainer,
            async item => {
                const videoTimeElements = shadowDOMHelper.batchQuery(item, {
                    videoTime: shadowDomSelectors.videoTime,
                    replyVideoTime: shadowDomSelectors.replyVideoTime
                })
                videoTimeElements.forEach(element => {
                    addEventListenerToElement(element, 'click', event => {
                        event.stopPropagation()
                        this.locateToPlayer()
                        this.handleJumpToVideoTime(video, element)
                    })
                })
                if (this.userConfigs.show_location){
                    const replyElements = shadowDOMHelper.batchQuery(item, {
                        comment: shadowDomSelectors.commentRenderder,
                        replies: shadowDomSelectors.commentRepliesRenderer
                    })
                    replyElements.forEach(reply => {
                        insertLocation(reply, reply.data.reply_control.location ?? 'IP属地：未知')
                        if (reply.nodeName.toLowerCase() === 'bili-comment-replies-renderer'){
                            watchMoreRepliesElements(reply)
                        }
                    })
                }
            },
            {
                nodeNameFilter: 'bili-comment-thread-renderer',
                debounce: 100,
                maxRetries: 5,
                observeExisting: true,
                scanInterval: 1000
            }
        )
    },
    async autoSelectVideoHighestQuality () {
        if (!this.userConfigs.auto_select_video_highest_quality) return
        const qualityList = Array.from(await elementSelectors.all('qualitySwitchButtons'))
            .map(btn => ({
                value: +btn.dataset.value,
                element: btn,
                isVIP: btn.children.length < 2
            }))
            .sort((a, b) => b.value - a.value)
        const availableQualities = qualityList.filter(q =>
            this.userConfigs.is_vip ? true : q.isVIP)
        const targetQuality = availableQualities.find(q => {
            if (!this.userConfigs.is_vip) return true
            if (this.userConfigs.contain_quality_8k && q.value === 127) return true
            if (this.userConfigs.contain_quality_4k && q.value === 120) return true
            return q.value < 120
        })
        if (targetQuality) {
            targetQuality.element.click()
            const qualityMap = {
                127: '8K超清',
                120: '4K超清',
                116: '1080P60',
                112: '1080P高码率',
                80: '1080P高清',
                64: '720P高清',
                32: '480P清晰',
                16: '360P流畅'
            }
            logger.info(`最高画质｜${this.userConfigs.is_vip ? 'VIP' : '非VIP'}｜${qualityMap[targetQuality.value] || targetQuality.value
            }｜切换成功`)
        }
    },
    async autoCancelMute () {
        if (!this.userConfigs.auto_cancel_mute) return
        const [mutedButton, volumeButton] = await elementSelectors.batch(['mutedButton', 'volumeButton'])
        if (!mutedButton || !volumeButton) return
        const styles = {
            muted: getElementComputedStyle(mutedButton),
            volume: getElementComputedStyle(volumeButton)
        }
        if (styles.muted.display === 'block' || styles.volume.display === 'none') {
            mutedButton.click()
            logger.info('静音丨已关闭')
        }
    },
    async autoEnableSubtitle () {
        if (!this.userConfigs.auto_subtitle) return
        const switchSubtitleButton = await elementSelectors.switchSubtitleButton
        const enableStatus = switchSubtitleButton.children[0].children[0].children[0].children[1].childElementCount === 1
        if (!enableStatus) {
            switchSubtitleButton.children[0].children[0].click()
            logger.info('视频字幕丨已开启')
        }
    },
    async insertSideFloatNavToolsButton () {
        const floatNav = this.userConfigs.player_type === 'video' ? await elementSelectors.videoFloatNav : await elementSelectors.bangumiFloatNav
        const dataV = floatNav.lastChild.attributes[1].name
        let locateButton
        if (this.userConfigs.player_type === 'video') {
            locateButton = createElementAndInsert(getTemplates.replace('videoLocateButton', { dataV: dataV }), floatNav.lastChild, 'prepend')
        }
        if (this.userConfigs.player_type === 'bangumi') {
            const floatNavMenuItemClass = floatNav.lastChild.lastChild.getAttribute('class')
            locateButton = createElementAndInsert(getTemplates.replace('bangumiLocateButton', { floatNavMenuItemClass: floatNavMenuItemClass }), floatNav.lastChild, 'before')
        }
        locateButton.addEventListener('click', async () => {
            await this.locateToPlayer()
        })
    },
    processVideoCommentDescriptionHtml (html){
        return html.replace(regexps.video.specialBlank, '%20')
            .replace(regexps.video.nbspToBlank, ' ')
            .replace(regexps.video.timeString, match => `<a data-type="seek" data-video-part="-1" data-video-time="${getTotalSecondsFromTimeString(match)}">${match}</a>`)
            .replace(regexps.video.url, match => `<a href="${match}" target="_blank">${match}</a>`)
            .replace(regexps.video.videoId, match => `<a href="https://www.bilibili.com/video/${match}" target="_blank">${match}</a>`)
            .replace(regexps.video.readId, match =>
                `<a href="https://www.bilibili.com/read/${match}" target="_blank">${match}</a>`)
            .replace(regexps.video.blankLine, '')
    },
    async insertVideoDescriptionToComment () {
        // const perfStart = performance.now()
        if (!this.userConfigs.insert_video_description_to_comment || this.userConfigs.player_type === 'bangumi') return
        const [videoDescription, videoDescriptionInfo, host] = await elementSelectors.batch(['videoDescription', 'videoDescriptionInfo', 'videoCommentRoot'])
        const videoCommentReplyListShadowRoot = await shadowDOMHelper.queryUntil(host, shadowDomSelectors.commentRenderderContainer)
        // logger.debug(videoCommentReplyListShadowRoot)
        if (videoDescription.childElementCount > 1 && videoDescriptionInfo.childElementCount > 0) {
            const upAvatarFaceLink = '//www.asifadeaway.com/Stylish/bilibili/avatar-description.png'
            const template = document.createElement('template')
            template.innerHTML = getTemplates.replace('shadowRootVideoDescriptionReply', {
                videoCommentDescription: styles.videoCommentDescription,
                upAvatarFaceLink: upAvatarFaceLink,
                processVideoCommentDescription: this.processVideoCommentDescriptionHtml(videoDescriptionInfo.innerHTML)
            })
            const clone = template.content.cloneNode(true)
            videoCommentReplyListShadowRoot?.prepend(clone)
            await sleep(300)
            if (await shadowDOMHelper.querySelector(host, shadowDomSelectors.descriptionRenderer)) {
                logger.info('视频简介丨已插入')
            } else {
                this.insertVideoDescriptionToComment()
            }
        } else {
            videoDescriptionInfo.innerHTML = this.processVideoCommentDescriptionHtml(videoDescriptionInfo.innerHTML)
            logger.info('视频简介丨已替换')
        }
        // logger.debug(`描述插入耗时：${(performance.now() - perfStart).toFixed(1)}ms`)
    },
    handleHrefChangedFunctionsSequentially (){
        const hrefChangeFunctions = [
            this.locateToPlayer,
            this.insertVideoDescriptionToComment,
            this.clickVideoTimeAutoLocation,
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(hrefChangeFunctions)
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.clickPlayerAutoLocate,
            this.autoSelectVideoHighestQuality,
            this.autoCancelMute,
            this.autoEnableSubtitle,
            this.insertVideoDescriptionToComment,
            this.insertSideFloatNavToolsButton,
            this.clickVideoTimeAutoLocation,
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(functions)
    }
}
