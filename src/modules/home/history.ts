import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { biliApis } from '@/shared/bili-apis'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
import { chunk } from '@/utils/lodash-lite'
import { mountHomeHistoryPanel } from '@/ui/home'
import { sortAndDedupeHistoryRecords, findDuplicateHistoryRecords } from './history-records'
const logger = new LoggerService('HomeModule')
/** 首页推荐视频信息子集（记录用） */
interface HistoryVideoInfo {
    bvid?: string
    aid?: string | number
    tid?: string | number
    tid_v2?: string | number
    tname?: string
    tname_v2?: string
    pic?: string
    owner?: { name?: string }
}
/** 首页模块特性上下文（由 home.module 的模块实例混入） */
interface HomeHistoryContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _recordingPromise?: Promise<void> | null
    _pendingRecord?: boolean
    _historyPanel?: { unmount: () => void } | null
    _historySearchCleanup?: (() => void) | null
    _historyListClickBound?: boolean
    clearRecommendVideoHistory: () => Promise<void>
    setRecordRecommendVideoHistory: () => Promise<void>
    generatorIndexRecommendVideoHistoryContents: () => Promise<void>
}
/**
 * 清理库里「同一视频的旧记录」（展示侧只认最新一条，留着的旧行永远不可见，只会越积越多）。
 *
 * 为什么需要：存储 key 是 `${bvid||aid||url}::${sessionTimestamp}`，同一视频每次被推荐都会新增一行，
 * 而展示侧按**视频身份**去重 —— 于是库里长期存在大量不可见重复行，且一旦身份判定漏了
 * （历史实现按 url 字符串比，tracking 参数/尾斜杠/分 P 不同就漏）就会在列表里冒出来。
 * 这里按与展示完全同源的规则删掉旧行：批次时间最新、同批次内页面顺序靠前的那条保留。
 * @param {Array<{key: string, value: object}>} rawList storageService.getAllRaw('index') 的结果
 * @returns {Promise<number>} 实际清理（提交删除事务）的条数
 */
const pruneDuplicateHistoryRecords = async (rawList: unknown): Promise<number> => {
    const duplicates = findDuplicateHistoryRecords(rawList)
    if (!duplicates.length) return 0
    try {
        // 明细先落日志再删：保留「哪两条被判为同一视频」的现场，便于回溯判定是否过宽
        logger.debug(
            `首页视频推荐历史｜清理重复记录 ${duplicates.length} 条（同一视频只留最新一条）`,
            duplicates.map(item => `${item.identity} 删[${item.title || item.url}](${item.url}) 留[${item.keptKey}]`).join(' ｜ ')
        )
        await storageService.batchRemove('index', duplicates.map(item => item.key))
        return duplicates.length
    } catch (error) {
        // 清理失败不影响展示（展示侧本来就会去重）
        logger.warn('首页视频推荐历史｜清理重复记录失败', error)
        return 0
    }
}
export const homeHistoryFeatures = {
    async setRecordRecommendVideoHistory (this: HomeHistoryContext): Promise<void> {
        // 正在记录时排队，记录完成后自动补记最新推荐，避免连续点击「换一换」丢记录
        if (this._recordingPromise) {
            this._pendingRecord = true
            return
        }
        const sessionTimestamp = Date.now()
        const allCards = elementSelectors.queryAll('indexRecommendCards')
        const adCardSelector = elementSelectors.CSS('indexRecommendAdCard') || '[class*="-ad"]'
        const cardLinkSelector = elementSelectors.CSS('indexRecommendCardLink') || 'a'
        const cardTitleSelector = elementSelectors.CSS('indexRecommendCardTitle') || 'h3'
        const recordRecommendVideos = [...allCards]
            .filter(card => !card.querySelector(adCardSelector))
            .map((video, index) => ({ video, order: index }))
        const fetchVideoInfo = async (url: string): Promise<HistoryVideoInfo | null | undefined> => {
            try {
                return await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url)) as HistoryVideoInfo | null | undefined
            } catch (error) {
                // 偶发网络失败重试一次，避免单次失败丢记录
                logger.debug('首页记录｜获取视频信息失败，重试一次', error)
                return await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url)) as HistoryVideoInfo | null | undefined
            }
        }
        this._recordingPromise = (async (): Promise<void> => {
            try {
                // 分批并发获取视频信息，替代串行请求解决记录滞后
                for (const batch of chunk(recordRecommendVideos, 4)) {
                    await Promise.allSettled(batch.map(async ({ video, order }) => {
                        const url = (video.querySelector(cardLinkSelector) as HTMLAnchorElement | null)?.href
                        const title = (video.querySelector(cardTitleSelector) as HTMLElement | null)?.title
                        if (!location.host.includes('bilibili.com') || !url || url.includes('cm.bilibili.com') || !title) return
                        let videoInfo: HistoryVideoInfo | null | undefined
                        try {
                            videoInfo = await fetchVideoInfo(url)
                        } catch { /* 获取失败则仅记录 DOM 基础信息，保证不丢记录 */ }
                        let category = ''
                        if (videoInfo) {
                            // 分类名直接取自视频信息（tname_v2 为二级分区，优先）。
                            // 原实现调用不存在的 biliApis.getVideoDetail(...) → 每次都抛错并被吞掉，
                            // 导致 category 恒为空、分类栏只剩「全部」（分类筛选形同失效）。
                            category = videoInfo.tname_v2 || videoInfo.tname || ''
                        }
                        const historyKey = `${videoInfo?.bvid || videoInfo?.aid || url}::${sessionTimestamp}`
                        await storageService.set('index', historyKey, {
                            title,
                            tid: videoInfo?.tid || '',
                            tid_v2: videoInfo?.tid_v2 || '',
                            tname: videoInfo?.tname || '',
                            tname_v2: videoInfo?.tname_v2 || '',
                            category,
                            url,
                            pic: videoInfo?.pic || '',
                            author: videoInfo?.owner?.name || '未知作者',
                            order,
                            sessionTimestamp
                        })
                    }))
                }
                logger.info('首页视频推荐历史｜已记录')
            } finally {
                this._recordingPromise = null
                if (this._pendingRecord) {
                    this._pendingRecord = false
                    this.setRecordRecommendVideoHistory()
                }
            }
        })()
        await this._recordingPromise
        // 本次写入后立刻清掉同一视频的旧行：否则每被推荐一次就多一行，库只增不减
        await pruneDuplicateHistoryRecords(await storageService.getAllRaw('index'))
    },
    async insertIndexRecommendVideoHistoryPopover (this: HomeHistoryContext): Promise<void> {
        // 幂等：已经插过按钮就不再重复插入
        if (document.getElementById('indexRecommendVideoHistoryOpenButton')) return
        // 锚点逐级兜底：首页变体/改版可能没有 .feed-roll-btn，锚点缺失时绝不能抛错
        //（createElementAndInsert 对 null 会抛 Target must be a valid DOM node，进而中断首页功能链）
        const anchor = await elementSelectors.wait('indexRecommendVideoRollButtonWrapper')
            || elementSelectors.get('indexRecommendVideoRollButtonWrapper')
            || elementSelectors.get('indexRecommendContainer')
            || document.body
        createElementAndInsert(getTemplates.indexRecommendVideoHistoryOpenButton, anchor)
        const indexRecommendVideoHistoryOpenButton = document.getElementById('indexRecommendVideoHistoryOpenButton')
        if (!indexRecommendVideoHistoryOpenButton) return
        // 点击打开按钮时创建并显示弹窗
        const cleanup = addEventListenerToElement(indexRecommendVideoHistoryOpenButton, 'click', async () => {
            // 检查是否已存在弹窗，避免重复创建
            let popover = document.getElementById('indexRecommendVideoHistoryPopover') as
                (HTMLElement & { __popoverDismissCleanup?: (() => void) | null }) | null
            if (!popover) {
                popover = createElementAndInsert(getTemplates.indexRecommendVideoHistoryPopover, document.body) as
                    HTMLElement & { __popoverDismissCleanup?: (() => void) | null }
                // 统一的外部点击/Escape 关闭（原生 popover 的 light dismiss 在弹窗内按下、
                // 弹窗外松开拖选文字时会误关，故用手动模式 + 自定义判定）
                popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
                // 弹窗关闭后移除容器（统一关闭逻辑），重开时整体重建，搜索框随之重置
                addEventListenerToElement(popover, 'toggle', (e: Event) => {
                    if ((e as ToggleEvent).newState === 'closed') {
                        popover!.__popoverDismissCleanup?.()
                        popover!.__popoverDismissCleanup = null
                        // 卸载 Vue 列表面板（容器随后移除，不卸载会残留实例与观察器）
                        this._historyPanel?.unmount()
                        this._historyPanel = null
                        popover!.remove()
                    }
                })
                // 绑定清空按钮事件（弹窗创建后只绑定一次）
                const clearBtn = document.getElementById('clearRecommendVideoHistoryButton')
                if (clearBtn) {
                    addEventListenerToElement(clearBtn, 'click', async () => {
                        this.clearRecommendVideoHistory()
                    })
                }
            }
            popover.showPopover()
            // 等待 DOM 更新后再渲染内容
            await new Promise(resolve => requestAnimationFrame(resolve))
            this.generatorIndexRecommendVideoHistoryContents()
        })
        this._cleanup.push(cleanup)
    },
    async clearRecommendVideoHistory (this: HomeHistoryContext): Promise<void> {
        await storageService.clear('index')
        const popover = document.getElementById('indexRecommendVideoHistoryPopover')
        if (popover) {
            popover.hidePopover()
        }
    },
    /**
     * 渲染弹窗内容：宿主负责读库、排序去重与标题计数，列表区（分类栏 + 视频列表 +
     * 搜索过滤 + 分页懒加载 + 列表点击）交给 Vue 面板 HomeHistoryPanel.vue ——
     * 结构与 #id/.class 契约保持不变，故既有样式无需改动。
     */
    async generatorIndexRecommendVideoHistoryContents (this: HomeHistoryContext): Promise<void> {
        // 弹窗 DOM 还未创建时直接跳过（如点击"换一换"触发了渲染但弹窗未打开）。
        // 二次渲染（「换一换」）时模板里的列表节点已被移除，故以挂载点是否存在判断。
        const popoverEl = document.getElementById('indexRecommendVideoHistoryPopover')
        const listAnchor = document.getElementById('indexRecommendVideoHistoryList')
        const existingMount = document.getElementById('indexRecommendVideoHistoryPanelMount')
        if (!popoverEl || (!listAnchor && !existingMount)) return
        const indexRecommendVideoHistoriesRaw = await storageService.getAllRaw('index')
        // 打开/重绘弹窗时顺手把库里同一视频的旧行删掉（复用刚读到的一份数据，不额外读库）
        await pruneDuplicateHistoryRecords(indexRecommendVideoHistoriesRaw)
        const [titleEl, searchInput] = await elementSelectors.batch([
            'indexRecommendVideoHistoryPopoverTitle',
            'indexRecommendVideoHistorySearchInput'
        ])
        // 排序 + 去重（同一视频只保留最新批次的一条，详见 sortAndDedupeHistoryRecords）
        const records = sortAndDedupeHistoryRecords(indexRecommendVideoHistoriesRaw)
        const totalCount = records.length
        // 更新标题中的数量（沿用原实现：写入标题内的 span；此处为去重后的数量）
        const titleSpan = titleEl?.querySelector('span') as HTMLElement | null
        if (titleSpan) {
            titleSpan.innerText = `首页视频推荐历史记录(${totalCount})`
        }
        // 清理上一次渲染遗留的包裹层/分类栏，把挂载点放在原列表位置。
        // 关键：挂载点在样式里为 display: contents（不生成盒子），面板根仍是 .history-body，
        // 从而保持「.adjustment-popover > .history-body > 分类栏/列表」的高度链与滚动行为。
        document.querySelector('#indexRecommendVideoHistoryPopover > .history-body')?.remove()
        // 分类栏按弹窗作用域查找（id 是本脚本自建的，但仍限定在弹窗内，避免误删页面上的同名元素）
        document.querySelector('#indexRecommendVideoHistoryPopover #indexRecommendVideoHistoryCategory')?.remove()
        let mountEl = existingMount
        if (!mountEl) {
            mountEl = document.createElement('div')
            mountEl.id = 'indexRecommendVideoHistoryPanelMount'
            if (listAnchor) listAnchor.after(mountEl)
            else popoverEl.appendChild(mountEl)
        }
        listAnchor?.remove()
        // 重新渲染（如点击「换一换」）时先卸载旧面板，避免实例与观察器残留
        this._historyPanel?.unmount()
        this._historyPanel = null
        // 兼容旧调用点（如 home.module.js 的卸载路径）：搜索监听与列表点击委托已迁入
        // Vue 面板，这里保留空清理函数与哨兵，避免旧代码调用时报错
        this._historySearchCleanup = () => {}
        this._historyListClickBound = true
        try {
            this._historyPanel = await mountHomeHistoryPanel(mountEl, { records, searchInput: searchInput as HTMLElement | null })
        } catch (error) {
            logger.error('首页推荐历史｜列表面板加载失败', error)
        }
    }
}
