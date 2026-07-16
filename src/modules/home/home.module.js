import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { sleep, executeFunctionsSequentially, isTabActive, insertStyleToDocument, createElementAndInsert, addEventListenerToElement } from '@/utils/common'
import { biliApis } from '@/shared/biliApis'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { stylesV2 } from '@/shared/styles'
const logger = new LoggerService('VideoModule')
export default {
    name: 'home',
    version: '1.2.3',
    async install () {
        eventBus.on('app:ready', async () => {
            logger.info('首页模块｜已加载')
            await this.preFunctions()
        })
    },
    async preFunctions () {
        this.userConfigs = await storageService.getAll('user')
        if (isTabActive()) {
            logger.info('标签页｜已激活')
            insertStyleToDocument({ 'IndexAdjustmentStyle': stylesV2.IndexAdjustment })
            this.handleExecuteFunctionsSequentially()
            this.initEventListeners()
        }
    },
    async initEventListeners () {
        const indexRecommendVideoRollButton = await elementSelectors.indexRecommendVideoRollButton
        addEventListenerToElement(indexRecommendVideoRollButton, 'click', async () => {
            executeFunctionsSequentially([
                () => this.setRecordRecommendVideoHistory(),
                () => this.markRecommendVideoPaidStatus(),
                () => this.generatorIndexRecommendVideoHistoryContents()
            ])
        })
    },
    async markRecommendVideoPaidStatus () {
        const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11)')
        const cards = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
        for (const video of cards) {
            const url = video.querySelector('a')?.href
            const title = video.querySelector('h3')?.title
            if (location.host.includes('bilibili.com') && url && !url.includes('cm.bilibili.com') && title) {
                let videoInfo
                try {
                    videoInfo = await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
                } catch {}
                if (videoInfo) {
                    let isPaid = false
                    try {
                        isPaid = await biliApis.checkVideoPaid(videoInfo.aid, videoInfo.cid)
                    } catch {}
                    if (isPaid) {
                        const titleEl = video.querySelector('h3')
                        if (titleEl) {
                            titleEl.title = `🟡付费视频 丨 ${title}`
                            titleEl.innerHTML = `<span style="color:#fb7299;font-weight:700;font-size:12px;border:1px solid;padding:2px 3px;border-radius:4px">付费视频</span> ${title}`
                        }
                    }
                }
            }
        }
        logger.info('首页视频付费标记｜已完成')
    },
    async setRecordRecommendVideoHistory () {
        if (this._isRecording) return
        this._isRecording = true
        const sessionTimestamp = Date.now()
        try {
            const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11)')
            const recordRecommendVideos = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
            let order = 0
            for (const video of recordRecommendVideos) {
                const url = video.querySelector('a')?.href
                const title = video.querySelector('h3')?.title
                if (location.host.includes('bilibili.com') && url && !url.includes('cm.bilibili.com')) {
                    let videoInfo
                    try {
                        videoInfo = await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
                    } catch {}
                    if (videoInfo) {
                        let tags = []
                        try {
                            const bvid = biliApis.getCurrentVideoID(url)
                            if (bvid && bvid !== 'error') tags = await biliApis.getVideoTags(bvid) || []
                        } catch (e) {
                            logger.debug('获取视频标签失败', e?.message)
                        }
                        const { tid, tid_v2, tname, tname_v2, pic, owner } = videoInfo
                        const author = owner?.name || '未知作者'
                        if (title) {
                            await storageService.set('index', title, { title, tid, tid_v2, tname, tname_v2, tags, url, pic, author, order, sessionTimestamp })
                        }
                        order++
                    }
                }
            }
            logger.info('首页视频推荐历史｜已记录')
        } finally {
            this._isRecording = false
        }
    },
    async insertIndexRecommendVideoHistoryPopover () {
        const indexRecommendVideoRollButtonWrapper = await elementSelectors.indexRecommendVideoRollButtonWrapper
        const indexRecommendVideoHistoryOpenButtonTemplate = getTemplates.indexRecommendVideoHistoryOpenButton
        createElementAndInsert(indexRecommendVideoHistoryOpenButtonTemplate, indexRecommendVideoRollButtonWrapper)
        const indexRecommendVideoHistoryOpenButton = await elementSelectors.indexRecommendVideoHistoryOpenButton
        // 点击打开按钮时创建并显示弹窗
        addEventListenerToElement(indexRecommendVideoHistoryOpenButton, 'click', async () => {
            // 检查是否已存在弹窗，避免重复创建
            let wrapper = document.getElementById('indexRecommendVideoHistoryPopoverWrapper')
            if (!wrapper) {
                const template = getTemplates.indexRecommendVideoHistoryPopover
                wrapper = createElementAndInsert(template, document.body)
                // 点击遮罩层关闭弹窗
                addEventListenerToElement(wrapper, 'click', (event) => {
                    if (event.target === wrapper) {
                        wrapper.style.display = 'none'
                        const searchInput = document.getElementById('indexRecommendVideoHistorySearchInput')
                        if (searchInput) {
                            searchInput.value = ''
                        }
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
            wrapper.style.display = 'flex'
            // 等待 DOM 更新后再渲染内容
            await new Promise(resolve => requestAnimationFrame(resolve))
            this.generatorIndexRecommendVideoHistoryContents()
        })
    },
    async clearRecommendVideoHistory (){
        await storageService.clear('index')
        const wrapper = document.getElementById('indexRecommendVideoHistoryPopoverWrapper')
        if (wrapper) {
            wrapper.style.display = 'none'
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
        const totalCount = await storageService.getCount('index')
        const batchSelectors = ['indexRecommendVideoHistoryPopoverTitle', 'indexRecommendVideoHistoryList', 'indexRecommendVideoHistorySearchInput']
        const [indexRecommendVideoHistoryPopoverTitle, indexRecommendVideoHistoryList, indexRecommendVideoHistorySearchInput] = await elementSelectors.batch(batchSelectors)
        indexRecommendVideoHistoryList.innerHTML = ''
        // 更新标题中的数量
        const titleSpan = indexRecommendVideoHistoryPopoverTitle.querySelector('span')
        if (titleSpan) {
            titleSpan.innerText = `首页视频推荐历史记录(${totalCount})`
        }
        // 先按批次时间倒序（最新批次排最前），批次内按页面顺序升序
        const videoList = Object.entries(indexRecommendVideoHistories)
            .map(([key, value]) => ({ ...value, _key: key, _order: value.order ?? 0, _sessionTimestamp: value.sessionTimestamp ?? 0 }))
            .sort((a, b) => b._sessionTimestamp - a._sessionTimestamp || a._order - b._order)
        // 收集所有视频的标签，去重后生成分类按钮
        const allTags = [...new Set(videoList.flatMap(v => v.tags || []))].sort()
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
        categoryBar.innerHTML = '<li class="all_v2 active">全部</li>' + allTags.map(t => `<li>${t}</li>`).join('')
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
        // 加载一页数据
        const loadPage = () => {
            const start = currentPage * PAGE_SIZE
            const end = start + PAGE_SIZE
            const pageData = filteredList.slice(start, end)
            for (const video of pageData) {
                createElementAndInsert(`
                    <li>
                        <span><img src="${video.pic}" loading="lazy" alt="${video.title || ''}"></span>
                        <div class="video-info">
                            <a href="${video.url}" target="_blank" title="${video.title || ''}">${video.title || '未知标题'}</a>
                            <div class="video-author">UP: ${video.author || '未知作者'}</div>
                        </div>
                    </li>
                `, indexRecommendVideoHistoryList)
            }
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
                // 标签筛选
                if (selectedTag && !(video.tags || []).includes(selectedTag)) return false
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
                observer = new IntersectionObserver((entries) => {
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
        // 监听搜索输入
        let searchTimeout
        addEventListenerToElement(indexRecommendVideoHistorySearchInput, 'input', event => {
            clearTimeout(searchTimeout)
            searchTimeout = setTimeout(() => {
                filterAndDisplayVideos(event.target.value)
            }, 300)
        })
        // 初始显示第一页视频
        filterAndDisplayVideos()
    },
    async clearRecommendVideoHistory (){
        await storageService.clear('index')
        const wrapper = document.getElementById('indexRecommendVideoHistoryPopoverWrapper')
        if (wrapper) {
            wrapper.style.display = 'none'
        }
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            () => this.setRecordRecommendVideoHistory(),
            () => this.markRecommendVideoPaidStatus(),
            () => this.insertIndexRecommendVideoHistoryPopover()
        ]
        executeFunctionsSequentially(functions)
    }
}
