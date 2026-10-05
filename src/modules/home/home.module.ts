import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { executeFunctionsSequentially, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { styles } from '@/shared/styles'
import { homeHistoryFeatures } from './history'
import { homePaidMarkFeatures } from './paid-mark'
import { homeVideoPreviewFeatures } from './video-preview'
import type { HomeVideoPreviewContext } from './video-preview'
import { insertHomeSettingsButton, removeHomeSettingsButton } from './settings-button'
import { SettingsDialogHost } from '@/components/settings-dialog'
const logger = new LoggerService('HomeModule')
/** 设置弹窗宿主：首页也挂一个（复用播放页那套 schema，首页功能开关都在里面） */
const settingsComponent = new SettingsDialogHost()
/** 首页模块实例上下文（名与方法由本对象与展开的 features 提供） */
interface HomeModuleContext extends HomeVideoPreviewContext {
    name: string
    version: string
    _cleanup: Array<() => void>
    _historyListClickBound?: boolean
    _historySearchCleanup?: (() => void) | null
    preFunctions: () => Promise<void>
    handleExecuteFunctionsSequentially: () => void
    initEventListeners: () => Promise<void>
    setRecordRecommendVideoHistory: () => Promise<void>
    markRecommendVideoPaidStatus: () => Promise<void>
    generatorIndexRecommendVideoHistoryContents: () => Promise<void>
    insertIndexRecommendVideoHistoryPopover: () => Promise<void>
    initSettingsEntry: () => Promise<void>
    handleHomeConfigChanged: (key: string, value: unknown) => Promise<void>
}
export default {
    name: 'home',
    version: '3.38.1',
    ...homeHistoryFeatures,
    ...homePaidMarkFeatures,
    ...homeVideoPreviewFeatures,
    async install (this: HomeModuleContext): Promise<void> {
        this._cleanup = []
        this._cleanup.push(eventBus.on(EVENT_NAMES.APP_READY, async () => {
            logger.info('首页模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall (this: HomeModuleContext): Promise<void> {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        this._historyListClickBound = false
        this._historySearchCleanup?.()
        document.getElementById('indexRecommendVideoHistoryOpenButton')?.remove()
        const historyPopover = document.getElementById('indexRecommendVideoHistoryPopover') as
            (HTMLElement & { __popoverDismissCleanup?: () => void }) | null
        historyPopover?.__popoverDismissCleanup?.()
        historyPopover?.remove()
        // 视频预览：销毁弹窗/观察者并清掉注入的按钮
        this.destroyVideoPreview()
        document.querySelectorAll('.adj-video-preview-btn').forEach(el => el.remove())
        // 设置入口与设置弹窗一并清理（弹窗是懒创建的，存在才需要移除）
        removeHomeSettingsButton()
        document.getElementById('VideoSettingsPopover')?.remove()
        insertStyleToDocument({ 'IndexAdjustmentStyle': '' })
    },
    async preFunctions (this: HomeModuleContext): Promise<void> {
        this.userConfigs = await storageService.getAll('user') as Record<string, unknown>
        if (document.visibilityState === 'visible') {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'IndexAdjustmentStyle': styles.IndexAdjustment })
            this.handleExecuteFunctionsSequentially()
            await this.initEventListeners()
            await this.initSettingsEntry()
        }
    },
    /** 首页的设置入口：右下角悬浮按钮组里插一颗图标按钮，点击开与播放页同一套设置弹窗 */
    async initSettingsEntry (this: HomeModuleContext): Promise<void> {
        // 首页没有自己的 schema，显式按播放页渲染（首页功能开关都在那套 schema 里）
        await settingsComponent.init(this.userConfigs, { pageType: 'video' })
        insertHomeSettingsButton(() => { void settingsComponent.openSettings() })
        // 开关即时生效：设置弹窗里改完立刻作用于当前页面，不必刷新首页
        this._cleanup.push(eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, ...args: unknown[]) => {
            const { key, value } = (args[0] ?? {}) as { key?: string, value?: unknown }
            if (key) void this.handleHomeConfigChanged(key, value)
        }))
        logger.debug('首页设置入口丨已就绪')
    },
    /** 首页功能相关的配置变更（目前只有视频预览开关需要即时生效） */
    async handleHomeConfigChanged (this: HomeModuleContext, key: string, value: unknown): Promise<void> {
        if (key !== 'home_video_preview') return
        this.userConfigs[key] = value
        if (value) {
            await this.initVideoPreview()
            logger.info('首页视频预览丨已开启')
            return
        }
        this.destroyVideoPreview()
        document.querySelectorAll('.adj-video-preview-btn').forEach(el => el.remove())
        logger.info('首页视频预览丨已关闭')
    },
    async initEventListeners (this: HomeModuleContext): Promise<void> {
        const indexRecommendVideoRollButton = await elementSelectors.wait('indexRecommendVideoRollButton')
        const cleanup = addEventListenerToElement(indexRecommendVideoRollButton, 'click', async () => {
            await executeFunctionsSequentially([
                () => this.setRecordRecommendVideoHistory(),
                () => this.markRecommendVideoPaidStatus(),
                () => this.generatorIndexRecommendVideoHistoryContents()
            ])
        })
        this._cleanup.push(cleanup)
    },
    handleExecuteFunctionsSequentially (this: HomeModuleContext): void {
        const functions = [
            // 按钮插入提前并与其他功能并行，避免等记录完成才出现
            () => this.insertIndexRecommendVideoHistoryPopover(),
            () => this.setRecordRecommendVideoHistory(),
            () => this.markRecommendVideoPaidStatus(),
            // 视频预览按钮（功能关闭时内部直接返回，不产生任何 DOM/监听）
            () => this.initVideoPreview()
        ]
        executeFunctionsSequentially(functions, { concurrency: 3 })
    }
}
