import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { executeFunctionsSequentially, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { homeStyles } from '@/shared/styles/home-page'
import { homeHistoryFeatures } from './history'
import { homePaidMarkFeatures } from './paid-mark'
import { insertHomeSettingsButton, removeHomeSettingsButton } from './settings-button'
import { retryQueue } from '@/utils/retry-queue'
import { SettingsDialogHost } from '@/components/settings-dialog'
const logger = new LoggerService('HomeModule')
/** 设置弹窗宿主：首页也挂一个（复用播放页那套 schema，首页功能开关都在里面） */
const settingsComponent = new SettingsDialogHost()
/** 首页模块实例上下文（名与方法由本对象与展开的 features 提供） */
interface HomeModuleContext {
    name: string
    userConfigs: Record<string, unknown>
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
}
export default {
    name: 'home',
    ...homeHistoryFeatures,
    ...homePaidMarkFeatures,
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
        // 设置弹窗宿主：释放 Vue 实例与 resize/nav 监听（2026-10-23 审查发现）
        settingsComponent.destroy()
        // 重试队列是模块级单例：卸载后必须清空，否则旧模块的闭包会在新页面继续写 DOM
        retryQueue.clear()
        this._historyListClickBound = false
        this._historySearchCleanup?.()
        document.getElementById('indexRecommendVideoHistoryOpenButton')?.remove()
        const historyPopover = document.getElementById('indexRecommendVideoHistoryPopover') as
            (HTMLElement & { __popoverDismissCleanup?: () => void }) | null
        historyPopover?.__popoverDismissCleanup?.()
        historyPopover?.remove()
        // 设置入口与设置弹窗一并清理（弹窗是懒创建的，存在才需要移除）
        removeHomeSettingsButton()
        document.getElementById('VideoSettingsPopover')?.remove()
        insertStyleToDocument({ 'IndexAdjustmentStyle': '' })
    },
    async preFunctions (this: HomeModuleContext): Promise<void> {
        this.userConfigs = await storageService.getAll('user') as Record<string, unknown>
        // 冷启动（浏览器刚打开／恢复会话）时标签页可能尚不可见，旧实现直接整段跳过且无补救，
        // 表现为「首次打开首页功能不生效、刷新后才正常」。改为等到可见再执行一次。
        if (document.visibilityState !== 'visible') {
            logger.info('首页模块｜标签页不可见，等待可见后执行')
            await new Promise<void>(resolve => {
                const onVisible = (): void => {
                    if (document.visibilityState !== 'visible') return
                    document.removeEventListener('visibilitychange', onVisible)
                    resolve()
                }
                document.addEventListener('visibilitychange', onVisible)
                this._cleanup.push(() => document.removeEventListener('visibilitychange', onVisible))
            })
        }
        logger.info('标签页｜已激活')
        insertStyleToDocument({ 'IndexAdjustmentStyle': homeStyles.IndexAdjustment })
        this.handleExecuteFunctionsSequentially()
        await this.initEventListeners()
        await this.initSettingsEntry()
    },
    /** 首页的设置入口：右下角悬浮按钮组里插一颗图标按钮，点击开与播放页同一套设置弹窗 */
    async initSettingsEntry (this: HomeModuleContext): Promise<void> {
        // 首页没有自己的 schema，显式按播放页渲染（首页功能开关都在那套 schema 里）
        await settingsComponent.init(this.userConfigs, { pageType: 'video' })
        insertHomeSettingsButton(() => { void settingsComponent.openSettings() })
        logger.debug('首页设置入口丨已就绪')
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
            () => this.markRecommendVideoPaidStatus()
        ]
        // 与播放页一致：每批结束后 drain 一次，让 register 的重试任务尽早获得机会
        executeFunctionsSequentially(functions, { concurrency: 3, onAfterChunk: () => retryQueue.drain() })
    }
}
