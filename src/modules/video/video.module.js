/* global _ */
import { ShadowDOMHelper } from '@/utils/shadowDOMHelper'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponentV2 } from '@/components/settings.component.v2'
import { destroyTooltip } from '@/components/tooltip.component'
import { shadowDomSelectors, elementSelectors } from '@/shared/element-selectors'
import { sleep, isElementSizeChange, documentScrollTo, getElementOffsetToDocument, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially, isTabActive, monitorHrefChange, createElementAndInsert, insertStyleToDocument, getBodyHeight, showPlayerTooltip, hidePlayerTooltip, initializeCheckbox } from '@/utils/common'
import { biliApis } from '@/shared/biliApis'
import { stylesV2 } from '@/shared/styles'
import { formatVideoCommentDescription, formatVideoCommentContents } from '@/shared/regexps'
import { getTemplates } from '@/shared/templates'
import { aiService, initializeAIService } from '@/services/ai.service'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponentV2()
const shadowDOMHelper = new ShadowDOMHelper()
// 跟踪广告识别函数的执行状态
let advertisementIdentified = false
// 视频简介插入评论区功能的 MutationObserver 实例
let videoDescriptionObserver = null
// 播放进度记忆（官方进度记忆失效时的兜底）
const PLAYBACK_STORE_KEY = 'bili_adjustment_playback_progress'
const PLAYBACK_STORE_LIMIT = 50
export default {
    name: 'video',
    version: '3.17.5',
    async install () {
        this._cleanup = []
        this._modeObservers = []
        this.initSubtitleStateMemory()
        insertStyleToDocument({ 'BodyOverflowHiddenStyle': stylesV2.BodyOverflowHidden })
        this._cleanup.push(eventBus.on('app:ready', async () => {
            logger.info('视频模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall () {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        this._remoteConfigSyncUnsubscribe?.()
        this._remoteConfigSyncUnsubscribe = null
        if (videoDescriptionObserver) {
            videoDescriptionObserver.disconnect()
            videoDescriptionObserver = null
        }
        insertStyleToDocument({
            'BodyOverflowHiddenStyle': '',
            'VideoPageAdjustmentStyle': '',
            'VideoSettingsStyle': '',
            'UnlockWebPlayerStyle': '',
            'UnlockEpisodeSelectorStyle': ''
        })
        document.body.classList.remove('webscreen-fix')
        destroyTooltip()
        document.querySelectorAll('[bilibili-adjustment-element]').forEach(element => element.remove())
        this._modeObservers?.forEach(observer => observer.disconnect())
        this._modeObservers = []
        this._fullscreenHandler && document.removeEventListener('fullscreenchange', this._fullscreenHandler)
        this._videoRotateFullscreenHandler && document.removeEventListener('fullscreenchange', this._videoRotateFullscreenHandler)
        this._videoRotateVideo?.removeEventListener('contextmenu', this._videoRotateContextHandler)
        if (this._adVideo && this._adTimeUpdateHandler) {
            this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
        }
        if (this._checkDescriptionInterval) clearInterval(this._checkDescriptionInterval)
        this._pauseVideoCleanup?.()
    },
    async preFunctions () {
        await storageService.userSet('page_type', location.pathname.startsWith('/bangumi/') ? 'bangumi' : 'video')
        await sleep(300)
        this.userConfigs = await storageService.getAll('user')
        await this.registSettings()
        await this.initEventListeners()
        this.initMonitors()
        this.initRemoteConfigSync()
        this.initPlaybackMemory()
    },
    // 跨标签页配置同步：其他标签页修改设置后，当前页立即应用可即时生效的行为
    initRemoteConfigSync () {
        if (this._remoteConfigSyncUnsubscribe) return
        this._remoteConfigSyncUnsubscribe = eventBus.on('config:changed', async (_, { key, value }) => {
            this.userConfigs[key] = value
            switch (key) {
                case 'auto_skip':
                    if (value) {
                        await this.identifyAdvertisementTimestamps()
                    } else if (this._adVideo && this._adTimeUpdateHandler) {
                        this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
                        this._adVideo = null
                        this._adTimeUpdateHandler = null
                        logger.info('自动跳过广告丨已关闭')
                    }
                    break
                case 'webfull_unlock':
                    if (value) {
                        await this.webfullPlayerModeUnlock()
                    } else {
                        const player = document.getElementById('bilibili-player')
                        if (player?.classList.contains('mode-webscreen') || document.body.classList.contains('webscreen-fix')) {
                            await this.resetPlayerLayout()
                        }
                    }
                    break
                case 'auto_subtitle':
                    if (value) await this.autoEnableSubtitle()
                    break
                case 'auto_cancel_mute':
                    if (value) await this.autoCancelMute()
                    break
                case 'auto_hi_res':
                    if (value) await this.autoEnableHiResMode()
                    break
                case 'playback_memory':
                    if (value) {
                        this.initPlaybackMemory()
                    } else {
                        this.destroyPlaybackMemory()
                    }
                    break
            }
        })
    },
    async initEventListeners () {
        this._cleanup.push(eventBus.on('logger:show', (_, { type, message }) => {
            logger[type]?.(message)
        }))
        this._cleanup.push(eventBus.on('video:canplaythrough', _.debounce(this.autoSelectPlayerMode, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.on('video:playerModeSelected', _.debounce(this.autoLocateToPlayer, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once('video:startOtherFunctions', _.debounce(this.handleExecuteFunctionsSequentially, 500, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once('video:webfullPlayerModeUnlock', _.debounce(this.insertLocateToCommentButton, 500, { 'leading': true, 'trailing': false })))
        this.autoReapplyUnlockOnFullscreenExit()
        // 监听播放器模式变化，记录用户手动切换的模式
        this._lastPlayerMode = this.userConfigs?.selected_player_mode || 'normal'
        elementSelectors.playerContainer.then(container => {
            if (!container) return
            const observer = new MutationObserver(() => {
                const mode = container.getAttribute('data-screen')
                if (mode && mode !== this._lastPlayerMode) {
                    this._lastPlayerMode = mode
                    sessionStorage.setItem('bili_last_player_mode', mode)
                    // 切回网页全屏时自动重新解锁
                    if (mode === 'web' && this.userConfigs?.webfull_unlock && this.userConfigs?.selected_player_mode === 'web') {
                        this.webfullPlayerModeUnlock()
                    }
                }
            })
            this._modeObservers.push(observer)
            observer.observe(container, { attributeFilter: ['data-screen']})
        })
    },
    async registSettings (){
        await settingsComponent.init(this.userConfigs)
    },
    initMonitors () {
        this._cleanup.push(monitorHrefChange(async () => {
            logger.debug('视频资源丨链接已改变')
            await this.handleHrefChangedFunctionsSequentially()
        }))
        this._cleanup.push(isTabActive({
            onActiveChange: async isActive => {
                if (isActive) {
                    logger.info('标签页｜已激活')
                    insertStyleToDocument({ 'VideoPageAdjustmentStyle': stylesV2.VideoPageAdjustment, 'VideoSettingsStyle': stylesV2.VideoSettings })
                    this.checkVideoCanplaythrough(await elementSelectors.video)
                }
            },
            immediate: true,
            checkInterval: 10,
            once: true
        }))
    },
    isVideoCanplaythrough (videoElement) {
        return new Promise(resolve => {
            if (!videoElement) {
                resolve(false)
                return
            }
            if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
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
        // 电影播放页若默认宽屏则跳过（电影页本身已宽屏，重复执行会退出宽屏）
        if (await this.hasPlayerTitle() && this.userConfigs.selected_player_mode === 'wide') {
            logger.debug('屏幕模式丨电影播放页且默认宽屏，跳过切换')
            eventBus.emit('video:playerModeSelected')
            return
        }
        // 若用户手动切换过播放器模式且开启了保持功能，跳过切换
        if (this.userConfigs.preserve_player_mode && this._lastPlayerMode && this._lastPlayerMode !== this.userConfigs.selected_player_mode) {
            const enabledModes = []
            if (this.userConfigs.preserve_mode_wide) enabledModes.push('wide')
            if (this.userConfigs.preserve_mode_web) enabledModes.push('web')
            if (this.userConfigs.preserve_mode_full) enabledModes.push('full')
            if (enabledModes.includes(this._lastPlayerMode)) {
                logger.debug(`屏幕模式丨${this._lastPlayerMode}模式已保持`)
                eventBus.emit('video:playerModeSelected')
                return
            }
        }
        // 切换冷却期：3秒内不重复切换，防止 B 站 player 重初始化重复触发
        if (this._modeSwitchCooldown && Date.now() - this._modeSwitchCooldown < 3000) {
            logger.debug('屏幕模式丨切换冷却中，跳过')
            eventBus.emit('video:playerModeSelected')
            return
        }
        // 先判断当前播放器模式是否已经是用户设置的模式
        const playerContainer = await elementSelectors.playerContainer
        if (!playerContainer) {
            eventBus.emit('video:playerModeSelected')
            return
        }
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
                    playerModeWideEnterButton?.click()
                }
            },
            {
                type: 'web',
                action: async () => {
                    const playerModeWebEnterButton = await elementSelectors.playerModeWebEnterButton
                    playerModeWebEnterButton?.click()
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
                this._modeSwitchCooldown = Date.now()
                sessionStorage.setItem('bili_mode_cooldown', String(this._modeSwitchCooldown))
                sessionStorage.setItem('bili_last_player_mode', this.userConfigs.selected_player_mode)
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
                eventBus.emit('video:playerModeSelected')
            }
        }
    },
    async isPlayerModeSwitchSuccess (selectedPlayerMode, videoElement) {
        const playerContainer = await elementSelectors.playerContainer
        if (!playerContainer) return false
        await storageService.userSet('player_offset_top', await getElementOffsetToDocument(playerContainer).top)
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        return new Promise(resolve => {
            let settled = false
            const finish = success => {
                if (settled) return
                settled = true
                observer?.disconnect()
                clearTimeout(timeoutId)
                resolve(success)
            }
            const observer = videoElement ? isElementSizeChange(videoElement, () => {
                if (playerContainer.getAttribute('data-screen') === selectedPlayerMode) finish(true)
            }) : null
            const timeoutId = setTimeout(() => finish(false), 3000)
            if (playerContainer.getAttribute('data-screen') === selectedPlayerMode) finish(true)
        })
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
        if (!playerContainer) {
            eventBus.emit('video:startOtherFunctions')
            return
        }
        const playerMode = playerContainer.getAttribute('data-screen')
        const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocument(playerContainer).top : this.userConfigs.player_offset_top
        const header = await elementSelectors.headerMini
        const headerComputedStyle = header ? getElementComputedStyle(header, ['position', 'height']) : {}
        const headerHeight = parseInt(headerComputedStyle.height, 10) || 0
        const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - headerHeight : playerContainerOffsetTop
        const targetOffset = playerOffsetTop - (Number(this.userConfigs.offset_top) || 0)
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
        if (!playerContainer) return
        const playerMode = playerContainer.getAttribute('data-screen')
        // 全屏模式下滚动无效，直接跳过
        if (playerMode === 'full') return
        const header = await elementSelectors.headerMini
        const headerComputedStyle = header ? getElementComputedStyle(header, ['position', 'height']) : {}
        const headerHeight = parseInt(headerComputedStyle.height, 10) || 0
        const headerFixed = headerComputedStyle.position === 'fixed'
        const offsetTop = Number(this.userConfigs.offset_top) || 0
        const computeTarget = container => {
            const playerContainerOffsetTop = container.getAttribute('data-screen') !== 'mini' ? getElementOffsetToDocument(container).top : this.userConfigs.player_offset_top
            return headerFixed ? playerContainerOffsetTop - headerHeight - offsetTop : playerContainerOffsetTop - offsetTop
        }
        let targetOffset = computeTarget(playerContainer)
        await documentScrollTo(targetOffset).catch(error => {
            logger.warn('自动定位丨滚动失败:', error.message)
        })
        // SPA 切换视频时页面布局可能尚未稳定，滚动后校验播放器实际位置，偏差过大时重新定位
        for (let attempt = 0; attempt < 2; attempt++) {
            await sleep(300)
            const freshContainer = await elementSelectors.query('playerContainer')
            if (!freshContainer || freshContainer.getAttribute('data-screen') === 'full') return
            const freshTarget = computeTarget(freshContainer)
            // 播放器位置未变且已滚动到位，无需处理
            if (Math.abs(freshTarget - targetOffset) <= 5 && Math.abs(window.scrollY - targetOffset) <= 5) return
            targetOffset = freshTarget
            logger.debug(`自动定位丨重新定位: ${targetOffset}（当前位置 ${window.scrollY}）`)
            await documentScrollTo(targetOffset).catch(error => {
                logger.warn('自动定位丨重新定位失败:', error.message)
            })
        }
    },
    async clickPlayerAutoLocate () {
        addEventListenerToElement(await elementSelectors.playerContainer, 'click', async e => {
            if (e.target.closest('.bpx-player-ctrl-bottom') || e.target.closest('.bpx-player-ctrl-top')) {
                return
            }
            await this.locateToPlayer()
        })
    },
    handleJumpToVideoTime (video, target) {
        const targetTime = Number(target.dataset.videoTime)
        if (!Number.isFinite(targetTime) || targetTime < 0) return
        if (targetTime > video.duration) {
            alert('当前时间点大于视频总时长，将跳到视频结尾！')
            video.currentTime = video.duration
        } else {
            video.currentTime = targetTime
        }
        video.play().catch(() => {})
    },
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
    initSubtitleStateMemory () {
        // tab 会话级记忆：用户手动操作字幕菜单时记录开关状态，切换选集/视频时据此决定是否跳过自动开启
        this._lastSubtitleState = sessionStorage.getItem('bili_last_subtitle_state') || null
        this._subtitleUserClickHandler = event => {
            if (!event.target?.closest?.('[data-lan], [data-action="close"], [aria-label="字幕"]')) return
            setTimeout(() => {
                elementSelectors.subtitleLanguageChineseAI.then(el => {
                    if (!el) return
                    this._lastSubtitleState = el.classList.contains('bpx-state-active') ? 'on' : 'off'
                    sessionStorage.setItem('bili_last_subtitle_state', this._lastSubtitleState)
                    logger.debug(`视频字幕丨已记忆字幕开关状态: ${this._lastSubtitleState === 'on' ? '开启' : '关闭'}`)
                })
            }, 250)
        }
        // 捕获阶段监听：B站 字幕菜单项可能在播放器内部多层嵌套，捕获阶段确保命中任意字幕语言项
        document.addEventListener('click', this._subtitleUserClickHandler, true)
        this._cleanup.push(() => document.removeEventListener('click', this._subtitleUserClickHandler, true))
    },
    async autoEnableSubtitle () {
        if (this.userConfigs.auto_subtitle) {
            const switchSubtitleButton = await elementSelectors.switchSubtitleButton
            if (!switchSubtitleButton) return
            const subtitleLanguageChineseAI = await elementSelectors.subtitleLanguageChineseAI
            if (!subtitleLanguageChineseAI) {
                logger.warn('视频字幕（中文AI）丨未找到字幕按钮，可能页面结构已变更')
                return
            }
            // 记忆保持：用户手动关闭过字幕时，切换选集/视频不再自动重新开启
            if (this.userConfigs.preserve_subtitle_state && this._lastSubtitleState === 'off') {
                logger.debug('视频字幕（中文AI）丨用户已手动关闭，保持关闭状态，跳过自动开启')
                return
            }
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
            requestAnimationFrame(() => {
                AutoEnableSubtitleSwitchInput.checked = isChecked
                AutoEnableSubtitleSwitchInput.toggleAttribute('checked', isChecked)
                AutoEnableSubtitleTooltipTitle.innerText = isChecked ? '关闭自动开启字幕' : '开启自动开启字幕'
                if (AutoSubtitle) {
                    AutoSubtitle.checked = isChecked
                    AutoSubtitle.toggleAttribute('checked', isChecked)
                }
            })
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
        if (!floatNav) {
            logger.warn('侧边栏工具丨未找到浮动导航栏，跳过插入')
            return
        }
        const dataV = this.userConfigs.page_type === 'video' ? floatNav.lastElementChild?.attributes?.[1]?.name || '' : ''
        // 检查是否已经存在定位按钮和设置按钮
        const existingLocateButton = floatNav.querySelector('.bili-adjustment-icon.locate')
        const existingSettingsButton = floatNav.querySelector('.bili-adjustment-icon.settings')
        const existingUpButton = floatNav.querySelector('.bili-adjustment-icon.up')
        if (existingLocateButton && existingSettingsButton && existingUpButton) {
            logger.debug('侧边栏工具丨已存在，跳过插入')
            return
        }
        let locateButton, videoSettingsOpenButton, upButton
        if (this.userConfigs.page_type === 'video') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    style: '',
                    dataV: dataV,
                    text: '定位'
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(locateButton, 'click', async () => {
                    // 小窗关闭时临时开启，定位后再关闭
                    const miniOpenBtn = document.querySelector('.mini-player-window[title="点击打开迷你播放器"]')
                    const miniCloseBtn = document.querySelector('.mini-player-window[title="点击关闭迷你播放器"]')
                    if (miniOpenBtn && !miniCloseBtn) {
                        miniOpenBtn.click()
                        await sleep(50)
                        await this.locateToPlayer()
                        await sleep(50)
                        // 使用固定选择器关闭小窗（不依赖 B 站的 title 状态切换）
                        document.querySelector('#mirror-vdcon .mini-player-window.fixed-sidenav-storage-item')?.click()
                    } else {
                        await this.locateToPlayer()
                    }
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
            if (!existingUpButton && this.userConfigs.page_type === 'video') {
                upButton = createElementAndInsert(getTemplates.replace('upButton', {
                    style: '',
                    dataV: dataV,
                    text: ''
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(upButton, 'click', async () => {
                    const mid = this._cachedMid || (() => {
                        try {
                            const info = JSON.parse(sessionStorage.getItem('bilibili_video_info') || '{}')
                            return info.owner?.mid
                        } catch { /* 忽略解析失败 */ }
                    })()
                    if (mid) window.open(`https://space.bilibili.com/${mid}`, '_blank')
                })
                // 异步获取 mid 缓存
                biliApis.getVideoInformation('video', biliApis.getCurrentVideoID()).then(info => {
                    if (info?.owner?.mid) this._cachedMid = info.owner.mid
                }).catch(() => {})
            }
        }
        if (this.userConfigs.page_type === 'bangumi') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'bili-adjustment-icon locate',
                    style: `style="height:40px;padding:0;${stylesV2.videoSettingsOpenButton}"`,
                    dataV: dataV,
                    text: ''
                }), floatNav, 'append')
                addEventListenerToElement(locateButton, 'click', async () => {
                    const miniOpenBtn = document.querySelector('.mini-player-window[title="点击打开迷你播放器"]')
                    const miniCloseBtn = document.querySelector('.mini-player-window[title="点击关闭迷你播放器"]')
                    if (miniOpenBtn && !miniCloseBtn) {
                        miniOpenBtn.click()
                        await sleep(50)
                        await this.locateToPlayer()
                        await sleep(50)
                        document.querySelector('#mirror-vdcon .mini-player-window.fixed-sidenav-storage-item')?.click()
                    } else {
                        await this.locateToPlayer()
                    }
                })
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', {
                    floatNavMenuItemClass: '',
                    style: `style="${stylesV2.videoSettingsOpenButton}"`,
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
        // 清理上一次的轮询：旧闭包持有上一个视频的简介数据，不清理会在切换视频后把旧简介重新插入
        if (this._checkDescriptionInterval) {
            clearInterval(this._checkDescriptionInterval)
            this._checkDescriptionInterval = null
        }
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        if (!videoInfo) return
        const videoDescription = videoInfo.desc || ''
        // 插入前检查：移除所有已存在的视频简介元素
        const existingDescriptions = shadowDOMHelper.querySelectorAll(elementSelectors.value('adjustmentCommentDescription'))
        for (const el of existingDescriptions) {
            el.remove()
            logger.debug('视频简介丨插入前发现已存在，已移除')
        }
        // 断开旧的观察器，避免重复观察
        if (videoDescriptionObserver) {
            videoDescriptionObserver.disconnect()
            videoDescriptionObserver = null
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
                logger.debug('视频简介丨已插入')
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
                logger.warn('视频简介丨等待页面渲染超时，跳过插入')
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
        if (videoDescriptionObserver) {
            videoDescriptionObserver.disconnect()
        }
        videoDescriptionObserver = new MutationObserver(mutations => {
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
        videoDescriptionObserver.observe(targetNode, { childList: true, subtree: false })
    },
    async unlockEpisodeSelector () {
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        if (!videoInfo) return
        const { pages = false, ugc_season = false, episodes = false } = videoInfo
        if (pages || ugc_season || episodes) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': stylesV2.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    await this.locateToPlayer()
                })
            })
        }
    },
    // 解锁网页全屏模式
    async webfullPlayerModeUnlock () {
        const container = await elementSelectors.playerContainer
        if (container?.getAttribute('data-screen') !== 'web') {
            logger.debug('网页全屏丨当前非网页全屏模式，跳过解锁')
            return
        }
        await sleep(100)
        const player = document.getElementById('bilibili-player')
        const app = document.getElementById('app')
        // 将播放器移出 playerWrap → 移到 #app 顶部
        if (player && app && player.parentElement?.id === 'playerWrap') {
            app.prepend(player)
        }
        // 确保 mode-webscreen class 存在（从全屏退出时 B 站可能未添加）
        if (player && !player.classList.contains('mode-webscreen')) {
            player.classList.add('mode-webscreen')
        }
        document.body.classList.add('webscreen-fix')
        // 注入解锁样式（移除时 B 站原生 CSS 自动恢复）
        insertStyleToDocument({ 'UnlockWebPlayerStyle': stylesV2.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
        // 移除小窗模式按钮（解锁后小窗模式会破坏布局）
        document.querySelectorAll('.mini-player-window[title*="迷你播放器"]').forEach(el => el.remove())
        // 监听模式切换按钮（排除全屏按钮，避免干扰 B 站全屏操作）
        const [wideEnterButton, wideLeaveButton, webLeaveButton] = await elementSelectors.batch([
            'playerModeWideEnterButton',
            'playerModeWideLeaveButton',
            'playerModeWebLeaveButton'
        ])
        this._cleanup.push(addEventListenerToElement([wideEnterButton, wideLeaveButton, webLeaveButton], 'click', async () => {
            await sleep(100)
            await this.resetPlayerLayout()
        }))
        // 监听网页全屏进入按钮
        const webEnterBtn = await elementSelectors.playerModeWebEnterButton
        if (webEnterBtn) {
            this._cleanup.push(addEventListenerToElement(webEnterBtn, 'click', async () => {
                await this.webfullPlayerModeUnlock()
            }))
        }
        logger.info('网页全屏丨已解锁')
        eventBus.emit('video:webfullPlayerModeUnlock')
    },
    // 从全屏退出时强制恢复解锁状态
    async autoReapplyUnlockOnFullscreenExit () {
        this._fullscreenHandler = async () => {
            if (!document.fullscreenElement && this.userConfigs?.webfull_unlock && this.userConfigs?.selected_player_mode === 'web') {
                // 先立即补上样式 class，防止过渡期间播放器错位闪烁
                const player = document.getElementById('bilibili-player')
                if (player) player.classList.add('mode-webscreen')
                document.body.classList.add('webscreen-fix')
                // 再触发 B 站自身的网页全屏进入流程
                const webBtn = await elementSelectors.playerModeWebEnterButton
                if (webBtn) {
                    webBtn.click()
                    logger.debug('网页全屏丨退出全屏后重新进入网页全屏')
                }
            }
        }
        document.addEventListener('fullscreenchange', this._fullscreenHandler)
    },
    // 重置播放器布局（移除解锁样式，由 B 站原生 CSS 接管）
    async resetPlayerLayout () {
        const player = document.getElementById('bilibili-player')
        const playerWrap = document.getElementById('playerWrap')
        // 移回 playerWrap
        if (player && playerWrap && player.parentElement?.id !== 'playerWrap') {
            playerWrap.append(player)
        }
        // 删除解锁样式元素 → B 站原生 CSS 自动恢复
        insertStyleToDocument({ 'UnlockWebPlayerStyle': '' })
        await storageService.userSet('current_player_mode', 'wide')
        await this.locateToPlayer()
    },
    async insertLocateToCommentButton (){
        if (!this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        // 防止重复添加
        if (document.getElementById('goToComments')) return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        if (!playerControllerBottomRight || !videoComment) return
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo(await getElementOffsetToDocument(videoComment).top - 10)
        })
        // 插入前往UP主空间按钮
        const mid = this._cachedMid
        if (mid) {
            const upHtml = '<div class="bpx-player-ctrl-btn bpx-player-ctrl-comment" role="button" aria-label="前往UP主空间" tabindex="0" bilibili-adjustment-element><div id="goToUpSpace" class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg data-v-c8e76e74="" data-v-45380d2b="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 18" width="24" height="24"><path d="M4.612500000000001 6.186037499999999C4.92315 6.186037499999999 5.175000000000001 6.437872500000001 5.175000000000001 6.748537499999999L5.175000000000001 9.580575C5.175000000000001 10.191075000000001 5.66991 10.686 6.280425000000001 10.686C6.8909325 10.686 7.38585 10.191075000000001 7.38585 9.580575L7.38585 6.748537499999999C7.38585 6.437872500000001 7.637700000000001 6.186037499999999 7.94835 6.186037499999999C8.259 6.186037499999999 8.51085 6.437872500000001 8.51085 6.748537499999999L8.51085 9.580575C8.51085 10.8124125 7.512262499999999 11.811 6.280425000000001 11.811C5.048595000000001 11.811 4.050000000000001 10.8124125 4.050000000000001 9.580575L4.050000000000001 6.748537499999999C4.050000000000001 6.437872500000001 4.3018350000000005 6.186037499999999 4.612500000000001 6.186037499999999z" fill="#fff"></path><path d="M9.48915 6.748537499999999C9.48915 6.437872500000001 9.7409625 6.186037499999999 10.05165 6.186037499999999L11.79375 6.186037499999999C12.984637500000002 6.186037499999999 13.950000000000001 7.151415 13.950000000000001 8.34225C13.950000000000001 9.5331375 12.984637500000002 10.4985 11.79375 10.4985L10.61415 10.4985L10.61415 11.2485C10.61415 11.55915 10.3623 11.811 10.05165 11.811C9.7409625 11.811 9.48915 11.55915 9.48915 11.2485L9.48915 6.748537499999999zM10.61415 9.3735L11.79375 9.3735C12.3633 9.3735 12.825000000000001 8.9118 12.825000000000001 8.34225C12.825000000000001 7.7727375 12.3633 7.31103 11.79375 7.31103L10.61415 7.31103L10.61415 9.3735z" fill="#fff"></path><path d="M9 3.7485375000000003C7.111335 3.7485375000000003 5.46225 3.84462 4.2981675 3.939015C3.4891575 4.0046175 2.8620825 4.6226400000000005 2.79 5.424405C2.7045525 6.37485 2.625 7.6282499999999995 2.625 8.9985C2.625 10.368825000000001 2.7045525 11.622225 2.79 12.5726625C2.8620825 13.374412500000002 3.4891575 13.992450000000002 4.2981675 14.058074999999999C5.46225 14.152425000000001 7.111335 14.2485 9 14.2485C10.888874999999999 14.2485 12.538050000000002 14.152425000000001 13.702200000000001 14.058037500000001C14.511074999999998 13.9924125 15.138000000000002 13.3746 15.210075 12.573037500000002C15.295499999999999 11.622975 15.375 10.3698375 15.375 8.9985C15.375 7.627237500000001 15.295499999999999 6.3740775 15.210075 5.4240375C15.138000000000002 4.622475 14.511074999999998 4.00464 13.702200000000001 3.9390374999999995C12.538050000000002 3.844635 10.888874999999999 3.7485375000000003 9 3.7485375000000003zM4.2072375 2.8176975C5.39424 2.7214425 7.074434999999999 2.6235375000000003 9 2.6235375000000003C10.925775 2.6235375000000003 12.606075 2.7214575 13.793099999999999 2.81772C15.141074999999999 2.92704 16.208849999999998 3.9695849999999995 16.330575 5.323297500000001C16.418174999999998 6.297675 16.5 7.585537500000001 16.5 8.9985C16.5 10.4115375 16.418174999999998 11.6994 16.330575 12.6738C16.208849999999998 14.027474999999999 15.141074999999999 15.0700125 13.793099999999999 15.1793625C12.606075 15.275625 10.925775 15.3735 9 15.3735C7.074434999999999 15.3735 5.39424 15.275625 4.2072375 15.179400000000001C2.859045 15.070049999999998 1.7912325 14.027212500000001 1.6695225000000002 12.673425C1.5818849999999998 11.69865 1.5 10.4106 1.5 8.9985C1.5 7.586475 1.5818849999999998 6.2984025 1.6695225000000002 5.3236725C1.7912325 3.96984 2.859045 2.9270175000000003 4.2072375 2.8176975z" fill="#fff"></path></svg></span></div></div>'
            const upBtn = createElementAndInsert(upHtml, playerControllerBottomRight)
            addEventListenerToElement(upBtn, 'click', e => {
                e.stopPropagation()
                window.open(`https://space.bilibili.com/${mid}`, '_blank')
            })
        }
    },
    // 判断页面是否存在 #player-title（特殊播放页标识，需跳过部分功能）
    _playerTitleCache: undefined,
    async hasPlayerTitle () {
        if (this._playerTitleCache !== undefined) return this._playerTitleCache
        // 快速路径：DOM 检测
        if (document.querySelector('#player-title')) {
            this._playerTitleCache = true
            return true
        }
        // 番剧/电影页通过 API 进一步检测
        if (this.userConfigs?.page_type !== 'bangumi') {
            this._playerTitleCache = false
            return false
        }
        try {
            const epId = biliApis.getCurrentVideoID(window.location.href)
            if (!epId || epId === 'error') { this._playerTitleCache = false; return false }
            const info = await biliApis.getEpisodeInfo(epId)
            const isMovie = info?.season_type === 2 || info?.type_name === '电影'
            this._playerTitleCache = isMovie
            return isMovie
        } catch {
            this._playerTitleCache = false
            return false
        }
    },
    // 视频画面旋转
    videoRotateState: 0,
    async initVideoRotate () {
        const video = await elementSelectors.video
        if (!video) return
        this._videoRotateVideo = video
        // 监听右键菜单事件，注入旋转选项
        this._videoRotateContextHandler = () => {
            let attempts = 0
            const tryInject = () => {
                const menu = document.querySelector('.bpx-player-contextmenu')
                if (!menu) {
                    if (++attempts < 15) setTimeout(tryInject, 20)
                    return
                }
                // 移除旧的旋转菜单项
                menu.querySelectorAll('[data-action^="rotate_"]').forEach(el => el.remove())
                const oldDivider = menu.querySelector('.bpx-player-contextmenu-rotate-divider')
                if (oldDivider) oldDivider.remove()
                // 分割线
                const divider = document.createElement('li')
                divider.className = 'bpx-player-contextmenu-rotate-divider'
                divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.12);margin:4px 16px;list-style:none'
                menu.appendChild(divider)
                // 旋转选项：复原为绝对值，顺/逆时针为相对当前状态
                const rotateItems = [
                    { action: 'rotate_normal', label: '复原', deg: 0, absolute: true },
                    { action: 'rotate_cw', label: '顺时针90°', deg: 90, absolute: false },
                    { action: 'rotate_ccw', label: '逆时针90°', deg: -90, absolute: false }
                ]
                rotateItems.forEach(({ action, label, deg, absolute }) => {
                    const li = document.createElement('li')
                    li.setAttribute('data-action', action)
                    li.textContent = label
                    li.addEventListener('click', e => {
                        e.stopPropagation()
                        this.applyVideoRotation(absolute ? deg : this.videoRotateState + deg)
                        menu.classList.remove('bpx-player-active')
                    })
                    menu.appendChild(li)
                })
            }
            setTimeout(tryInject, 20)
        }
        video.addEventListener('contextmenu', this._videoRotateContextHandler)
        // 全屏切换时重新应用旋转
        this._videoRotateFullscreenHandler = () => {
            this.applyVideoRotation(this.videoRotateState)
        }
        document.addEventListener('fullscreenchange', this._videoRotateFullscreenHandler)
    },
    applyVideoRotation (degrees) {
        const video = document.querySelector('#bilibili-player video')
        if (!video) return
        this.videoRotateState = degrees
        if (degrees === 0) {
            video.style.transform = ''
            video.style.transformOrigin = ''
        } else {
            const vw = video.videoWidth
            const vh = video.videoHeight
            const scale = (vw && vh) ? Math.min(vw, vh) / Math.max(vw, vh) : 9 / 16
            video.style.transform = `rotate(${degrees}deg) scale(${scale})`
            video.style.transformOrigin = 'center center'
        }
    },
    async handleVideoPauseOnTabSwitch () {
        const video = await elementSelectors.video
        if (!video) return
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
        this._pauseVideoCleanup = tabState
        return () => {
            tabState()
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
    // ========== 播放进度记忆（官方进度记忆失效时的兜底） ==========
    initPlaybackMemory () {
        if (this._playbackBound) return
        this._playbackBound = true
        this._playbackKey = this._getPlaybackKey()
        this._playbackLastVideo = null
        this._playbackUserInteracted = false
        this._playbackRestoredKey = null
        this._playbackRestoreTimer = null
        this._playbackSaveThrottled = _.throttle(this.savePlaybackPosition.bind(this), 10000)
        const isMainVideo = event => event.target instanceof HTMLVideoElement &&
                                     event.target.matches('#bilibili-player video')
        this._playbackTimeUpdateHandler = event => {
            if (!isMainVideo(event)) return
            this._playbackLastVideo = event.target
            this._playbackSaveThrottled()
        }
        this._playbackPlayHandler = event => {
            if (!isMainVideo(event)) return
            this._playbackLastVideo = event.target
            // 播放即视为用户主动控制，直到点击播放器内任意位置前豁免恢复
            this._playbackUserInteracted = false
            clearTimeout(this._playbackRestoreTimer)
            // 800ms 窗口：给官方进度记忆的 seek 留出时间，避免兜底与官方恢复竞争
            this._playbackRestoreTimer = setTimeout(() => this.restorePlaybackPosition(event.target), 800)
        }
        this._playbackPauseHandler = event => {
            if (!isMainVideo(event)) return
            this._playbackLastVideo = event.target
            this.savePlaybackPosition()
        }
        this._playbackClickHandler = event => {
            if (event.target instanceof Element && event.target.closest('#bilibili-player')) {
                this._playbackUserInteracted = true
            }
        }
        this._playbackPageHideHandler = () => this.savePlaybackPosition()
        this._playbackVisibilityHandler = () => {
            if (document.visibilityState === 'hidden') this.savePlaybackPosition()
        }
        // 捕获阶段监听：SPA 导航后 video 元素被替换，document 级监听无需重新绑定
        document.addEventListener('timeupdate', this._playbackTimeUpdateHandler, true)
        document.addEventListener('play', this._playbackPlayHandler, true)
        document.addEventListener('pause', this._playbackPauseHandler, true)
        document.addEventListener('click', this._playbackClickHandler, true)
        window.addEventListener('pagehide', this._playbackPageHideHandler)
        document.addEventListener('visibilitychange', this._playbackVisibilityHandler)
        this._cleanup.push(() => this.destroyPlaybackMemory())
    },
    destroyPlaybackMemory () {
        if (!this._playbackBound) return
        this._playbackBound = false
        document.removeEventListener('timeupdate', this._playbackTimeUpdateHandler, true)
        document.removeEventListener('play', this._playbackPlayHandler, true)
        document.removeEventListener('pause', this._playbackPauseHandler, true)
        document.removeEventListener('click', this._playbackClickHandler, true)
        window.removeEventListener('pagehide', this._playbackPageHideHandler)
        document.removeEventListener('visibilitychange', this._playbackVisibilityHandler)
        this._playbackSaveThrottled?.cancel?.()
        clearTimeout(this._playbackRestoreTimer)
        this._playbackRestoreTimer = null
    },
    _getPlaybackKey () {
        const { pathname, searchParams } = window.location
        return `${pathname}?p=${searchParams.get('p') || '1'}`
    },
    _getPlaybackStore () {
        try {
            return JSON.parse(localStorage.getItem(PLAYBACK_STORE_KEY)) || {}
        } catch (error) {
            logger.error('播放进度丨读取存储失败', error)
            return {}
        }
    },
    _setPlaybackStore (store) {
        try {
            localStorage.setItem(PLAYBACK_STORE_KEY, JSON.stringify(store))
        } catch (error) {
            logger.error('播放进度丨保存存储失败', error)
        }
    },
    async savePlaybackPosition () {
        if (!this.userConfigs?.playback_memory || !this._playbackBound) return
        // URL 已变化时跳过，等待 handleHrefChanged 用缓存的旧 key 写入
        if (this._getPlaybackKey() !== this._playbackKey) return
        this._writePlaybackPosition(this._playbackLastVideo, this._playbackKey)
    },
    _writePlaybackPosition (video, key) {
        if (!video || !key || !this.userConfigs?.playback_memory) return
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) return
        const { currentTime, duration } = video
        if (!Number.isFinite(currentTime) || currentTime < 1) return
        const store = this._getPlaybackStore()
        // 已观看至结尾则清除记录，避免下次误跳
        if (Number.isFinite(duration) && currentTime >= duration - 3) {
            if (store[key]) {
                delete store[key]
                this._setPlaybackStore(store)
                logger.debug('播放进度丨已观看完毕，清除进度记录')
            }
            return
        }
        store[key] = { position: Math.floor(currentTime), timestamp: Date.now() }
        // LRU 上限：超出时按时间戳删除最旧记录
        const entries = Object.entries(store).sort((a, b) => b[1].timestamp - a[1].timestamp)
        if (entries.length > PLAYBACK_STORE_LIMIT) {
            entries.slice(PLAYBACK_STORE_LIMIT).forEach(([k]) => delete store[k])
        }
        this._setPlaybackStore(store)
    },
    async restorePlaybackPosition (video) {
        if (!video || !this.userConfigs?.playback_memory) return
        const key = this._playbackKey
        if (!key || this._playbackRestoredKey === key) return
        // 用户已交互（点击过播放器内任意位置）视为主动控制，不恢复
        if (this._playbackUserInteracted) {
            logger.debug('播放进度丨检测到用户交互，跳过恢复')
            return
        }
        // 官方进度记忆已生效（seek 后 currentTime > 2），兜底不再介入
        if (video.currentTime > 2) {
            logger.debug('播放进度丨官方进度记忆已生效，跳过兜底恢复')
            return
        }
        const record = this._getPlaybackStore()[key]
        if (!record) return
        const { position, timestamp } = record
        const { duration } = video
        if (position < 5 || (Number.isFinite(duration) && position >= duration - 3)) return
        // 超过 7 天的记录视为过期，不恢复
        if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return
        try {
            video.currentTime = position
            this._playbackRestoredKey = key
            logger.info(`播放进度丨已恢复至 ${Math.floor(position / 60)}分${position % 60}秒`)
        } catch (error) {
            logger.warn('播放进度丨恢复失败', error)
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
        if (!videoInfo) return
        const cid = videoInfo.cid
        const up_mid = videoInfo.owner?.mid
        if (!cid || !up_mid || !bvid || bvid === 'error') return
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
        this._adVideo = video
        this._adTimeUpdateHandler = handleTimeUpdate
        video.addEventListener('timeupdate', handleTimeUpdate)
        logger.info('自动跳过广告丨已启动，共检测到', sortedSegments.length, '个广告时间段', sortedSegments)
        // 初始检查，处理当前时间已经在广告时间段内的情况
        handleTimeUpdate()
    },
    async handleHrefChangedFunctionsSequentially (){
        // 切换视频前保存旧视频的播放进度（URL 已变化，用缓存的旧 key 写入）
        const oldVideo = this._playbackLastVideo || document.querySelector('#bilibili-player video')
        this._writePlaybackPosition(oldVideo, this._playbackKey)
        this._playbackKey = this._getPlaybackKey()
        this.userConfigs.page_type === 'bangumi' && await sleep(50)
        // 切换视频时重置画面旋转
        this._playerTitleCache = undefined
        advertisementIdentified = false
        if (this._adVideo && this._adTimeUpdateHandler) {
            this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
            this._adVideo = null
            this._adTimeUpdateHandler = null
        }
        if (this.videoRotateState !== 0) {
            this.videoRotateState = 0
            const video = document.querySelector('#bilibili-player video')
            if (video) {
                video.style.transform = ''
                video.style.transformOrigin = ''
            }
        }
        await this.locateToPlayer()
        // 重新绑定播放器模式观察器（SPA 导航后元素可能被替换）
        elementSelectors.playerContainer.then(container => {
            if (!container) return
            const observer = new MutationObserver(() => {
                const mode = container.getAttribute('data-screen')
                if (mode && mode !== this._lastPlayerMode) {
                    this._lastPlayerMode = mode
                    sessionStorage.setItem('bili_last_player_mode', mode)
                    // 切回网页全屏时自动重新解锁
                    if (mode === 'web' && this.userConfigs?.webfull_unlock && this.userConfigs?.selected_player_mode === 'web') {
                        this.webfullPlayerModeUnlock()
                    }
                }
            })
            this._modeObservers.push(observer)
            observer.observe(container, { attributeFilter: ['data-screen']})
        })
        const hasTitle = await this.hasPlayerTitle()
        const hrefChangeFunctions = [
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type !== 'bangumi')],
            [this.insertVideoDescriptionToComment, Boolean(this.userConfigs.insert_video_description_to_comment && this.userConfigs.page_type === 'video')],
            this.doSomethingToCommentElements,
            [this.unlockEpisodeSelector, !hasTitle],
            [this.webfullPlayerModeUnlock, Boolean(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && this.userConfigs.page_type === 'video')]
        ]
        // 等待新视频可播放，最长 5 秒；超时也继续执行，避免视频加载异常时其余功能挂起
        const videoReady = await Promise.race([
            this.checkVideoCanplaythrough(await elementSelectors.video, false),
            sleep(5000).then(() => false)
        ])
        if (!videoReady) logger.warn('视频资源丨等待可播放超时（5s），继续执行其余功能')
        executeFunctionsSequentially(hrefChangeFunctions)
        // SPA 切换时首次定位可能在布局稳定前执行，视频可播放后重新校验并纠正定位
        await this.autoLocateToPlayer()
        this.autoEnableSubtitle(Boolean(this.userConfigs.auto_subtitle))
    },
    async handleExecuteFunctionsSequentially () {
        const hasTitle = await this.hasPlayerTitle()
        const functions = [
            this.insertSideFloatNavToolsButtons,
            [this.clickPlayerAutoLocate, Boolean(this.userConfigs.click_player_auto_locate)],
            [this.autoCancelMute, Boolean(this.userConfigs.auto_cancel_mute)],
            this.initVideoRotate,
            [this.unlockEpisodeSelector, !hasTitle],
            [this.autoEnableHiResMode, Boolean(this.userConfigs.is_vip && this.userConfigs.auto_hi_res)],
            [this.autoSelectVideoHighestQuality, Boolean(this.userConfigs.auto_select_video_highest_quality)],
            [this.webfullPlayerModeUnlock, Boolean(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && this.userConfigs.page_type === 'video')],
            this.insertAutoEnableSubtitleSwitchButton,
            [this.handleVideoPauseOnTabSwitch, Boolean(this.userConfigs.pause_video)],
            [this.insertVideoDescriptionToComment, Boolean(this.userConfigs.insert_video_description_to_comment && this.userConfigs.page_type === 'video')],
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type !== 'bangumi')],
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(functions)
        this.autoEnableSubtitle()
    }
}
