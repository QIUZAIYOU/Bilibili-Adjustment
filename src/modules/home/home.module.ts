import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { executeFunctionsSequentially, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { styles } from '@/shared/styles'
import { homeHistoryFeatures } from './history'
import { homePaidMarkFeatures } from './paid-mark'
const logger = new LoggerService('HomeModule')
/** 首页模块实例上下文（名与方法由本对象与展开的 features 提供） */
interface HomeModuleContext {
    name: string
    version: string
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
}
export default {
    name: 'home',
    version: '3.35.1',
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
        this._historyListClickBound = false
        this._historySearchCleanup?.()
        document.getElementById('indexRecommendVideoHistoryOpenButton')?.remove()
        const historyPopover = document.getElementById('indexRecommendVideoHistoryPopover') as
            (HTMLElement & { __popoverDismissCleanup?: () => void }) | null
        historyPopover?.__popoverDismissCleanup?.()
        historyPopover?.remove()
        insertStyleToDocument({ 'IndexAdjustmentStyle': '' })
    },
    async preFunctions (this: HomeModuleContext): Promise<void> {
        this.userConfigs = await storageService.getAll('user') as Record<string, unknown>
        if (document.visibilityState === 'visible') {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'IndexAdjustmentStyle': styles.IndexAdjustment })
            this.handleExecuteFunctionsSequentially()
            await this.initEventListeners()
        }
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
        executeFunctionsSequentially(functions, { concurrency: 3 })
    }
}
