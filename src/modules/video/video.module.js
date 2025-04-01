/* global queueMicrotask */
import { shadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponent } from '@/components/settings.component'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { sleep, debounce, isElementSizeChange, documentScrollTo, getElementOffsetToDocument, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially, isTabActive, monitorHrefChange, createElementAndInsert, getTotalSecondsFromTimeString, insertStyleToDocument, getBodyHeight, initializeCheckbox, showPlayerTooltip, hidePlayerTooltip } from '@/utils/common'
import { biliApis } from '@/shared/biliApis'
import { styles } from '@/shared/styles'
import { regexps } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponent()
export default {
    name: 'video',
    version: '2.2.2',
    async install () {
        insertStyleToDocument({ 'BodyOverflowHiddenStyle': styles.BodyOverflowHidden })
        eventBus.on('app:ready', async () => {
            logger.info('视频模块｜已加载')
            await this.preFunctions()
        })
    },
    async preFunctions () {
        await storageService.legacySet('player_type', location.pathname.startsWith('/video/') ? 'video' : 'bangumi')
        await sleep(300)
        this.userConfigs = await storageService.getAll('user')
        this.registSettings()
        this.initEventListeners()
        this.initMonitors()
    },
    async initEventListeners () {
        eventBus.on('logger:show', (_, { type, message }) => {
            logger[type](message)
        })
        eventBus.on('video:canplaythrough', debounce(this.autoSelectPlayerMode, true))
        eventBus.on('video:playerModeSelected', debounce(this.autoLocateToPlayer, true))
        eventBus.once('video:startOtherFunctions', debounce(this.handleExecuteFunctionsSequentially, 500, true))
        eventBus.once('video:webfullPlayerModeUnlock', debounce(this.insertLocateToCommentButton, 500, true))
    },
    async registSettings (){
        await settingsComponent.init(this.userConfigs)
    },
    initMonitors () {
        monitorHrefChange( () => {
            logger.info('视频资源丨链接已改变')
            this.handleHrefChangedFunctionsSequentially()
        })
        const monitorTabActiveState = isTabActive({
            onActiveChange: async isActive => {
                if (isActive) {
                    logger.info('标签页｜已激活')
                    insertStyleToDocument({ 'VideoPageAdjustmentStyle': styles.VideoPageAdjustment, 'VideoSettingsStyle': styles.VideoSettings })
                    this.checkVideoCanplaythrough(await elementSelectors.video)
                    monitorTabActiveState.unsubscribe()
                }
            },
            immediate: true,
            checkInterval: 2000
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
        })
    },
    async checkVideoCanplaythrough (videoElement, emit = true) {
        const canplaythrough = await this.isVideoCanplaythrough(videoElement)
        if (canplaythrough) {
            if (emit) eventBus.emit('video:canplaythrough')
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
        selectPlayerModeStrategies.find(strategy => strategy.type === this.userConfigs.selected_player_mode)?.action()
        await sleep(350)
        if (this.userConfigs.selected_player_mode !== 'normal') {
            const video = await elementSelectors.video
            const success = await this.isPlayerModeSwitchSuccess(this.userConfigs.selected_player_mode, video)
            if (success) {
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
                eventBus.emit('video:playerModeSelected')
            }
        }
    },
    async isPlayerModeSwitchSuccess (selectedPlayerMode, videoElement) {
        const playerContainer = await elementSelectors.playerContainer
        await storageService.legacySet('player_offset_top', await getElementOffsetToDocument(playerContainer).top)
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
        insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
        if (this.userConfigs.webfull_unlock || this.userConfigs.player_type === 'web') {
            eventBus.emit('video:startOtherFunctions')
            return
        }
        if (!this.userConfigs.auto_locate) {
            logger.info('自动定位丨功能已关闭')
            eventBus.emit('video:startOtherFunctions')
            return
        }
        await sleep(300)
        await this.locateToPlayer()
        logger.info('自动定位丨成功')
        eventBus.emit('video:startOtherFunctions')
    },
    async locateToPlayer () {
        const playerContainer = await elementSelectors.query('playerContainer')
        const playerMode = playerContainer.getAttribute('data-screen')
        const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocument(playerContainer).top : this.userConfigs.player_offset_top
        const headerComputedStyle = getElementComputedStyle(await elementSelectors.headerMini, ['position', 'height'])
        // logger.debug(headerComputedStyle.position, headerComputedStyle.height)
        const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - parseInt(headerComputedStyle.height) : playerContainerOffsetTop
        documentScrollTo(playerOffsetTop - this.userConfigs.offset_top)
    },
    async clickPlayerAutoLocate () {
        if (!this.userConfigs.click_player_auto_locate) return
        addEventListenerToElement(await elementSelectors.video, 'click', async () => {
            await this.locateToPlayer()
        })
    },
    handleJumpToVideoTime (video, target) {
        const targetTime = target.dataset.videoTime
        if (targetTime > video.duration) alert('当前时间点大于视频总时长，将跳到视频结尾！')
        video.currentTime = targetTime
        video.play()
    },
    async clickVideoTimeAutoLocation () {
        const batchSelectors = ['video', 'videoCommentRoot']
        const [video, host] = await elementSelectors.batch(batchSelectors)
        const descriptionClickTargets = this.userConfigs.player_type === 'video' ? await shadowDOMHelper.querySelectorAll(host, shadowDomSelectors.descriptionVideoTime) : []
        if (descriptionClickTargets.length > 0) {
            descriptionClickTargets.forEach(target => {
                addEventListenerToElement(target, 'click', async event => {
                    event.stopPropagation()
                    await this.locateToPlayer()
                    this.handleJumpToVideoTime(video, target)
                })
            })
        }
    },
    async doSomethingToCommentElements () {
        const batchSelectors = ['video', 'videoCommentRoot']
        const [video, host] = await elementSelectors.batch(batchSelectors)
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
        const handleVideoTimeElements = host => {
            const videoTimeElements = shadowDOMHelper.batchQuery(host, {
                videoTime: shadowDomSelectors.videoTime,
                replyVideoTime: shadowDomSelectors.replyVideoTime
            })
            videoTimeElements.forEach(element => {
                addEventListenerToElement(element, 'click', async event => {
                    event.stopPropagation()
                    await this.locateToPlayer()
                    this.handleJumpToVideoTime(video, element)
                })
            })
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
                    handleVideoTimeElements(item)
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
                    scanInterval: 1000
                }
            )
        }
    },
    async autoSelectVideoHighestQuality () {
        if (!this.userConfigs.auto_select_video_highest_quality) return
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
        const qualityList = Array.from(await elementSelectors.queryAll('qualitySwitchButtons'))
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
            if (this.userConfigs.contain_quality8k && q.value === 127) return true
            if (this.userConfigs.contain_quality4k && q.value === 120) return true
            return q.value < 120
        })
        // logger.debug(qualityList, availableQualities, targetQuality)
        if (targetQuality) {
            targetQuality.element.click()
            logger.info(`最高画质｜${this.userConfigs.is_vip ? 'VIP' : '非VIP'}｜${qualityMap[targetQuality.value] || targetQuality.value
            }｜切换成功`)
        }
    },
    async autoCancelMute () {
        if (!this.userConfigs.auto_cancel_mute) return
        const batchSelectors = ['mutedButton', 'volumeButton']
        const [mutedButton, volumeButton] = await elementSelectors.batch(batchSelectors)
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
        if (!switchSubtitleButton) return
        const enableStatus = switchSubtitleButton.children[0].children[0].children[0].children[1].childElementCount === 1
        if (!enableStatus) {
            switchSubtitleButton.children[0].children[0].click()
            logger.info('视频字幕丨已开启')
        }
    },
    async insertAutoEnableSubtitleSwitchButton () {
        const [playerDanmuSetting, playerTooltipArea, AutoSubtitle] = await elementSelectors.batch(['playerDanmuSetting', 'playerTooltipArea', 'AutoSubtitle'])
        const autoEnableSubtitleSwitchButton = createElementAndInsert(getTemplates.replace('autoEnableSubtitleSwitchButton', {
            autoSubtitle: this.userConfigs.auto_subtitle
        }), playerDanmuSetting, 'after')
        const autoEnableSubtitleTip = createElementAndInsert(getTemplates.replace('autoEnableSubtitleSwitchButtonTip', {
            autoEnableSubtitleSwitchButtonTipText: this.userConfigs.auto_subtitle ? '关闭自动开启字幕' : '开启自动开启字幕'
        }), playerTooltipArea, 'append')
        const [AutoEnableSubtitleSwitchInput, AutoEnableSubtitleTooltipTitle] = await elementSelectors.batch(['AutoEnableSubtitleSwitchInput', 'AutoEnableSubtitleTooltipTitle'])
        initializeCheckbox(AutoEnableSubtitleSwitchInput, this.userConfigs, 'auto_subtitle')
        addEventListenerToElement(AutoEnableSubtitleSwitchInput, 'change', async e => {
            const isChecked = e.target.checked
            await storageService.legacySet('auto_subtitle', Boolean(isChecked))
            AutoEnableSubtitleSwitchInput.checked = isChecked
            AutoSubtitle.checked = isChecked
            AutoEnableSubtitleSwitchInput.setAttribute('checked', isChecked.toString())
            AutoSubtitle.setAttribute('checked', isChecked.toString())
            AutoEnableSubtitleTooltipTitle.innerText = isChecked ? '关闭自动开启字幕' : '开启自动开启字幕'
        })
        addEventListenerToElement(autoEnableSubtitleSwitchButton, 'mouseover', () => {
            showPlayerTooltip(autoEnableSubtitleSwitchButton, autoEnableSubtitleTip)
        })
        addEventListenerToElement(autoEnableSubtitleSwitchButton, 'mouseout', () => {
            hidePlayerTooltip(autoEnableSubtitleTip)
        })
    },
    async insertSideFloatNavToolsButtons () {
        const floatNav = this.userConfigs.player_type === 'video' ? await elementSelectors.videoFloatNav : await elementSelectors.bangumiFloatNav
        const dataV = floatNav.lastChild.attributes[1].name
        let locateButton, videoSettingsOpenButton
        if (this.userConfigs.player_type === 'video') {
            locateButton = createElementAndInsert(getTemplates.replace('videoLocateButton', { dataV: dataV }), floatNav.lastChild, 'prepend')
            videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', { dataV: dataV }), floatNav.lastChild, 'prepend')
        }
        if (this.userConfigs.player_type === 'bangumi') {
            const floatNavMenuItemClass = floatNav.lastChild.lastChild.getAttribute('class')
            locateButton = createElementAndInsert(getTemplates.replace('bangumiLocateButton', { floatNavMenuItemClass: floatNavMenuItemClass }), floatNav.lastChild, 'before')
        }
        addEventListenerToElement(locateButton, 'click', async () => {
            await this.locateToPlayer()
        })
        addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
            const VideoSettingsPopover = await elementSelectors.VideoSettingsPopover
            VideoSettingsPopover.showPopover()
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
        const batchSelectors = ['videoDescription', 'videoDescriptionInfo', 'videoCommentRoot']
        const [videoDescription, videoDescriptionInfo, host] = await elementSelectors.batch(batchSelectors)
        const checkAndTrigger = setInterval(async () => {
            const baseURI = videoDescriptionInfo.baseURI
            if (baseURI === location.href){
                clearInterval(checkAndTrigger)
                const adjustmentCommentDescription = await elementSelectors.query('adjustmentCommentDescription')
                adjustmentCommentDescription?.remove()
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
                    const videoDescriptionInfo = await elementSelectors.videoDescriptionInfo
                    videoDescriptionInfo.innerHTML = this.processVideoCommentDescriptionHtml(videoDescriptionInfo.innerHTML)
                    logger.info('视频简介丨已替换')
                }
            }
        }, 300)
        // logger.debug(`描述插入耗时：${(performance.now() - perfStart).toFixed(1)}ms`)
    },
    async unlockEpisodeSelector () {
        const videoInfo = await biliApis.getVideoInformation(biliApis.getCurrentVideoID(window.location.href))
        const { pages = false, ugc_season = false } = videoInfo.data
        if (ugc_season || pages.length > 1) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': styles.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    await this.locateToPlayer()
                })
            })
        }
    },
    async webfullPlayerModeUnlock () {
        if (!this.userConfigs.webfull_unlock || this.userConfigs.selected_player_mode !== 'web' || this.userConfigs.player_type === 'bangumi') return
        const batchSelectors = [
            'app',
            'playerWrap',
            'player',
            'playerWebscreen',
            'playerModeWideEnterButton',
            'playerModeWideLeaveButton',
            'playerModeWebEnterButton',
            'playerModeWebLeaveButton',
            'playerModeFullControlButton'
        ]
        const [app, playerWrap, player, playerWebscreen, wideEnterButton, wideLeaveButton, webEnterButton, webLeaveButton, fullControlButton] = await elementSelectors.batch(batchSelectors)
        const resetPlayerLayout = async () => {
            insertStyleToDocument({
                'UnlockWebPlayerStyle': styles.UnlockWebPlayer,
                'ResetPlayerLayoutStyle': styles.ResetPlayerLayout
            })
            playerWrap.append(player)
            await storageService.set('current_player_mode', 'wide')
            await this.locateToPlayer()
        }
        insertStyleToDocument({ 'UnlockWebPlayerStyle': styles.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
        app.prepend(playerWebscreen)
        addEventListenerToElement([webLeaveButton, wideEnterButton, wideLeaveButton, fullControlButton], 'click', async () => {
            await sleep(100)
            await resetPlayerLayout()
        })
        addEventListenerToElement(webEnterButton, 'click', async () => {
            const UnlockWebPlayerStyle = elementSelectors.UnlockWebPlayerStyle
            if (!UnlockWebPlayerStyle) insertStyleToDocument({ 'UnlockWebPlayerStyle': styles.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
            app.prepend(playerWebscreen)
            await this.locateToPlayer()
        })
        logger.info('网页全屏丨已解锁')
        eventBus.emit('video:webfullPlayerModeUnlock')
    },
    async insertLocateToCommentButton (){
        if (!this.userConfigs.webfull_unlock || this.userConfigs.player_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo(await getElementOffsetToDocument(videoComment).top - 10)
        })
    },
    async handleHrefChangedFunctionsSequentially (){
        this.locateToPlayer()
        const hrefChangeFunctions = [
            this.insertVideoDescriptionToComment,
            this.clickVideoTimeAutoLocation,
            this.doSomethingToCommentElements,
            this.unlockEpisodeSelector
        ]
        const videoCanplaythrough = await this.checkVideoCanplaythrough(await elementSelectors.video, false)
        if (videoCanplaythrough) {
            executeFunctionsSequentially(hrefChangeFunctions)
        }
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.webfullPlayerModeUnlock,
            this.clickPlayerAutoLocate,
            this.autoSelectVideoHighestQuality,
            this.autoCancelMute,
            this.insertVideoDescriptionToComment,
            this.insertSideFloatNavToolsButtons,
            this.clickVideoTimeAutoLocation,
            this.unlockEpisodeSelector,
            this.autoEnableSubtitle,
            this.insertAutoEnableSubtitleSwitchButton,
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(functions)
    }
}
