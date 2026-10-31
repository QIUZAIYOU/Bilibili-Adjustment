import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { SettingsDialogHost } from '@/components/settings-dialog'
import { destroyTooltip } from '@/components/tooltip-component'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { sleep, isTabActive, monitorHrefChange, insertStyleToDocument } from '@/utils/common'
import { debounce } from '@/utils/lodash-lite'
import { retryQueue } from '@/utils/retry-queue'
import { isInsidePreviewFrame } from '@/utils/preview-frame'
import { videoStyles } from '@/shared/styles/video-page'
import { EVENT_NAMES, STORAGE_KEYS } from '@/shared/constants'
import { isBangumiPage } from '@/utils/page-type'
import type { LogLevel } from '@/services/logger.service'
import { playerModeFeatures } from './player-mode'
import { progressMemoryFeatures } from './progress-memory'
import { adSkipFeatures } from './ad-skip'
import { subtitleFeatures } from './subtitle'
import { commentFeatures } from './comment'
import { fishPondFeatures } from '@/features/fish-pond'
import { qualityFeatures } from './quality'
import { webfullFeatures } from './webfull'
import { uiButtonsFeatures } from './ui-buttons'
import { upSpacePopupFeatures } from './up-space-popup'
import { videoRotateFeatures } from './video-rotate'
import { initProgressSegmentTint, disposeProgressSegmentTint } from './progress-segments'
import { FeatureScheduler, type FeatureDefinition } from '@/shared/feature-scheduler'
const logger = new LoggerService('VideoModule')
const settingsComponent = new SettingsDialogHost()
/**
 * 视频模块实例契约：本对象的字段 + 展开的各 feature 提供的字段/方法。
 * 各 feature 内部用 `this: XxxContext` 声明的成员，必须在这里被覆盖到。
 */
interface VideoModuleContext {
    name: string
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
    _advertisementIdentifiedTimer?: ReturnType<typeof setTimeout> | null
    _skipCacheAppliedTimer?: ReturnType<typeof setTimeout> | null
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
    releaseScrollLockIfNoPlayer: () => void
    initSubtitleStateMemory: () => void
    registSettings: () => Promise<void>
    initEventListeners: () => Promise<void>
    observePlayerScreenMode: (container: Element) => void
    initMonitors: () => void
    initRemoteConfigSync: () => void
    initPlaybackMemory: () => void
    destroyPlaybackMemory: () => void
    autoSelectPlayerMode: () => Promise<unknown>
    autoLocateToPlayer: () => Promise<void>
    recordNaturalPlayerOffset: () => Promise<void>
    locateToPlayer: () => Promise<void>
    guardEpisodeSwitchClicks: () => void
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
    /** 刷新侧栏「UP主空间」头像（切视频后作者会变） */
    refreshUpAvatar: () => Promise<void>
    /** 点头像进 UP 主空间 */
    openUpSpaceByAvatar: (button: HTMLElement | null) => void
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
    /** 监听评论区插入（大肥鱼识别） */
    observeFishComments: () => void
    scheduleFishScan: () => void
    refreshFishPond: () => Promise<void>
    openFishPond: () => void
    /** 「鱼塘」按钮按需显示（仅在本页命中大肥鱼评论时出现） */
    syncFishPondButton: (visible: boolean) => void
    _fishObservationCleanups?: Array<() => void>
    /** 上一轮观察器登记的模块级兜底清理（重挂时先回收，避免 _cleanup 无界增长） */
    _fishObservationCleanupEntry?: (() => void) | null
    _fishDebounceTimer?: ReturnType<typeof setTimeout> | null
    destroyUpSpacePopup: () => void
    openUpSpace: (mid: string | number) => Promise<void>
    openUpSpacePopup: (mid: string | number) => Promise<void>
    _writePlaybackPosition: (entry: unknown, key?: string) => void
    _getPlaybackKey: () => string
    /** 统一调度器（首次使用时创建，按代次派发播放页功能） */
    _scheduler?: FeatureScheduler | null
    /** 模式切换没发事件时的兜底定时器（兜底只触发定位，不重复派发功能） */
    _modeFallbackTimer?: ReturnType<typeof setTimeout> | null
    /** 最近一次真正执行过定位的调度代次与播放器模式（用于「同代次同模式只定位一次」） */
    _locateGeneration?: number
    _locateMode?: string
    /** 其余功能是否已在本代次启动（模式+定位完成后启动一次） */
    _featuresStarted?: boolean
    ensureFeatureScheduler: () => FeatureScheduler
    handlePlayerReady: () => void
    handleModeSelected: () => void
}
/**
 * 播放页功能声明表 —— 统一调度的唯一入口（2026-10-31）
 *
 * 三条车道：
 * - instant：纯 DOM 操作，并行执行，单项 300ms 超时，互不等待；
 * - interactive：模式切换 / 定位这类会改变页面几何的动作，独占且带超时；
 * - background：网络与 IO（选集解锁、跳过片段缓存、AI 识别），排队执行，谁都不等它。
 *
 * `when` 在派发时求值（而不是建表时），用户中途改设置能立即生效。
 */
/**
 * 播放页功能清单（审查 W10：导出供测试断言「哪些功能在哪个车道」）
 *
 * 车道划分是行为契约：instant 里放网络/长轮询会让启动变慢，
 * interactive 里放会阻塞模式切换与定位，所以用用例锁住 id 集合。
 */
export const buildVideoFeatureDefinitions = (ctx: VideoModuleContext): FeatureDefinition[] => {
    const on = (key: string): boolean => Boolean((ctx.userConfigs as Record<string, unknown> | null | undefined)?.[key])
    const isVideo = (): boolean => ctx.userConfigs?.page_type === 'video'
    const isBangumi = (): boolean => ctx.userConfigs?.page_type === 'bangumi'
    /**
     * ⚠️ 2026-10-31 审查（C4）：「有没有播放器标题」是**异步探测结果**（`hasPlayerTitle()`，命中缓存后零成本），
     * 而 `when` 是同步谓词，且调度器在派发前一次性求值全部 `when` —— 那一刻 `_playerTitleCache` 恒为 undefined，
     * 于是 `unlock-episode-selector` / `skip-cache-video` / `identify-ads` 三条后台功能**永不派发**。
     * 现在把探测下沉进 run 内部，`when` 只保留纯配置判据。
     */
    const runUnlessPlayerTitle = (run: () => Promise<void> | void): (() => Promise<void>) => async () => {
        if (await ctx.hasPlayerTitle()) return
        await run()
    }
    /**
     * 同一代次 + 同一播放器模式只定位一次
     *
     * 触发源有三个：模式切换成功的事件、切换失败 6s 兜底、重试成功。
     * 三次都无条件跑就会「先按旧几何定位、切换成功后又定位一次」——用户看到的是反复上移。
     * 但只要**模式真的变了**（normal → wide），就必须允许再定位一次，否则会停在旧几何上。
     */
    /**
     * 「模式切换 → 定位」全部走完，才启动其余功能（用户 2026-10-31 明确要求的顺序）
     *
     * 每代次只启动一次：定位可能因模式变化再跑一次（normal → wide），不能连带把即时功能重跑一遍。
     */
    const startRemainingFeatures = (): void => {
        if (ctx._featuresStarted) return
        ctx._featuresStarted = true
        void ctx._scheduler?.trigger('features:ready').then(summary => {
            logger.info(`功能调度丨其余功能 即时 ${summary.instant.ok}/${summary.instant.total} 后台 ${summary.backgroundQueued}（${summary.ms}ms）`)
        })
    }
    const runLocateOnce = (): Promise<void> => {
        const scheduler = ctx._scheduler ?? null
        const generation = scheduler?.generation ?? 0
        const mode = elementSelectors.get('playerContainer')?.getAttribute('data-screen') ?? '-'
        if (ctx._locateGeneration === generation && ctx._locateMode === mode) {
            logger.info(`自动定位丨本次加载已在「${mode}」模式下定位过，跳过重复触发`)
            return Promise.resolve()
        }
        return Promise.resolve(ctx.autoLocateToPlayer()).then(() => {
            const finalMode = elementSelectors.get('playerContainer')?.getAttribute('data-screen') ?? mode
            ctx._locateGeneration = generation
            ctx._locateMode = finalMode
        })
    }
    return [
        // ---- instant / player:ready ----
        { id: 'click-auto-locate', lane: 'instant', trigger: 'player:ready', when: () => on('click_player_auto_locate'), run: () => ctx.clickPlayerAutoLocate() },
        { id: 'cancel-mute', lane: 'instant', trigger: 'player:ready', when: () => on('auto_cancel_mute'), run: () => ctx.autoCancelMute() },
        { id: 'video-rotate', lane: 'instant', trigger: 'features:ready', run: () => ctx.initVideoRotate() },
        { id: 'guard-episode-switch', lane: 'instant', trigger: 'features:ready', run: () => ctx.guardEpisodeSwitchClicks() },
        { id: 'hi-res', lane: 'instant', trigger: 'features:ready', when: () => on('is_vip') && on('auto_hi_res'), run: () => ctx.autoEnableHiResMode() },
        { id: 'highest-quality', lane: 'instant', trigger: 'features:ready', when: () => on('auto_select_video_highest_quality'), run: () => ctx.autoSelectVideoHighestQuality() },
        { id: 'webfull-unlock', lane: 'instant', trigger: 'features:ready', when: () => on('webfull_unlock') && ctx.userConfigs?.selected_player_mode === 'web' && isVideo(), run: () => ctx.webfullPlayerModeUnlock() },
        { id: 'subtitle-switch', lane: 'instant', trigger: 'features:ready', run: () => ctx.insertAutoEnableSubtitleSwitchButton() },
        { id: 'auto-subtitle', lane: 'instant', trigger: 'features:ready', when: () => on('auto_subtitle'), run: () => ctx.autoEnableSubtitle(true) },
        { id: 'pause-on-tab-switch', lane: 'instant', trigger: 'features:ready', when: () => on('pause_video'), run: () => ctx.handleVideoPauseOnTabSwitch() },
        { id: 'comment-elements', lane: 'instant', trigger: 'features:ready', run: () => ctx.doSomethingToCommentElements() },
        // ---- interactive ----
        { id: 'player-mode', lane: 'interactive', trigger: 'player:ready', timeoutMs: 6000, run: () => ctx.autoSelectPlayerMode() },
        // 定位内部预算是「稳态等待 ≤1.5s + 6×300ms 重试 + 8 次校验循环」约 10s，超时值必须与之一致，
        // 否则日志把定位记成 timeout、页面却在几秒后才滚到位（审查 W5）
        {
            id: 'locate',
            lane: 'interactive',
            trigger: 'mode:selected',
            timeoutMs: 12000,
            // 侧栏按钮改成「定位完成之后再插」：实测 B 站侧栏容器的 children 由 React 管理，
            // 在切宽屏/水合期间插进去的节点会被整段替换掉；等定位结束（布局已稳定）再插，
            // 节点能稳稳留下来。成功/跳过/超时都要插，否则某条路径上按钮就永远不出现。
            run: async () => {
                try {
                    await runLocateOnce()
                } finally {
                    void ctx.insertSideFloatNavToolsButtons()
                    startRemainingFeatures()
                }
            }
        },
        // ---- background / player:ready（网络与 IO，谁都不等它） ----
        { id: 'description-to-comment', lane: 'background', trigger: 'features:ready', when: () => on('insert_video_description_to_comment') && isVideo(), run: () => ctx.insertVideoDescriptionToComment() },
        { id: 'unlock-episode-selector', lane: 'background', trigger: 'features:ready', run: runUnlessPlayerTitle(() => ctx.unlockEpisodeSelector()) },
        { id: 'skip-cache-video', lane: 'background', trigger: 'features:ready', when: () => on('auto_skip') && isVideo(), run: runUnlessPlayerTitle(() => ctx.loadCachedSkipSegments()) },
        { id: 'identify-ads', lane: 'background', trigger: 'features:ready', when: () => on('auto_skip') && on('ai_auto_identify') && isVideo(), run: runUnlessPlayerTitle(() => ctx.identifyAdvertisementTimestamps()) },
        { id: 'skip-cache-bangumi', lane: 'background', trigger: 'features:ready', when: () => on('auto_skip') && isBangumi(), run: () => ctx.loadCachedSkipSegments() },
        // 鱼塘扫描会为评论判分（联网），不能占即时车道（审查 W6）
        { id: 'fish-comments', lane: 'background', trigger: 'features:ready', when: isVideo, run: () => ctx.observeFishComments() }
    ]
}
export default {
    name: 'video',
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
        // 设置弹窗宿主：释放 Vue 实例与 resize/nav 监听（2026-10-23 审查发现）
        settingsComponent.destroy()
        // 重试队列是模块级单例：卸载后必须清空，否则旧模块的闭包会在新页面继续写 DOM
        retryQueue.clear()
        // 进度条染色：断开观察器/定时器/video 监听（审查 W8：此前这些永不解绑）
        disposeProgressSegmentTint()
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
        if (this._advertisementIdentifiedTimer) clearTimeout(this._advertisementIdentifiedTimer)
        if (this._skipCacheAppliedTimer) clearTimeout(this._skipCacheAppliedTimer)
        if (this._descriptionWatchdog) clearTimeout(this._descriptionWatchdog)
        if (this._descriptionFallbackTimer) clearTimeout(this._descriptionFallbackTimer)
        this._descriptionFeedWaitStop?.()
        this._descriptionRunToken = (this._descriptionRunToken || 0) + 1
        if (this._pauseVideoCleanup) this._pauseVideoCleanup()
        // ⚠️ 2026-10-31 审查（W4）：兜底定时器与调度器必须在这里失效 —— 否则 SPA 换页卸载 8s 后
        // 仍会触发已卸载实例的定位（会锁 body overflow 并 scrollTo），且在跑的后台任务还会继续写 DOM
        if (this._modeFallbackTimer) {
            clearTimeout(this._modeFallbackTimer)
            this._modeFallbackTimer = null
        }
        if (this._scheduler) {
            this._scheduler.bumpGeneration()
            this._featuresStarted = false
            this._scheduler = null
        }
    },
    async preFunctions (this: VideoModuleContext): Promise<void> {
        // 预览窗口（首页视频预览的 iframe）里**视频模块完全不介入播放页**：播放页在这里只是"播放器宿主"，
        // 而模块的页面级自动化（屏幕模式切换、网页全屏解锁、页面滚动锁定、进度记忆…）会跟预览自己的
        // 网页全屏和交互打架 —— 2026-09-25 实测：预览进网页全屏约 3 秒后被"屏幕模式"自动化切成宽屏/正常，
        // 于是画面退出满屏。标记由父页面打在预览 iframe 上（见 utils/preview-frame）。
        if (isInsidePreviewFrame()) {
            logger.debug('预览窗口丨视频模块不介入播放页')
            return
        }
        await storageService.userSet('page_type', isBangumiPage(location.pathname) ? 'bangumi' : 'video')
        await sleep(300)
        this.userConfigs = await storageService.getAll('user') as Record<string, unknown>
        logger.debug('播放进度诊断丨userConfigs 已加载, playback_memory=' + this.userConfigs?.playback_memory)
        // ⚠️ 2026-10-31：**不再**在初始化阶段给 body 挂 overflow:hidden。
        // 实测（用户真机多次复现）：锁滚动会把 B 站头部/评论区停在水合前的空白态，
        // 表现为「主导航变空 + 功能像被突然打断」，而解锁又依赖事件时序（模式切换失败时尤其危险）。
        // 定位过程中的防抖已由 scroll-guard 的 holdScrollPosition 承担，不需要整页锁滚动。
        this.releaseScrollLockIfNoPlayer()
        await this.registSettings()
        await this.initEventListeners()
        // 记录「播放器自然位置」（设置项「播放器顶部偏移」说明里显示的那个数字，随分辨率/窗口宽度变化）。
        // 它内部等布局稳定并复测，不能挡在自动定位前面，所以不 await（内部已兜住异常）
        void this.recordNaturalPlayerOffset()
        // 官方进度条上给「跳过片段」区间染色（等待进度条出现后自行挂载，幂等）
        initProgressSegmentTint()
        this.initMonitors()
        this.initRemoteConfigSync()
        this.initPlaybackMemory()
    },
    /**
     * 滚动锁安全网。
     *
     * 背景：页型判定可能命中「是播放页、但页面上没有播放器」的页面（活动视频页判据是按路径走的，
     * 将来热更扩到别的活动路径时可能出现这种情况）。此时没有 video 元素 → 不会触发
     * 「可播放 → 选模式 → 定位」流程 → 定位里那句「先解锁」也就永远不会执行，
     * preFunctions 注入的 `body{overflow:hidden}` 会把整页锁死、用户滚不动。
     * 所以超时后若仍找不到播放器，就主动把这把锁解开（有播放器的正常页面不受影响）。
     */
    releaseScrollLockIfNoPlayer (this: VideoModuleContext): void {
        const timer = window.setTimeout(() => {
            const hasPlayer = elementSelectors.get('playerContainer') || elementSelectors.get('video')
            if (hasPlayer) return
            logger.warn('页面未找到播放器，已解除滚动锁定（避免整页无法滚动）')
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
        }, 8000)
        this._cleanup.push(() => window.clearTimeout(timer))
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
                        const player = elementSelectors.get('player')
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
    ensureFeatureScheduler (this: VideoModuleContext): FeatureScheduler {
        if (!this._scheduler) {
            this._scheduler = new FeatureScheduler(buildVideoFeatureDefinitions(this), {
                onRecord: record => logger.debug(`功能调度丨${record.id}（${record.lane}）${record.status} ${record.ms}ms`)
            })
        }
        return this._scheduler
    },
    /**
     * 视频可播放：开新代次并派发「就绪」阶段功能
     *
     * 功能之间不再互相等待：即时车道并行跑、模式切换独占、网络排队。
     */
    handlePlayerReady (this: VideoModuleContext): void {
        const scheduler = this.ensureFeatureScheduler()
        scheduler.bumpGeneration()
        // 新代次：其余功能还没启动（等「模式 + 定位」都完成后再由 startRemainingFeatures 放行）
        this._featuresStarted = false
        void scheduler.trigger('player:ready').then(summary => {
            logger.info(`功能调度丨就绪阶段 即时 ${summary.instant.ok}/${summary.instant.total} 交互 ${summary.interactive.total} 后台 ${summary.backgroundQueued}（${summary.ms}ms）`)
        })
        // 看门狗：8s 内没收到「模式已选定」说明事件链断了。**只报警、不兜底触发**——
        // 盲触发会在模式切换完成前先按旧几何定位一次，正是用户反馈的「定位两次、先成功又上移」。
        // 切换成功、失败 6s 兜底、重试成功这三个真实触发点任一发生都会走到定位。
        if (this._modeFallbackTimer) clearTimeout(this._modeFallbackTimer)
        this._modeFallbackTimer = setTimeout(() => {
            this._modeFallbackTimer = null
            const mode = elementSelectors.get('playerContainer')?.getAttribute('data-screen') ?? '-'
            logger.warn(`自动定位丨等待模式切换超过 8s（当前模式=${mode}），未收到「模式已选定」事件；不兜底触发，避免按旧布局定位`)
        }, 8000)
    },
    /** 播放器模式已选定：触发「模式选中」阶段（定位） */
    handleModeSelected (this: VideoModuleContext): void {
        if (this._modeFallbackTimer) {
            clearTimeout(this._modeFallbackTimer)
            this._modeFallbackTimer = null
        }
        void this.ensureFeatureScheduler().trigger('mode:selected')
    },
    async initEventListeners (this: VideoModuleContext): Promise<void> {
        this._cleanup.push(eventBus.on(EVENT_NAMES.LOGGER_SHOW, (_ctx, ...args: unknown[]) => {
            const { type, message } = (args[0] ?? {}) as { type?: string; message?: string }
            const level = type as LogLevel | undefined
            if (level && typeof logger[level] === 'function') logger[level](message as string)
        }))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_CANPLAYTHROUGH, debounce(() => this.handlePlayerReady(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.on(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED, debounce(() => this.handleModeSelected(), 0, { 'leading': true, 'trailing': false })))
        this._cleanup.push(eventBus.once(EVENT_NAMES.VIDEO_WEBFULL_PLAYER_MODE_UNLOCK, debounce(this.insertLocateToCommentButton, 500, { 'leading': true, 'trailing': false })))
        this.autoReapplyUnlockOnFullscreenExit()
        // 监听播放器模式变化，记录用户手动切换的模式
        this._lastPlayerMode = (this.userConfigs?.selected_player_mode || 'normal') as string
        elementSelectors.wait('playerContainer').then(container => {
            if (!container) return
            this.observePlayerScreenMode(container)
        })
    },
    /**
     * 监听播放器屏幕模式（data-screen）变化
     *
     * 每次只保留**一个**观察者：切集时旧观察者不 disconnect 会无界累积
     * （看 50 个视频 = 50 个观察器同时监听同一个容器，重复触发解锁逻辑）（2026-10-23 审查发现）
     */
    observePlayerScreenMode (this: VideoModuleContext, container: Element): void {
        this._modeObservers?.forEach(observer => observer.disconnect())
        this._modeObservers = []
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
            insertStyleToDocument({ 'VideoPageAdjustmentStyle': videoStyles.VideoPageAdjustment, 'VideoSettingsStyle': videoStyles.VideoSettings })
            ;(async () => this.checkVideoCanplaythrough(await elementSelectors.wait('video') as HTMLVideoElement | null))()
        } else {
            this._cleanup.push(isTabActive({
                onActiveChange: async isActive => {
                    if (isActive) {
                        logger.info('标签页｜已激活')
                        insertStyleToDocument({ 'VideoPageAdjustmentStyle': videoStyles.VideoPageAdjustment, 'VideoSettingsStyle': videoStyles.VideoSettings })
                        this.checkVideoCanplaythrough(elementSelectors.get('video') as HTMLVideoElement | null)
                    }
                },
                immediate: true,
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
        // 无论是否等到就绪都要派发：该事件是功能调度唯一的启动开关，等不到就绪时若不发，
        // 整条功能链就会永远不执行（2026-10-31：改为「超时也派发」，由各功能自己容错等元素）
        if (emit) {
            eventBus.emit(EVENT_NAMES.VIDEO_CANPLAYTHROUGH)
            if (canplaythrough) logger.info('视频资源｜可以播放')
            else logger.warn('视频资源丨等待可播放超时（5s），仍派发功能（各功能自行等待元素）')
        }
        return canplaythrough
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
        if (elementSelectors.get('playerTitle')) {
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
            checkInterval: 1000
        })
        this._pauseVideoCleanup = tabState
        return () => {
            tabState()
        }
    },
    async handleHrefChangedFunctionsSequentially (this: VideoModuleContext): Promise<void> {
        // 切换视频前保存旧视频的播放进度（URL 已变化，用缓存的旧 key 写入）
        const entry = this._playbackLastVideo || {
            video: elementSelectors.get('video'),
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
            const video = elementSelectors.get('video') as HTMLVideoElement | null
            if (video) {
                video.style.transform = ''
                video.style.transformOrigin = ''
            }
        }
        // 重新绑定播放器模式观察器（SPA 导航后元素可能被替换）
        elementSelectors.wait('playerContainer').then(container => {
            if (!container) return
            this.observePlayerScreenMode(container)
        })
        // 其余功能统一交给调度器：等新视频可播放后开新代次派发（不再串行 await 网络/定位）
        void this.checkVideoCanplaythrough(elementSelectors.get('video') as HTMLVideoElement | null, true)
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
    ...fishPondFeatures,
    ...videoRotateFeatures
}
