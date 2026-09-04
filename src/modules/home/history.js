/* global _ */
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { biliApis } from '@/shared/bili-apis'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { createElementAndInsert, addEventListenerToElement, escapeHtml, sanitizeHttpUrl, enablePopoverLightDismiss } from '@/utils/common'
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
                for (const batch of _.chunk(recordRecommendVideos, 4)) {
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
                            try {
                                const detail = await biliApis.getVideoDetail(videoInfo.aid, videoInfo.tid_v2)
                                category = detail?.pid_name_v2 || ''
                            } catch { /* 忽略分类获取失败 */ }
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
    async generatorIndexRecommendVideoHistoryContents () {
        // 弹窗 DOM 还未创建时直接跳过（如点击"换一换"触发了渲染但弹窗未打开）
        if (!document.getElementById('indexRecommendVideoHistoryList')) return
        const indexRecommendVideoHistoriesRaw = await storageService.getAllRaw('index')
        const indexRecommendVideoHistories = {}
        for (const item of indexRecommendVideoHistoriesRaw) {
            indexRecommendVideoHistories[item.key] = {
                ...item.value,
                timestamp: item.timestamp
            }
        }
        const totalCount = indexRecommendVideoHistoriesRaw.length
        const batchSelectors = ['indexRecommendVideoHistoryPopoverTitle', 'indexRecommendVideoHistoryList', 'indexRecommendVideoHistorySearchInput']
        const [indexRecommendVideoHistoryPopoverTitle, indexRecommendVideoHistoryList, indexRecommendVideoHistorySearchInput] = await elementSelectors.batch(batchSelectors)
        indexRecommendVideoHistoryList.innerHTML = ''
        // 列表点击事件委托：点击任意列表项打开视频（仅绑定一次，链接目标存于 li data-url）
        if (!this._historyListClickBound) {
            this._historyListClickBound = true
            addEventListenerToElement(indexRecommendVideoHistoryList, 'click', event => {
                const li = event.target.closest('li')
                if (!li || event.target.closest('a')) return
                const url = li.dataset.url
                if (url) window.open(url, '_blank', 'noopener')
            })
        }
        // 更新标题中的数量
        const titleSpan = indexRecommendVideoHistoryPopoverTitle.querySelector('span')
        if (titleSpan) {
            titleSpan.innerText = `首页视频推荐历史记录(${totalCount})`
        }
        // 先按批次时间倒序（最新批次排最前），批次内按页面顺序升序
        const videoList = Object.entries(indexRecommendVideoHistories)
            .map(([key, value]) => ({ ...value, _key: key, _order: value.order ?? 0, _sessionTimestamp: value.sessionTimestamp ?? 0 }))
            .sort((a, b) => b._sessionTimestamp - a._sessionTimestamp || a._order - b._order)
        // 收集所有视频的分类名，去重后生成分类按钮
        const allTags = [...new Set(videoList.flatMap(v => v.category ? [v.category] : []))].sort()
        let selectedTag = ''
        // 创建分类按钮栏（如果已存在则复用）
        let categoryBar = document.getElementById('indexRecommendVideoHistoryCategoryV2')
        let historyBody = document.querySelector('.history-body')
        if (!historyBody) {
            historyBody = document.createElement('div')
            historyBody.className = 'history-body'
            // 将 categoryBar 和 videoList 包裹起来
            indexRecommendVideoHistoryList.after(historyBody)
            historyBody.appendChild(categoryBar || document.createElement('ul'))
            historyBody.appendChild(indexRecommendVideoHistoryList)
        }
        if (!categoryBar) {
            categoryBar = document.createElement('ul')
            categoryBar.id = 'indexRecommendVideoHistoryCategoryV2'
            historyBody.prepend(categoryBar)
        }
        categoryBar.innerHTML = '<li class="all_v2 active">全部</li>' + allTags.map(t => `<li>${escapeHtml(t)}</li>`).join('')
        // 分类按钮点击筛选
        categoryBar.querySelectorAll('li').forEach(li => {
            addEventListenerToElement(li, 'click', () => {
                categoryBar.querySelectorAll('li').forEach(l => l.classList.remove('active'))
                li.classList.add('active')
                selectedTag = li.classList.contains('all_v2') ? '' : li.textContent
                filterAndDisplayVideos(document.getElementById('indexRecommendVideoHistorySearchInput')?.value || '')
            })
        })
        // 懒加载配置
        const PAGE_SIZE = 50
        let currentPage = 0
        let filteredList = videoList
        let isLoading = false
        let observer = null
        // 移除旧的 loading 指示器
        const removeLoadingIndicator = () => {
            const loadingEl = document.getElementById('indexHistoryLoading')
            if (loadingEl) loadingEl.remove()
        }
        // 显示 loading 指示器
        const showLoadingIndicator = () => {
            removeLoadingIndicator()
            if (filteredList.length > (currentPage + 1) * PAGE_SIZE) {
                const loadingEl = document.createElement('div')
                loadingEl.id = 'indexHistoryLoading'
                loadingEl.className = 'loading-state'
                loadingEl.innerHTML = '<div class="loading-spinner"></div><span>加载中...</span>'
                indexRecommendVideoHistoryList.appendChild(loadingEl)
                return true
            }
            return false
        }
        // 加载一页数据（批量拼接 HTML 一次插入，减少重排）
        const loadPage = () => {
            const start = currentPage * PAGE_SIZE
            const end = start + PAGE_SIZE
            const pageData = filteredList.slice(start, end)
            const html = pageData.map(video => {
                const title = escapeHtml(video.title || '未知标题')
                const author = escapeHtml(video.author || '未知作者')
                const rawUrl = sanitizeHttpUrl(video.url)
                const url = escapeHtml(rawUrl)
                const pic = escapeHtml(sanitizeHttpUrl(video.pic))
                return `
                    <li data-url="${url}">
                        <span><img src="${pic}" loading="lazy" alt="${title}"></span>
                        <div class="video-info">
                            <a href="${url}" target="_blank" rel="noopener noreferrer" title="${title}">${title}</a>
                            <div class="video-author">UP: ${author}</div>
                        </div>
                    </li>
                `
            }).join('')
            indexRecommendVideoHistoryList.insertAdjacentHTML('beforeend', html)
            currentPage++
        }
        // 搜索并显示视频
        const filterAndDisplayVideos = (searchKeyword = '') => {
            // 清理旧的 observer
            if (observer) {
                observer.disconnect()
                observer = null
            }
            indexRecommendVideoHistoryList.innerHTML = ''
            currentPage = 0
            const keyword = searchKeyword.toLowerCase().trim()
            filteredList = videoList.filter(video => {
                // 分类筛选
                if (selectedTag && video.category !== selectedTag) return false
                // 关键字搜索
                if (keyword &&
                    !(video.title && video.title.toLowerCase().includes(keyword)) &&
                    !(video.author && video.author.toLowerCase().includes(keyword))) return false
                return true
            })
            if (filteredList.length === 0) {
                indexRecommendVideoHistoryList.innerHTML = '<div class="empty-state">没有找到匹配的视频</div>'
                return
            }
            // 加载第一页
            loadPage()
            // 如果还有更多数据，设置 IntersectionObserver
            if (filteredList.length > PAGE_SIZE) {
                const sentinel = document.createElement('div')
                sentinel.id = 'indexHistorySentinel'
                sentinel.className = 'sentinel'
                indexRecommendVideoHistoryList.appendChild(sentinel)
                observer = new IntersectionObserver(entries => {
                    if (entries[0].isIntersecting && !isLoading) {
                        isLoading = true
                        if (showLoadingIndicator()) {
                            // 模拟延迟加载效果
                            setTimeout(() => {
                                loadPage()
                                removeLoadingIndicator()
                                if (filteredList.length <= currentPage * PAGE_SIZE) {
                                    sentinel.remove()
                                }
                                isLoading = false
                            }, 100)
                        } else {
                            sentinel.remove()
                            isLoading = false
                        }
                    }
                }, {
                    root: indexRecommendVideoHistoryList,
                    rootMargin: '100px'
                })
                observer.observe(sentinel)
            }
        }
        // 监听搜索输入（每次渲染重新绑定，跟随最新状态闭包；旧监听先移除避免叠加）
        this._historySearchCleanup?.()
        let searchTimeout
        this._historySearchCleanup = addEventListenerToElement(indexRecommendVideoHistorySearchInput, 'input', event => {
            clearTimeout(searchTimeout)
            searchTimeout = setTimeout(() => {
                filterAndDisplayVideos(event.target.value)
            }, 300)
        })
        // 初始显示第一页视频
        filterAndDisplayVideos()
    }
}
