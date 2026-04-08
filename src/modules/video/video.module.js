/* global ,_ */
import { ShadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponent } from '@/components/settings.component'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { sleep, isElementSizeChange, documentScrollTo, getElementOffsetToDocument, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially, isTabActive, monitorHrefChange, createElementAndInsert, insertStyleToDocument, getBodyHeight, initializeCheckbox, showPlayerTooltip, hidePlayerTooltip } from '@/utils/common'
import { biliApis } from '@/shared/biliApis'
import { styles } from '@/shared/styles'
import { formatVideoCommentDescription, formatVideoCommentContents } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { aiService, initializeAIService } from '@/services/ai.service'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponent()
const shadowDOMHelper = new ShadowDOMHelper()

// 跟踪广告识别函数的执行状态
let advertisementIdentified = false
export default {
    name: 'video',
    version: '3.3.0',
    async install () {
        insertStyleToDocument({ 'BodyOverflowHiddenStyle': styles.BodyOverflowHidden })
        eventBus.on('app:ready', async () => {
            logger.info('视频模块｜已加载')
            await this.preFunctions()
        })
    },
    async preFunctions () {
        await storageService.userSet('page_type', location.pathname.startsWith('/video/') ? 'video' : 'bangumi')
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
        eventBus.on('video:canplaythrough', _.debounce(this.autoSelectPlayerMode, { 'leading': true, 'trailing': false }))
        eventBus.on('video:playerModeSelected', _.debounce(this.autoLocateToPlayer, { 'leading': true, 'trailing': false }))
        eventBus.once('video:startOtherFunctions', _.debounce(this.handleExecuteFunctionsSequentially, 500, { 'leading': true, 'trailing': false }))
        eventBus.once('video:webfullPlayerModeUnlock', _.debounce(this.insertLocateToCommentButton, 500, { 'leading': true, 'trailing': false }))
    },
    async registSettings (){
        await settingsComponent.init(this.userConfigs)
    },
    initMonitors () {
        monitorHrefChange( async () => {
            logger.debug('视频资源丨链接已改变')
            this.handleHrefChangedFunctionsSequentially()
        })
        isTabActive({
            onActiveChange: async isActive => {
                if (isActive) {
                    logger.info('标签页｜已激活')
                    insertStyleToDocument({ 'VideoPageAdjustmentStyle': styles.VideoPageAdjustment, 'VideoSettingsStyle': styles.VideoSettings })
                    this.checkVideoCanplaythrough(await elementSelectors.video)
                }
            },
            immediate: true,
            checkInterval: 10,
            once: true
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
            if (emit) {
                eventBus.emit('video:canplaythrough')
                logger.info('视频资源｜可以播放')
            }
            return true
        }
    },
    async autoSelectPlayerMode () {
        // 先判断当前播放器模式是否已经是用户设置的模式
        const playerContainer = await elementSelectors.playerContainer
        const currentPlayerMode = playerContainer.getAttribute('data-screen')
        
        if (currentPlayerMode === this.userConfigs.selected_player_mode) {
            logger.debug(`屏幕模式丨当前已是${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : this.userConfigs.selected_player_mode === 'web' ? '网页全屏' : '正常'}模式，跳过切换`)
            eventBus.emit('video:playerModeSelected')
            return
        }
        
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
        await storageService.userSet('player_offset_top', await getElementOffsetToDocument(playerContainer).top)
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
        if (this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'web') {
            eventBus.emit('video:startOtherFunctions')
            return
        }
        if (!this.userConfigs.auto_locate) {
            logger.info('自动定位丨功能已关闭')
            eventBus.emit('video:startOtherFunctions')
            return
        }
        
        // 先判断当前页面是否已经定位到了播放器位置
        const playerContainer = await elementSelectors.playerContainer
        const playerMode = playerContainer.getAttribute('data-screen')
        const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocument(playerContainer).top : this.userConfigs.player_offset_top
        const headerComputedStyle = getElementComputedStyle(await elementSelectors.headerMini, ['position', 'height'])
        const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - parseInt(headerComputedStyle.height) : playerContainerOffsetTop
        const targetOffset = playerOffsetTop - this.userConfigs.offset_top
        const currentScrollTop = window.scrollY
        
        // 允许一定的误差范围（50px）
        if (Math.abs(currentScrollTop - targetOffset) < 50) {
            logger.debug('自动定位丨当前已在播放器位置附近，跳过定位')
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
        addEventListenerToElement(await elementSelectors.video, 'click', async () => {
            await this.locateToPlayer()
        })
    },
    handleJumpToVideoTime (video, target) {
        const targetTime = target.dataset.videoTime
        targetTime > video.duration && alert('当前时间点大于视频总时长，将跳到视频结尾！')
        video.currentTime = targetTime
        video.play()
    },
    // 显示评论IP属地
    showLocation (host, location) {
        try {
            const existingLocation = shadowDOMHelper.queryDescendant(host, '#location')
            if (existingLocation) return
            const locationWrapperHtml = `<div id="location" style="margin-left:5px">${location}</div>`
            const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.value('videoReplyPubDate'))
            createElementAndInsert(locationWrapperHtml, pubdate, 'after')
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
        contents.innerHTML = formatVideoCommentContents(contents)
    },
    
    // 处理评论元素
    async doSomethingToCommentElements () {
        const video = await elementSelectors.video
        shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, root => {
            if (root){
                shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_location){
                        this.showLocation(renderder, renderder.data.reply_control.location ?? 'IP属地：未知')
                    }
                    if (this.userConfigs.remove_comment_tags){
                        this.removeCommentTagElements(renderder)
                    }
                }, root)
                shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
                    this.formatCommentContents(renderder)
                    this.activeTimeSeek(renderder, video)
                    if (this.userConfigs.show_location){
                        this.showLocation(renderder, renderder.data.reply_control.location ?? 'IP属地：未知')
                    }
                }, root)
            }
        })
    },
    async autoSelectVideoHighestQuality () {
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
        if (this.userConfigs.auto_subtitle) {
            const switchSubtitleButton = await elementSelectors.switchSubtitleButton
            if (!switchSubtitleButton) return
            const subtitleLanguageChineseAI = await elementSelectors.subtitleLanguageChineseAI
            subtitleLanguageChineseAI.click()
            if (subtitleLanguageChineseAI.classList.contains('bpx-state-active')) {
                logger.info('视频字幕（中文AI）丨已开启')
            }
        }
    },
    async insertAutoEnableSubtitleSwitchButton () {
        const [playerDanmuSetting, playerTooltipArea, AutoSubtitle] = await elementSelectors.batch(['playerDanmuSetting', 'playerTooltipArea', 'AutoSubtitle'])
        
        // 检查是否已经存在自动开启字幕的开关按钮
        const existingSwitchButton = document.getElementById('autoEnableSubtitleSwitchButton')
        const existingTip = document.getElementById('autoEnableSubtitleTip')
        
        if (existingSwitchButton && existingTip) {
            logger.debug('自动开启字幕开关丨已存在，跳过插入')
            return
        }
        
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
            await storageService.userSet('auto_subtitle', Boolean(isChecked))
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
        const floatNav = this.userConfigs.page_type === 'video' ? await elementSelectors.videoFloatNav : await elementSelectors.bangumiFloatNav
        const dataV = this.userConfigs.page_type === 'video' ? floatNav.lastElementChild.attributes[1].name : ''
        
        // 检查是否已经存在定位按钮和设置按钮
        const existingLocateButton = floatNav.querySelector('.bili-adjustment-icon.locate')
        const existingSettingsButton = floatNav.querySelector('.bili-adjustment-icon.settings')
        
        if (existingLocateButton && existingSettingsButton) {
            logger.debug('侧边栏工具丨已存在，跳过插入')
            return
        }
        
        let locateButton, videoSettingsOpenButton
        if (this.userConfigs.page_type === 'video') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    style: '',
                    dataV: dataV,
                    text: '定位'
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(locateButton, 'click', async () => {
                    await this.locateToPlayer()
                })
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', {
                    dataV: dataV,
                    floatNavMenuItemClass: '',
                    text: '设置'
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    const VideoSettingsPopover = await elementSelectors.VideoSettingsPopover
                    VideoSettingsPopover.showPopover()
                })
            }
        }
        if (this.userConfigs.page_type === 'bangumi') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'bili-adjustment-icon locate',
                    style: `style="height:40px;padding:0;${styles.videoSettingsOpenButton}"`,
                    dataV: dataV,
                    text: ''
                }), floatNav, 'append')
                addEventListenerToElement(locateButton, 'click', async () => {
                    await this.locateToPlayer()
                })
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', {
                    floatNavMenuItemClass: '',
                    style: `style="${styles.videoSettingsOpenButton}"`,
                    dataV: '',
                    text: ''
                }), floatNav, 'append')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    const VideoSettingsPopover = await elementSelectors.VideoSettingsPopover
                    VideoSettingsPopover.showPopover()
                })
            }
        }
        logger.debug('侧边栏工具丨插入成功')
    },
    async insertVideoDescriptionToComment () {
        // const perfStart = performance.now()
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        const videoDescription = videoInfo.desc
        
        // 移除现有的视频简介元素
        shadowDOMHelper.querySelector(elementSelectors.value('adjustmentCommentDescription'))?.remove()
        
        const batchSelectors = ['videoDescription', 'videoDescriptionInfo', 'videoCommentRoot']
        const [videoDescriptionElement, videoDescriptionInfoElement] = await elementSelectors.batch(batchSelectors)
        const checkAndTrigger = setInterval(async () => {
            const baseURI = videoDescriptionInfoElement.baseURI
            if (baseURI === location.href){
                clearInterval(checkAndTrigger)
                
                // 再次移除现有的视频简介元素，确保不会重复
                const adjustmentCommentDescription = await elementSelectors.query('adjustmentCommentDescription')
                adjustmentCommentDescription?.remove()
                
                const videoCommentReplyListShadowRoot = shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
                if (videoDescriptionElement.childElementCount > 1 && videoDescriptionInfoElement.childElementCount > 0) {
                    const upAvatarFaceLink = '//www.asifadeaway.com/Stylish/bilibili/avatar-description.png'
                    const template = document.createElement('template')
                    template.innerHTML = getTemplates.replace('shadowRootVideoDescriptionReply', {
                        videoCommentDescription: styles.videoCommentDescription,
                        upAvatarFaceLink: upAvatarFaceLink,
                        processVideoCommentDescription: formatVideoCommentDescription(videoDescription, videoInfo.desc_v2)
                    })
                    const clone = template.content.cloneNode(true)
                    videoCommentReplyListShadowRoot?.prepend(clone)
                    if (shadowDOMHelper.querySelector(shadowDomSelectors.descriptionRenderer)) {
                        logger.debug('视频简介丨已插入')
                    } else {
                        this.insertVideoDescriptionToComment()
                    }
                } else {
                    const videoDescriptionElement = await elementSelectors.videoDescriptionInfo
                    videoDescriptionElement.innerHTML = formatVideoCommentDescription(videoDescription, videoInfo.desc_v2)
                    logger.debug('视频简介丨已替换')
                }
            }
        }, 300)
        // logger.debug(`描述插入耗时：${(performance.now() - perfStart).toFixed(1)}ms`)
    },
    async unlockEpisodeSelector () {
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        const { pages = false, ugc_season = false, episodes = false } = videoInfo
        if (pages || ugc_season || episodes) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': styles.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    await this.locateToPlayer()
                })
            })
        }
    },
    // 重置播放器布局
    async resetPlayerLayout (playerWrap, player) {
        insertStyleToDocument({
            'UnlockWebPlayerStyle': styles.UnlockWebPlayer,
            'ResetPlayerLayoutStyle': styles.ResetPlayerLayout
        })
        playerWrap.append(player)
        await storageService.set('current_player_mode', 'wide')
        await this.locateToPlayer()
    },
    
    // 解锁网页全屏模式
    async webfullPlayerModeUnlock () {
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
        
        // 插入解锁样式
        insertStyleToDocument({ 'UnlockWebPlayerStyle': styles.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
        app.prepend(playerWebscreen)
        
        // 监听模式切换按钮
        addEventListenerToElement([webLeaveButton, wideEnterButton, wideLeaveButton, fullControlButton], 'click', async () => {
            await sleep(100)
            await this.resetPlayerLayout(playerWrap, player)
        })
        
        // 监听网页全屏进入按钮
        addEventListenerToElement(webEnterButton, 'click', async () => {
            const UnlockWebPlayerStyle = elementSelectors.UnlockWebPlayerStyle
            !UnlockWebPlayerStyle && insertStyleToDocument({ 'UnlockWebPlayerStyle': styles.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
            app.prepend(playerWebscreen)
            await this.locateToPlayer()
        })
        
        logger.info('网页全屏丨已解锁')
        eventBus.emit('video:webfullPlayerModeUnlock')
    },
    async insertLocateToCommentButton (){
        if (!this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo(await getElementOffsetToDocument(videoComment).top - 10)
        })
    },
    async handleVideoPauseOnTabSwitch () {
        const video = await elementSelectors.video
        let playFlag = false
        const tabState = isTabActive({
            onActiveChange: async isActive => {
                if (!isActive) {
                    video.pause()
                    playFlag = true
                } else if (this.userConfigs.continue_play && playFlag) {
                    video.play()
                    playFlag = false
                }
            },
            checkInterval: 100
        })
        return () => {
            tabState.unsubscribe()
        }
    },
    async autoEnableHiResMode (){
        // const highResButton = await elementSelectors.highResButton
        const highResButton = await elementSelectors.query('highResButton')
        if (highResButton && !highResButton.className.includes('bpx-state-active')){
            highResButton.click()
            logger.info('Hi-Res无损音质丨已启用')
        }
    },
    async identifyAdvertisementTimestamps () {
        // 检查自动跳广告开关是否开启
        if (!this.userConfigs.auto_skip) {
            logger.info('自动跳过广告丨功能已关闭')
            return
        }
        
        // 检查是否已经执行过广告识别
        if (advertisementIdentified) {
            logger.debug('自动跳过广告丨已执行过，跳过重复执行')
            return
        }
        
        // 标记广告识别已执行
        advertisementIdentified = true
        
        // 30秒后重置广告识别状态，以便在视频切换时重新执行
        setTimeout(() => {
            advertisementIdentified = false
        }, 30000)
        
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        const cid = videoInfo.cid
        const up_mid = videoInfo.owner.mid
        const subtitle = await biliApis.getVideoSubtitle(bvid, cid, up_mid)
        // logger.info('获取视频字幕', subtitle)
        if (!subtitle || subtitle.length === 0) {
            return
        }
        const subtitlesJsonString = JSON.stringify(subtitle)
        // 初始化AI服务
        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            // logger.info('广告时间戳识别结果:', timestamps)
            // 调用自动跳过广告函数
            this.autoSkipAdvertisementSegments(timestamps)
            return timestamps
        } catch (error) {
            logger.error('AI服务初始化或广告识别失败:', error)
            logger.warn('自动跳过广告功能暂时不可用，请检查AI服务配置')
            return []
        }
    },
    async autoSkipAdvertisementSegments (advertisementSegments) {
        if (!advertisementSegments || advertisementSegments.length === 0) {
            logger.info('自动跳过广告丨无广告时间段落，功能已关闭')
            return
        }
        const video = await elementSelectors.video
        if (!video) return
        // 按start时间升序排序，确保正确处理多个广告时间段
        const sortedSegments = [...advertisementSegments].sort((a, b) => a.start - b.start)
        const processedSegments = new Set()
        const handleTimeUpdate = () => {
            const currentTime = Math.floor(video.currentTime)
            // 遍历所有广告时间段，检查是否需要跳转
            for (const segment of sortedSegments) {
                const { start, end } = segment
                const segmentKey = `${start}-${end}`
                // 只处理未处理过的时间段
                if (!processedSegments.has(segmentKey)) {
                    // 当播放到start时间时，跳转到end时间
                    if (currentTime === start) {
                        logger.info(`自动跳过广告丨从 ${start}s 跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                    // 如果当前时间已经在广告时间段内，直接跳转到end时间
                    if (currentTime > start && currentTime < end) {
                        logger.info(`自动跳过广告丨当前在广告时间段 ${start}s-${end}s 内，跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                }
            }
            // 当所有广告都处理完后，移除事件监听器
            if (processedSegments.size === sortedSegments.length) {
                video.removeEventListener('timeupdate', handleTimeUpdate)
                logger.info('自动跳过广告丨所有广告已处理完成，移除事件监听器')
            }
        }
        // 添加事件监听器
        video.addEventListener('timeupdate', handleTimeUpdate)
        logger.info('自动跳过广告丨已启动，共检测到', sortedSegments.length, '个广告时间段', sortedSegments)
        // 初始检查，处理当前时间已经在广告时间段内的情况
        handleTimeUpdate()
    },
    async handleHrefChangedFunctionsSequentially (){
        this.userConfigs.page_type === 'bangumi' && await sleep(50)
        this.locateToPlayer()
        const hrefChangeFunctions = [
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip)],
            [this.insertVideoDescriptionToComment, Boolean(this.userConfigs.insert_video_description_to_comment && this.userConfigs.page_type === 'video')],
            this.doSomethingToCommentElements,
            this.unlockEpisodeSelector
        ]
        const videoCanplaythrough = await this.checkVideoCanplaythrough(await elementSelectors.video, false)
        videoCanplaythrough && executeFunctionsSequentially(hrefChangeFunctions)
        this.autoEnableSubtitle(Boolean(this.userConfigs.auto_subtitle))
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.insertSideFloatNavToolsButtons,
            [this.clickPlayerAutoLocate, Boolean(this.userConfigs.click_player_auto_locate)],
            [this.autoCancelMute, Boolean(this.userConfigs.auto_subtitle)],
            this.unlockEpisodeSelector,
            [this.autoEnableHiResMode, Boolean(this.userConfigs.is_vip && this.userConfigs.auto_hi_res)],
            [this.autoSelectVideoHighestQuality, Boolean(this.userConfigs.auto_select_video_highest_quality)],
            [this.webfullPlayerModeUnlock, Boolean(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && this.userConfigs.page_type === 'video')],
            this.insertAutoEnableSubtitleSwitchButton,
            [this.handleVideoPauseOnTabSwitch, Boolean(this.userConfigs.pause_video)],
            [this.insertVideoDescriptionToComment, Boolean(this.userConfigs.insert_video_description_to_comment && this.userConfigs.page_type === 'video')],
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip)],
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(functions)
        this.autoEnableSubtitle()
    }
}
