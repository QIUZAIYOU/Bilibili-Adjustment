import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { biliApis } from '@/shared/bili-apis'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
import { chunk } from '@/utils/lodash-lite'
import { mountHomeHistoryPanel } from '@/ui/home'
const logger = new LoggerService('HomeModule')
export const homeHistoryFeatures = {
    async setRecordRecommendVideoHistory () {
        // 正在记录时排队，记录完成后自动补记最新推荐，避免连续点击「换一换」丢记录
        if (this._recordingPromise) {
            this._pendingRecord = true
            return
        }
        const sessionTimestamp = Date.now()
        const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11)')
        const recordRecommendVideos = [...allCards]
            .filter(card => !card.querySelector('[class*="-ad"]'))
            .map((video, index) => ({ video, order: index }))
        const fetchVideoInfo = async url => {
            try {
                return await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
            } catch (error) {
                // 偶发网络失败重试一次，避免单次失败丢记录
                logger.debug('首页记录｜获取视频信息失败，重试一次', error)
                return biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
            }
        }
        this._recordingPromise = (async () => {
            try {
                // 分批并发获取视频信息，替代串行请求解决记录滞后
                for (const batch of chunk(recordRecommendVideos, 4)) {
                    await Promise.allSettled(batch.map(async ({ video, order }) => {
                        const url = video.querySelector('a')?.href
                        const title = video.querySelector('h3')?.title
                        if (!location.host.includes('bilibili.com') || !url || url.includes('cm.bilibili.com') || !title) return
                        let videoInfo
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
    },
    async insertIndexRecommendVideoHistoryPopover () {
        const indexRecommendVideoRollButtonWrapper = await elementSelectors.wait('indexRecommendVideoRollButtonWrapper')
        const indexRecommendVideoHistoryOpenButtonTemplate = getTemplates.indexRecommendVideoHistoryOpenButton
        createElementAndInsert(indexRecommendVideoHistoryOpenButtonTemplate, indexRecommendVideoRollButtonWrapper)
        const indexRecommendVideoHistoryOpenButton = await elementSelectors.wait('indexRecommendVideoHistoryOpenButton')
        // 点击打开按钮时创建并显示弹窗
        const cleanup = addEventListenerToElement(indexRecommendVideoHistoryOpenButton, 'click', async () => {
            // 检查是否已存在弹窗，避免重复创建
            let popover = document.getElementById('indexRecommendVideoHistoryPopover')
            if (!popover) {
                popover = createElementAndInsert(getTemplates.indexRecommendVideoHistoryPopover, document.body)
                // 统一的外部点击/Escape 关闭（原生 popover 的 light dismiss 在弹窗内按下、
                // 弹窗外松开拖选文字时会误关，故用手动模式 + 自定义判定）
                popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
                // 弹窗关闭后移除容器（统一关闭逻辑），重开时整体重建，搜索框随之重置
                addEventListenerToElement(popover, 'toggle', e => {
                    if (e.newState === 'closed') {
                        popover.__popoverDismissCleanup?.()
                        popover.__popoverDismissCleanup = null
                        // 卸载 Vue 列表面板（容器随后移除，不卸载会残留实例与观察器）
                        this._historyPanel?.unmount()
                        this._historyPanel = null
                        popover.remove()
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
    async clearRecommendVideoHistory (){
        await storageService.clear('index')
        const popover = document.getElementById('indexRecommendVideoHistoryPopover')
        if (popover) {
            popover.hidePopover()
        }
    },
    /**
     * 渲染弹窗内容：宿主负责读库、排序与标题计数（沿用原逻辑），
     * 列表区（分类栏 + 视频列表 + 搜索过滤 + 分页懒加载 + 列表点击）交给 Vue 面板
     * HomeHistoryPanel.vue —— 结构与 #id/.class 契约保持不变，故既有样式无需改动。
     */
    async generatorIndexRecommendVideoHistoryContents () {
        // 弹窗 DOM 还未创建时直接跳过（如点击"换一换"触发了渲染但弹窗未打开）
        const listAnchor = document.getElementById('indexRecommendVideoHistoryList')
        if (!listAnchor) return
        const indexRecommendVideoHistoriesRaw = await storageService.getAllRaw('index')
        const totalCount = indexRecommendVideoHistoriesRaw.length
        const [titleEl, searchInput] = await elementSelectors.batch([
            'indexRecommendVideoHistoryPopoverTitle',
            'indexRecommendVideoHistorySearchInput'
        ])
        // 先按批次时间倒序（最新批次排最前），批次内按页面顺序升序（与旧实现一致）
        const records = indexRecommendVideoHistoriesRaw
            .map(item => ({
                ...item.value,
                _key: item.key,
                _order: item.value.order ?? 0,
                _sessionTimestamp: item.value.sessionTimestamp ?? 0
            }))
            .sort((a, b) => b._sessionTimestamp - a._sessionTimestamp || a._order - b._order)
        // 更新标题中的数量（沿用原实现：写入标题内的 span）
        const titleSpan = titleEl?.querySelector('span')
        if (titleSpan) {
            titleSpan.innerText = `首页视频推荐历史记录(${totalCount})`
        }
        // 清理旧实现遗留的包裹层/分类栏，把挂载点放在原列表位置：
        // 面板自身会渲染 .history-body 与同名 id，保证既有样式（按 id/结构选择器书写）继续命中
        document.querySelector('#indexRecommendVideoHistoryPopover .history-body')?.remove()
        document.getElementById('indexRecommendVideoHistoryCategoryV2')?.remove()
        let mountEl = document.getElementById('indexRecommendVideoHistoryPanelMount')
        if (!mountEl) {
            mountEl = document.createElement('div')
            mountEl.id = 'indexRecommendVideoHistoryPanelMount'
            listAnchor.after(mountEl)
        }
        listAnchor.remove()
        // 重新渲染（如点击「换一换」）时先卸载旧面板，避免实例与观察器残留
        this._historyPanel?.unmount()
        this._historyPanel = null
        // 兼容旧卸载路径：搜索监听已迁入 Vue 面板，保留空清理函数，避免旧调用点报错
        this._historySearchCleanup = () => {}
        this._historyListClickBound = true
        try {
            this._historyPanel = await mountHomeHistoryPanel(mountEl, { records, searchInput })
        } catch (error) {
            logger.error('首页推荐历史｜列表面板加载失败', error)
        }
    }
}
