/**
 * 「大肥鱼」识别主流程：监听评论区插入 → 扫描 → 按开关移除
 *
 * 判定与移除都在 `collect.ts`，这里只负责「什么时候跑」：
 * 评论是懒加载 + 分页的，只能靠 `observeInsertion` 跟着 B 站自己的插入节奏走。
 */
import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { shadowDomSelectors } from '@/shared/element-selectors'
import { countCommentRenderers, hideFishComments, restoreFishComments, scanFishComments } from './collect'
import { openFishPondDialog } from './dialog'
const logger = new LoggerService('VideoModule')
const shadowDOMHelper = new ShadowDOMHelper()
/** 评论连续插入时的合并窗口：一批插入只扫一次 */
const SCAN_DEBOUNCE_MS = 600
/** 等 #feed 出现的轮询间隔（评论懒加载，首屏只有 spinner） */
const FEED_POLL_MS = 500
/** 评论数量签名的轮询间隔：数量变了才重扫（楼层/楼中楼各自在 shadow root 里插入） */
const SIGNATURE_POLL_MS = 3000
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface FishPondContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _fishObservationCleanups?: Array<() => void>
    _fishDebounceTimer?: ReturnType<typeof setTimeout> | null
    scheduleFishScan: () => void
    refreshFishPond: () => Promise<void>
}
export const fishPondFeatures = {
    /**
     * 监听评论区的插入
     *
     * 每次调用先释放上一轮的观察器（SPA 切换视频时评论区会被整体替换），
     * 否则多套观察器叠加会让同一批评论被反复扫描。
     */
    observeFishComments (this: FishPondContext): void {
        this._fishObservationCleanups?.forEach(cleanup => cleanup())
        const cleanups: Array<() => void> = []
        this._fishObservationCleanups = cleanups
        this._cleanup.push(() => {
            cleanups.forEach(cleanup => cleanup())
            cleanups.splice(0)
            this._fishObservationCleanups = []
        })
        let timer: ReturnType<typeof setTimeout> | null = null
        cleanups.push(() => { if (timer) clearTimeout(timer) })
        let attached = false
        let signature = -1
        const tick = (): void => {
            timer = null
            if (!this.userConfigs.catch_fish) {
                restoreFishComments()
                timer = setTimeout(tick, SIGNATURE_POLL_MS)
                return
            }
            if (document.hidden) {
                timer = setTimeout(tick, SIGNATURE_POLL_MS)
                return
            }
            const feed = shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
            if (!feed) {
                timer = setTimeout(tick, FEED_POLL_MS)
                return
            }
            const count = countCommentRenderers()
            if (!attached || count !== signature) {
                attached = true
                this.scheduleFishScan()
            }
            signature = count
            timer = setTimeout(tick, SIGNATURE_POLL_MS)
        }
        tick()
    },
    /** 合并短时间内的多次插入，避免一屏 20 条评论触发 20 次扫描 */
    scheduleFishScan (this: FishPondContext): void {
        if (this._fishDebounceTimer) clearTimeout(this._fishDebounceTimer)
        this._fishDebounceTimer = setTimeout(() => {
            this._fishDebounceTimer = null
            void this.refreshFishPond()
        }, SCAN_DEBOUNCE_MS)
    },
    /**
     * 扫描一次并移除命中评论（「捞鱼」关着时直接返回，不扫也不动 DOM）
     */
    async refreshFishPond (this: FishPondContext): Promise<void> {
        if (!this.userConfigs.catch_fish) return
        try {
            const scan = await scanFishComments()
            if (!scan.items.length) return
            const hidden = hideFishComments(scan.items)
            logger.debug(`大肥鱼丨识别 ${scan.items.length} 条，本次移除 ${hidden} 条`)
        } catch (error) {
            logger.error('大肥鱼丨扫描失败:', error)
        }
    },
    /** 侧栏「鱼塘」按钮入口 */
    openFishPond (): void {
        openFishPondDialog()
    }
}
