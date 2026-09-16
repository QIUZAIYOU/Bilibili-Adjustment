import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsDialogHost } from '@/components/settings-dialog'
import { destroyTooltip } from '@/components/tooltip-component'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { sleep, executeFunctionsSequentially, isTabActive, monitorHrefChange, insertStyleToDocument } from '@/utils/common'
import { debounce } from '@/utils/lodash-lite'
import { retryQueue } from '@/utils/retry-queue'
import { styles } from '@/shared/styles'
import { EVENT_NAMES, STORAGE_KEYS } from '@/shared/constants'
import type { LogLevel } from '@/services/logger.service'
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
import { initProgressSegmentTint } from './progress-segments'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsDialogHost()
/**
 * 视频模块实例契约：本对象的字段 + 展开的各 feature 提供的字段/方法。
 * 各 feature 内部用 `this: XxxContext` 声明的成员，必须在这里被覆盖到。
 */
interface VideoModuleContext {
    name: string
    version: string
    userConfigs: Record<string, unknown>
    settingsComponent: unknown
    _retryQueue: typeof retryQueue
    _cleanup: Array<() => void>
    _modeObservers: MutationObserver[]
    advertisementIdentified: boolean
    videoDescriptionObserver: MutationObserver | null
    _lastPlayerMode?: string
    _playerTitleCache?: boolean
    _pauseVideoCleanup?: () => void
    _playbackLastVideo?: { video: Element | null; key?: string } | null
    _playbackKey?: string
    _descriptionWatchdog?: ReturnType<typeof setTimeout> | null
    _descriptionFallbackTimer?: ReturnType<typeof setTimeout> | null
    _descriptionFeedWaitStop?: (() => void) | null
    _descriptionRunToken?: number
    _adVideo?: HTMLVideoElement | null
    _adTimeUpdateHandler?: (() => void) | null
    _skipCacheApplied?: boolean
    _upSpacePopupDismissCleanup?: (() => void) | null
    _remoteConfigSyncUnsubscribe?: (() => void) | null
    _videoRotateFullscreenHandler?: EventListener | null
    _videoRotateContextHandler?: EventListener | null
    _videoRotateVideo?: HTMLVideoElement | null
    _webfullWheelAttached?: boolean
    _lastSubtitleState?: string | null
    _subtitleUserClickHandler?: ((event: MouseEvent) => void) | null
    _upSpaceDialog?: { body: HTMLElement; destroy: () => void } | null
    videoRotateState?: number
    _fullscreenHandler?: EventListener | null
    preFunctions: () => Promise<void>
    initSubtitleStateMemory: () => void
    registSettings: () => Promise<void>
    initEventListeners: () => Promise<void>
    initMonitors: () => void
    initRemoteConfigSync: () => void
    initPlaybackMemory: () => void
    destroyPlaybackMemory: () => void
    autoSelectPlayerMode: () => Promise<unknown>
    autoLocateToPlayer: () => Promise<void>
    locateToPlayer: () => Promise<void>
    handleExecuteFunctionsSequentially: () => Promise<void> | void
    handleHrefChangedFunctionsSequentially: () => Promise<void>
    insertLocateToCommentButton: () => Promise<void> | void
    autoReapplyUnlockOnFullscreenExit: () => void | Promise<void>
    checkVideoCanplaythrough: (videoElement: Element | null, emit?: boolean) => Promise<boolean | undefined>
    isVideoCanplaythrough: (videoElement: Element | null) => Promise<boolean>
    loadCachedSkipSegments: () => Promise<void>
    identifyAdvertisementTimestamps: () => Promise<void>
    webfullPlayerModeUnlock: () => Promise<void>
    resetPlayerLayout: () => Promise<void>
    enableWheelScrollInWebfull: () => void
    autoEnableSubtitle: (force?: unknown) => Promise<void>
    autoCancelMute: () => Promise<void>
    autoEnableHiResMode: () => Promise<void>
    autoSelectVideoHighestQuality: () => Promise<void>
    insertSideFloatNavToolsButtons: () => Promise<void>
    clickPlayerAutoLocate: () => Promise<void>
    initVideoRotate: () => Promise<void>
    applyVideoRotation: (degrees: number) => void
    unlockEpisodeSelector: () => Promise<void>
    insertAutoEnableSubtitleSwitchButton: () => Promise<void>
    handleVideoPauseOnTabSwitch: () => Promise<(() => void) | undefined>
    insertVideoDescriptionToComment: () => Promise<void>
    hasPlayerTitle: () => Promise<boolean>
    handleJumpToVideoTime: (video: HTMLVideoElement, target: HTMLElement) => void
    doSomethingToCommentElements: (...args: unknown[]) => Promise<void>
    destroyUpSpacePopup: () => void
    openUpSpace: (mid: string | number) => Promise<void>
    openUpSpacePopup: (mid: string | number) => Promise<void>
    _writePlaybackPosition: (entry: unknown, key?: string) => void
    _getPlaybackKey: () => string
}
export default {
    name: 'video',
    version: '3.34.3',
    async install (this: VideoModuleContext): Promise<void> {
        this._cleanup = []
        this._modeObservers = []
        this._retryQueue = retryQueue
        // 广告识别与简介观察器状态（原模块级变量，随模块实例生命周期）
        this.advertisementIdentified = false
        this.videoDescriptionObserver = null
        this.initSubtitleStateMemory()
        this._cleanup.push(eventBus.on(EVENT_NAMES.APP_READY, async () => {
            logger.info('视频模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall (this: VideoModuleContext): Promise<void> {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        this._upSpacePopupDismissCleanup?.()
        this._upSpacePopupDismissCleanup = null
        this.destroyUpSpacePopup?.()
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
        this._videoRotateVideo?.removeEventListener('contextmenu', this._videoRotateContextHandler as EventListener)
        if (this._adVideo && this._adTimeUpdateHandler) {
            this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
        }
        if (this._descriptionWatchdog) clearTimeout(this._descriptionWatchdog)
        if (this._descriptionFallbackTimer) clearTimeout(this._descriptionFallbackTimer)
        this._descriptionFeedWaitStop?.()
        this._descriptionRunToken = (this._descriptionRunToken || 0) + 1
        this._pauseVideoCleanup?.()
    },
    async preFunctions (this: VideoModuleContext): Promise<void> {
        await storageService.userSet('page_type', location.pathname.startsWith('/bangumi/') ? 'bangumi' : 'video')
        await sleep(300)
        this.userConfigs = await storageService.getAll('user') as Record<string, unknown>
        logger.debug('播放进度诊断丨userConfigs 已加载, playback_memory=' + this.userConfigs?.playback_memory)
        // 定位前锁定页面滚动，避免用户滚动干扰自动定位；网页全屏解锁场景不执行定位（见 autoLocateToPlayer），
        // 锁定会在定位被跳过时永远无法解除，导致页面卡死无法滚动，故跳过
        if (!this.userConfigs.webfull_unlock) {
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': styles.BodyOverflowHidden })
        }
        await this.registSettings()
        await this.initEventListeners()
        // 官方进度条上给「跳过片段」区间染色（等待进度条出现后自行挂载，幂等）
        initProgressSegmentTint()
        this.initMonitors()
        this.initRemoteConfigSync()
        this.initPlaybackMemory()
    },
    // 跨标签页配置同步：其他标签页修改设置后，当前页立即应用可即时生效的行为
    initRemoteConfigSync (this: VideoModuleContext): void {
        if (this._remoteConfigSyncUnsubscribe) return
        this._remoteConfigSyncUnsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, async (_ctx, ...args: unknown[]) => {
            const { key, value } = (args[0] ?? {}) as { key: string; value: unknown }
            this.userConfigs[key] = value
            switch (key) {
                case 'auto_skip':
                    if (value) {
                        // 总开关开启：先应用该视频已有缓存片段（手动/共享），AI 识别子开关也开启时才补 AI 识别
                        await this.loadCachedSkipSegments()
                        if (this.userConfigs.ai_auto_identify) {
                            await this.identifyAdvertisementTimestamps()
                        }
                    } else if (this._adVideo && this._adTimeUpdateHandler) {
                        this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
                        this._adVideo = null
                        this._adTimeUpdateHandler = null
                        this._skipCacheApplied = false
                        logger.info('跳过片段丨已关闭')
                    }
                    break
                case 'ai_auto_identify':
                    // 子开关开启：仅影响 AI 识别补全，不影响已有缓存片段的跳过
                    if (value && this.userConfigs.auto_skip) {
                        await this.identifyAdvertisementTimestamps()
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
    async initEventListeners (this: VideoModuleContext): Promise<void> {
        this._cleanup.push(eventBus.on(EVENT_NAMES.LOGGER_SHOW, (_ctx, ...args: unknown[]) => {
            const { type, message } = (args[0] ?? {}) as { type?: string; message?: string }
            const level = type as LogLevel | undefined
            if (level && typeof logger[level] === 'function') logger[level](message as string)
        }))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_CANPLAYTHROUGH, debounce(() => this.autoSelectPlayerMode(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED, debounce(() => this.autoLocateToPlayer(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS, debounce(this.handleExecuteFunctionsSequentially, 500, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once(EVENT_NAMES.VIDEO_WEBFULL_PLAYER_MODE_UNLOCK, debounce(this.insertLocateToCommentButton, 500, { 'leading': true, 'trailing': false })))
        this.autoReapplyUnlockOnFullscreenExit()
        // 监听播放器模式变化，记录用户手动切换的模式
        this._lastPlayerMode = (this.userConfigs?.selected_player_mode || 'normal') as string
        elementSelectors.wait('playerContainer').then(container => {
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
    async registSettings (this: VideoModuleContext): Promise<void> {
        this.settingsComponent = settingsComponent
        await settingsComponent.init(this.userConfigs)
    },
    initMonitors (this: VideoModuleContext): void {
        this._cleanup.push(monitorHrefChange(async () => {
            logger.debug('视频资源丨链接已改变')
            await this.handleHrefChangedFunctionsSequentially()
        }))
        // 番剧页：跳过标签页可见性检测，视频元素渲染即触发流程
        // 普通视频页：保留标签页激活检测（防止后台标签页误触发）
        if (this.userConfigs.page_type === 'bangumi') {
            logger.debug('番剧页丨跳过标签页检测，直接检测视频元素')
            insertStyleToDocument({ 'VideoPageAdjustmentStyle': styles.VideoPageAdjustment, 'VideoSettingsStyle': styles.VideoSettings })
            ;(async () => this.checkVideoCanplaythrough(await elementSelectors.wait('video') as HTMLVideoElement | null))()
        } else {
            this._cleanup.push(isTabActive({
                onActiveChange: async isActive => {
                    if (isActive) {
                        logger.info('标签页｜已激活')
                        insertStyleToDocument({ 'VideoPageAdjustmentStyle': styles.VideoPageAdjustment, 'VideoSettingsStyle': styles.VideoSettings })
                        this.checkVideoCanplaythrough(elementSelectors.get('video') as HTMLVideoElement | null)
                    }
                },
                immediate: true,
                checkInterval: 10,
                once: true
            }))
        }
    },
    isVideoCanplaythrough (this: VideoModuleContext, videoElement: HTMLVideoElement | null): Promise<boolean> {
        return new Promise<boolean>(resolve => {
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
            // 兜底：事件监听可能因 src 重赋值失效，用轮询补偿
            const pollInterval = setInterval(() => {
                if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    ac.abort()
                    clearInterval(pollInterval)
                    resolve(true)
                }
            }, 200)
            // 超时兜底：5 秒后仍未就绪则放弃
            setTimeout(() => {
                ac.abort()
                clearInterval(pollInterval)
                resolve(videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA)
            }, 5000)
        })
    },
    async checkVideoCanplaythrough (this: VideoModuleContext, videoElement: HTMLVideoElement | null, emit = true): Promise<boolean | undefined> {
        const canplaythrough = await this.isVideoCanplaythrough(videoElement)
        if (canplaythrough) {
            if (emit) {
                eventBus.emit(EVENT_NAMES.VIDEO_CANPLAYTHROUGH)
                logger.info('视频资源｜可以播放')
            }
            return true
        }
    },
    handleJumpToVideoTime (this: VideoModuleContext, video: HTMLVideoElement, target: HTMLElement): void {
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
    async hasPlayerTitle (this: VideoModuleContext): Promise<boolean> {
        if (this._playerTitleCache !== undefined) return this._playerTitleCache
        // 番剧页：#player-title 也会出现在番剧播放页上，不能仅凭 DOM 判断，必须通过 API 精确识别
        if (this.userConfigs?.page_type === 'bangumi') {
            try {
                const epId = biliApis.getCurrentVideoID(window.location.href)
                if (!epId || epId === 'error') { this._playerTitleCache = false; return false }
                const info = await biliApis.getVideoInformation('bangumi', epId) as { season_type?: unknown; type_name?: unknown } | null | undefined
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
    async handleVideoPauseOnTabSwitch (this: VideoModuleContext): Promise<(() => void) | undefined> {
        const video = elementSelectors.get('video') as HTMLVideoElement | null
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
    async handleHrefChangedFunctionsSequentially (this: VideoModuleContext): Promise<void> {
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
        this._skipCacheApplied = false
        if (this._adVideo && this._adTimeUpdateHandler) {
            this._adVideo.removeEventListener('timeupdate', this._adTimeUpdateHandler)
            this._adVideo = null
            this._adTimeUpdateHandler = null
        }
        if (this.videoRotateState !== 0) {
            this.videoRotateState = 0
            const video = document.querySelector('#bilibili-player video') as HTMLVideoElement | null
            if (video) {
                video.style.transform = ''
                video.style.transformOrigin = ''
            }
        }
        await this.locateToPlayer()
        // 重新绑定播放器模式观察器（SPA 导航后元素可能被替换）
        elementSelectors.wait('playerContainer').then(container => {
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
        executeFunctionsSequentially(immediateFunctions, { onAfterChunk: () => retryQueue.drain() })
        // 广告识别耗时较长且结果不阻塞其他功能，固定排最后执行，避免延误简介/评论等即时功能
        const deferredFunctions = [
            [this.unlockEpisodeSelector, !hasTitle],
            [this.webfullPlayerModeUnlock, Boolean(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && this.userConfigs.page_type === 'video')],
            // 普通视频页：先应用缓存中的跳过片段（手动添加/共享缓存），再按需用 AI 识别补全缺失片段
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type === 'video')],
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && this.userConfigs.ai_auto_identify && !hasTitle && this.userConfigs.page_type === 'video')],
            // 番剧页：不执行 AI 识别，仅加载缓存中的跳过片段（片头片尾等手动配置）
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && this.userConfigs.page_type === 'bangumi')]
        ]
        // 等待新视频可播放，最长 5 秒；超时也继续执行，避免视频加载异常时其余功能挂起
        const videoReady = await Promise.race([
            this.checkVideoCanplaythrough(elementSelectors.get('video') as HTMLVideoElement | null, false),
            sleep(5000).then(() => false)
        ])
        if (!videoReady) logger.warn('视频资源丨等待可播放超时（5s），继续执行其余功能')
        executeFunctionsSequentially(deferredFunctions, { onAfterChunk: () => retryQueue.drain() })
        // 选择播放器默认模式（番剧页可能未触发 VIDEO_CANPLAYTHROUGH 事件，需在此补充调用）
        await this.autoSelectPlayerMode()
        // SPA 切换时首次定位可能在布局稳定前执行，视频可播放后重新校验并纠正定位
        await this.autoLocateToPlayer()
        this.autoEnableSubtitle(Boolean(this.userConfigs.auto_subtitle))
    },
    async handleExecuteFunctionsSequentially (this: VideoModuleContext): Promise<void> {
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
            // 普通视频页：先应用缓存中的跳过片段（手动添加/共享缓存），再按需用 AI 识别补全缺失片段
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && !hasTitle && this.userConfigs.page_type === 'video')],
            [this.identifyAdvertisementTimestamps, Boolean(this.userConfigs.auto_skip && this.userConfigs.ai_auto_identify && !hasTitle && this.userConfigs.page_type === 'video')],
            // 番剧页：不执行 AI 识别，仅加载缓存中的跳过片段（片头片尾等手动配置）
            [this.loadCachedSkipSegments, Boolean(this.userConfigs.auto_skip && this.userConfigs.page_type === 'bangumi')]
        ]
        executeFunctionsSequentially(functions, { onAfterChunk: () => retryQueue.drain() })
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
