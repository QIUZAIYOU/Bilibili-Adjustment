/**
 * 「大肥鱼」识别主流程：跟着评论区的插入节奏扫描 → 按开关移除
 *
 * 判定与移除都在 `collect.ts`，这里只负责「什么时候跑」。
 * 性能取向（评论区是懒加载 + 分页 + B 站频繁重渲染，不能靠固定轮询跟进）：
 * - 主触发是 `observeInsertion`：#feed 出现 → 监听新楼层；每个楼层 → 监听展开的楼中楼；
 * - 兜底只有两条：低频心跳（20s）与「标签页重新可见」，都不做重活；
 * - 扫描去抖 + 并发保护，命中判定在 `collect.ts` 里按账号缓存，未变化的评论不会重复算分。
 */
import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { shadowDomSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { eventBus } from '@/core/event-bus'
import { hideFishComments, restoreFishComments, scanFishComments } from './collect'
import { openFishPondDialog } from './dialog'
const logger = new LoggerService('VideoModule')
const shadowDOMHelper = new ShadowDOMHelper()
/** 评论连续插入时的合并窗口：一批插入只扫一次 */
const SCAN_DEBOUNCE_MS = 600
/** 兜底心跳：观察器异常（B 站换实现）时仍能跟上评论区变化 */
const HEARTBEAT_MS = 20000
/** 楼层内「楼中楼」观察器上限（一直加载更多时不会无限挂观察器） */
const REPLY_WATCH_LIMIT = 80
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
     * 每次调用先释放上一轮的观察器和定时器（SPA 切换视频时评论区会被整体替换），
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
        let replyWatchers = 0
        let stopFeedWatch: (() => void) | null = null
        let heartbeat: ReturnType<typeof setInterval> | null = null
        let disposed = false
        /** 迟到的清理函数（观察器在异步回调里挂的）不能再往里塞，直接执行 */
        const addCleanup = (fn: () => void): void => {
            if (disposed) fn()
            else cleanups.push(fn)
        }
        cleanups.push(() => {
            disposed = true
            if (stopFeedWatch) stopFeedWatch()
            stopFeedWatch = null
            if (heartbeat) clearInterval(heartbeat)
            heartbeat = null
        })
        /** 评论区一出现就挂上监听（评论区是懒加载的，要等 #feed 出现） */
        const attachFeed = (): void => {
            if (stopFeedWatch) stopFeedWatch()
            stopFeedWatch = shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderderContainer, feed => {
                const stopThreads = shadowDOMHelper.observeInsertion(shadowDomSelectors.commentThreadRenderder, thread => {
                    // 楼层里展开楼中楼时不会改变 #feed 的子节点，得在楼层内部再挂一层；
                    // 楼层数量没有上限（一直「加载更多」），观察器按需挂、且设个总数上限
                    if (replyWatchers < REPLY_WATCH_LIMIT) {
                        replyWatchers++
                        addCleanup(shadowDOMHelper.observeInsertion(
                            `${shadowDomSelectors.commentRenderder}, ${shadowDomSelectors.commentReplyRenderder}`,
                            () => this.scheduleFishScan(),
                            thread
                        ))
                    }
                    this.scheduleFishScan()
                }, feed)
                addCleanup(stopThreads)
                this.scheduleFishScan()
            })
        }
        attachFeed()
        heartbeat = setInterval(() => {
            if (!this.userConfigs.catch_fish || document.hidden) return
            // 心跳只补「观察器没跟上的情况」：评论区被整体替换时重新挂载
            if (!shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)) attachFeed()
            else this.scheduleFishScan()
        }, HEARTBEAT_MS)
        cleanups.push(() => {
            const onVisible = (): void => {
                if (!document.hidden) this.scheduleFishScan()
            }
            document.addEventListener('visibilitychange', onVisible)
            addCleanup(() => document.removeEventListener('visibilitychange', onVisible))
        })
        const onConfigChanged = (...args: unknown[]): void => {
            const payload = (args[0] ?? {}) as { key?: string, value?: unknown }
            if (payload.key !== 'catch_fish') return
            if (payload.value) this.scheduleFishScan()
            else restoreFishComments()
        }
        addCleanup(eventBus.on(EVENT_NAMES.CONFIG_CHANGED, onConfigChanged))
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
        if ((this as FishPondContext & { _fishScanning?: boolean })._fishScanning) return
        const context = this as FishPondContext & { _fishScanning?: boolean }
        context._fishScanning = true
        try {
            const scan = await scanFishComments()
            if (!scan.items.length) return
            const hidden = hideFishComments(scan.items)
            if (hidden) logger.debug(`大肥鱼丨识别 ${scan.items.length} 条，本次移除 ${hidden} 条`)
        } catch (error) {
            logger.error('大肥鱼丨扫描失败:', error)
        } finally {
            context._fishScanning = false
        }
    },
    /** 侧栏「鱼塘」按钮入口 */
    openFishPond (): void {
        openFishPondDialog()
    }
}
