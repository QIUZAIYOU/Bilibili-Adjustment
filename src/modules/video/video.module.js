/* global _ */
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsComponentV2 } from '@/components/settings-component-v2'
import { destroyTooltip } from '@/components/tooltip-component'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { sleep, executeFunctionsSequentially, isTabActive, monitorHrefChange, insertStyleToDocument } from '@/utils/common'
import { stylesV2 } from '@/shared/styles'
import { EVENT_NAMES, STORAGE_KEYS } from '@/shared/constants'
import { playerModeFeatures } from './player-mode'
import { progressMemoryFeatures } from './progress-memory'
import { adSkipFeatures } from './ad-skip'
import { subtitleFeatures } from './subtitle'
import { commentFeatures } from './comment'
import { qualityFeatures } from './quality'
import { webfullFeatures } from './webfull'
import { uiButtonsFeatures } from './ui-buttons'
import { upSpacePopupFeatures } from './up-space-popup'
import { videoRotateFeatures } from './video-rotate'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsComponentV2()
export default {
    name: 'video',
    version: '3.24.0',
    async install () {
        this._cleanup = []
        this._modeObservers = []
        // 广告识别与简介观察器状态（原模块级变量，随模块实例生命周期）
        this.advertisementIdentified = false
        this.videoDescriptionObserver = null
        this.initSubtitleStateMemory()
        this._cleanup.push(eventBus.on(EVENT_NAMES.APP_READY, async () => {
            logger.info('视频模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall () {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        this._upSpacePopupDismissCleanup?.()
        this._upSpacePopupDismissCleanup = null
        this._remoteConfigSyncUnsubscribe?.()
        this._remoteConfigSyncUnsubscribe = null
        if (this.videoDescriptionObserver) {
            this.videoDescriptionObserver.disconnect()
            this.videoDescriptionObserver = null
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
        if (this._descriptionWatchdog) clearTimeout(this._descriptionWatchdog)
        if (this._descriptionFallbackTimer) clearTimeout(this._descriptionFallbackTimer)
        this._descriptionFeedWaitStop?.()
        this._descriptionRunToken = (this._descriptionRunToken || 0) + 1
        this._pauseVideoCleanup?.()
    },
    async preFunctions () {
        await storageService.userSet('page_type', location.pathname.startsWith('/bangumi/') ? 'bangumi' : 'video')
        await sleep(300)
        this.userConfigs = await storageService.getAll('user')
        logger.debug('播放进度诊断丨userConfigs 已加载, playback_memory=' + this.userConfigs?.playback_memory)
        // 定位前锁定页面滚动，避免用户滚动干扰自动定位；网页全屏解锁场景不执行定位（见 autoLocateToPlayer），
        // 锁定会在定位被跳过时永远无法解除，导致页面卡死无法滚动，故跳过
        if (!this.userConfigs.webfull_unlock) {
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': stylesV2.BodyOverflowHidden })
        }
        await this.registSettings()
        await this.initEventListeners()
        this.initMonitors()
        this.initRemoteConfigSync()
        this.initPlaybackMemory()
    },
    // 跨标签页配置同步：其他标签页修改设置后，当前页立即应用可即时生效的行为
    initRemoteConfigSync () {
        if (this._remoteConfigSyncUnsubscribe) return
        this._remoteConfigSyncUnsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, async (_, { key, value }) => {
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
        this._cleanup.push(eventBus.on(EVENT_NAMES.LOGGER_SHOW, (_, { type, message }) => {
            logger[type]?.(message)
        }))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_CANPLAYTHROUGH, _.debounce(() => this.autoSelectPlayerMode(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED, _.debounce(() => this.autoLocateToPlayer(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS, _.debounce(this.handleExecuteFunctionsSequentially, 500, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once(EVENT_NAMES.VIDEO_WEBFULL_PLAYER_MODE_UNLOCK, _.debounce(this.insertLocateToCommentButton, 500, { 'leading': true, 'trailing': false })))
        this.autoReapplyUnlockOnFullscreenExit()
        // 监听播放器模式变化，记录用户手动切换的模式
        this._lastPlayerMode = this.userConfigs?.selected_player_mode || 'normal'
        elementSelectors.playerContainer.then(container => {
            if (!container) return
            const observer = new MutationObserver(() => {
                const mode = container.getAttribute('data-screen')
                if (mode && mode !== this._lastPlayerMode) {
                    this._lastPlayerMode = mode
                    sessionStorage.setItem(STORAGE_KEYS.SESSION_LAST_PLAYER_MODE, mode)
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
        this.settingsComponent = settingsComponent
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
                eventBus.emit(EVENT_NAMES.VIDEO_CANPLAYTHROUGH)
                logger.info('视频资源｜可以播放')
            }
            return true
        }
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
    // 判断页面是否存在 #player-title（特殊播放页标识，需跳过部分功能）
    _playerTitleCache: undefined,
    async hasPlayerTitle () {
        if (this._playerTitleCache !== undefined) return this._playerTitleCache
        // 番剧页：#player-title 也会出现在番剧播放页上，不能仅凭 DOM 判断，必须通过 API 精确识别
        if (this.userConfigs?.page_type === 'bangumi') {
            try {
                const epId = biliApis.getCurrentVideoID(window.location.href)
                if (!epId || epId === 'error') { this._playerTitleCache = false; return false }
                const info = await biliApis.getVideoInformation('bangumi', epId)
                const isMovie = info?.season_type === 2 || info?.type_name === '电影'
                this._playerTitleCache = isMovie
                return isMovie
            } catch {
                this._playerTitleCache = false
                return false
            }
        }
        // 普通视频页：DOM 快速路径
        if (document.querySelector('#player-title')) {
            this._playerTitleCache = true
            return true
        }
        this._playerTitleCache = false
        return false
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
    async handleHrefChangedFunctionsSequentially (){
        // 切换视频前保存旧视频的播放进度（URL 已变化，用缓存的旧 key 写入）
        const entry = this._playbackLastVideo || {
            video: document.querySelector('#bilibili-player video'),
            key: this._playbackKey
        }
        this._writePlaybackPosition(entry, this._playbackKey)
        this._playbackKey = this._getPlaybackKey()
        this.userConfigs.page_type === 'bangumi' && await sleep(50)
        // 切换视频时重置画面旋转
        this._playerTitleCache = undefined
        this.advertisementIdentified = false
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
                    sessionStorage.setItem(STORAGE_KEYS.SESSION_LAST_PLAYER_MODE, mode)
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
        // 简介/评论等即时功能不等待视频可播放，立即执行，避免切换选集时延迟
        const immediateFunctions = [
            [this.insertVideoDescriptionToComment, Boolean(this.userConfigs.insert_video_description_to_comment && this.userConfigs.page_type === 'video')],
            this.doSomethingToCommentElements
        ]
        executeFunctionsSequentially(immediateFunctions)
        // 广告识别耗时较长且结果不阻塞其他功能，固定排最后执行，避免延误简介/评论等即时功能
        const deferredFunctions = [
            [this.unlockEpisodeSelector, !hasTitle],
            [this.webfullPlayerModeUnlock, Boolean(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && this.userConfigs.page_type === 'video')],
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type !== 'bangumi')],
            // 番剧页不执行AI广告识别，但加载缓存中的跳过片段（片头片尾等手动配置）
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && this.userConfigs.page_type === 'bangumi')]
        ]
        // 等待新视频可播放，最长 5 秒；超时也继续执行，避免视频加载异常时其余功能挂起
        const videoReady = await Promise.race([
            this.checkVideoCanplaythrough(await elementSelectors.video, false),
            sleep(5000).then(() => false)
        ])
        if (!videoReady) logger.warn('视频资源丨等待可播放超时（5s），继续执行其余功能')
        executeFunctionsSequentially(deferredFunctions)
        // 选择播放器默认模式（番剧页可能未触发 VIDEO_CANPLAYTHROUGH 事件，需在此补充调用）
        await this.autoSelectPlayerMode()
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
            this.doSomethingToCommentElements,
            // 广告识别耗时较长且结果不阻塞其他功能，固定排最后执行
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type !== 'bangumi')],
            // 番剧页不执行AI广告识别，但加载缓存中的跳过片段（片头片尾等手动配置）
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && this.userConfigs.page_type === 'bangumi')]
        ]
        executeFunctionsSequentially(functions)
        this.autoEnableSubtitle()
    },
    ...playerModeFeatures,
    ...progressMemoryFeatures,
    ...adSkipFeatures,
    ...subtitleFeatures,
    ...commentFeatures,
    ...qualityFeatures,
    ...webfullFeatures,
    ...uiButtonsFeatures,
    ...upSpacePopupFeatures,
    ...videoRotateFeatures
}
