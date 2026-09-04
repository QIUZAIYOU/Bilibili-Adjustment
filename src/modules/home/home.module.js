import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { executeFunctionsSequentially, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { stylesV2 } from '@/shared/styles'
import { homeHistoryFeatures } from './history'
import { homePaidMarkFeatures } from './paid-mark'
const logger = new LoggerService('HomeModule')
export default {
    name: 'home',
    version: '3.23.4',
    ...homeHistoryFeatures,
    ...homePaidMarkFeatures,
    async install () {
        this._cleanup = []
        this._cleanup.push(eventBus.on(EVENT_NAMES.APP_READY, async () => {
            logger.info('首页模块｜已加载')
            await this.preFunctions()
        }))
    },
    async uninstall () {
        this._cleanup?.forEach(cleanup => cleanup())
        this._cleanup = []
        this._historyListClickBound = false
        this._historySearchCleanup?.()
        document.getElementById('indexRecommendVideoHistoryOpenButton')?.remove()
        const historyPopover = document.getElementById('indexRecommendVideoHistoryPopover')
        historyPopover?.__popoverDismissCleanup?.()
        historyPopover?.remove()
        insertStyleToDocument({ 'IndexAdjustmentStyle': '' })
    },
    async preFunctions () {
        this.userConfigs = await storageService.getAll('user')
        if (document.visibilityState === 'visible') {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'IndexAdjustmentStyle': stylesV2.IndexAdjustment })
            this.handleExecuteFunctionsSequentially()
            await this.initEventListeners()
        }
    },
    async initEventListeners () {
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
    handleExecuteFunctionsSequentially () {
        const functions = [
            // 按钮插入提前并与其他功能并行，避免等记录完成才出现
            () => this.insertIndexRecommendVideoHistoryPopover(),
            () => this.setRecordRecommendVideoHistory(),
            () => this.markRecommendVideoPaidStatus()
        ]
        executeFunctionsSequentially(functions, { concurrency: 3 })
    }
}
