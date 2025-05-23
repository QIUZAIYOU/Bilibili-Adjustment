import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { sleep, executeFunctionsSequentially, isTabActive, insertStyleToDocument, createElementAndInsert, addEventListenerToElement } from '@/utils/common'
import { biliApis } from '@/shared/biliApis'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { styles } from '@/shared/styles'
const logger = new LoggerService('VideoModule')
export default {
    name: 'home',
    version: '1.0.0',
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
            insertStyleToDocument({ 'IndexAdjustmentStyle': styles.IndexAdjustment })
            this.handleExecuteFunctionsSequentially()
            this.initEventListeners()
        }
    },
    async initEventListeners () {
        const indexRecommendVideoRollButton = await elementSelectors.indexRecommendVideoRollButton
        addEventListenerToElement(indexRecommendVideoRollButton, 'click', async () => {
            executeFunctionsSequentially([
                this.setRecordRecommendVideoHistory,
                this.generatorIndexRecommendVideoHistoryContents
            ])
        })
    },
    async setRecordRecommendVideoHistory () {
        const recordRecommendVideos = await elementSelectors.all('.recommended-container_floor-aside .feed-card:nth-child(-n+11):not(:has([class*="-ad"]))')
        recordRecommendVideos.forEach( async video => {
            const url = video.querySelector('a')?.href
            const title = video.querySelector('h3')?.title
            if (location.host.includes('bilibili.com') && !url.includes('cm.bilibili.com')) {
                const data = await biliApis.getVideoInformation('video', biliApis.getCurrentVideoID(url))
                if (data) {
                    const { tid, tid_v2, tname, tname_v2, pic } = data
                    await storageService.set('index', title, { title, tid, tid_v2, tname, tname_v2, url, pic })
                } else {
                    return
                }
            }
        })
        logger.info('首页视频推荐历史记录｜已开启')
    },
    async insertIndexRecommendVideoHistoryPopover () {
        const indexRecommendVideoRollButtonWrapper = await elementSelectors.indexRecommendVideoRollButtonWrapper
        const indexRecommendVideoHistoryOpenButtonTemplate = getTemplates.indexRecommendVideoHistoryOpenButton
        const indexRecommendVideoHistoryPopoverTemplate = getTemplates.indexRecommendVideoHistoryPopover
        createElementAndInsert(indexRecommendVideoHistoryOpenButtonTemplate, indexRecommendVideoRollButtonWrapper)
        const indexRecommendVideoHistoryPopover = createElementAndInsert(indexRecommendVideoHistoryPopoverTemplate, document.body)
        const batchSelectors = ['indexApp', 'indexRecommendVideoHistoryPopoverTitle']
        addEventListenerToElement(indexRecommendVideoHistoryPopover, 'toggle', async event => {
            const [indexApp, indexRecommendVideoHistoryPopoverTitle] = await elementSelectors.batch(batchSelectors)
            if (event.newState === 'open') {
                indexApp.style.pointerEvents = 'none'
                this.generatorIndexRecommendVideoHistoryContents()
            }
            if (event.newState === 'closed') {
                indexApp.style.pointerEvents = 'auto'
                indexRecommendVideoHistoryPopoverTitle.querySelector('span').innerText = '首页视频推荐历史记录'
            }
        })
        const indexRecommendVideoHistoryOpenButton = await elementSelectors.indexRecommendVideoHistoryOpenButton
        addEventListenerToElement(indexRecommendVideoHistoryOpenButton, 'click', async () => {
            const clearRecommendVideoHistoryButton = await elementSelectors.clearRecommendVideoHistoryButton
            addEventListenerToElement(clearRecommendVideoHistoryButton, 'click', async () => {
                this.clearRecommendVideoHistory()
            })
        })
    },
    async generatorIndexRecommendVideoHistoryContents () {
        const indexRecommendVideoHistories = await storageService.getAll('index')
        const totalCount = await storageService.getCount('index')
        const batchSelectors = ['indexRecommendVideoHistoryPopoverTitleCount', 'indexRecommendVideoHistoryCategory', 'indexRecommendVideoHistoryCategoryV2', 'indexRecommendVideoHistoryList']
        const [indexRecommendVideoHistoryPopoverTitleCount, indexRecommendVideoHistoryCategory, indexRecommendVideoHistoryCategoryV2, indexRecommendVideoHistoryList] = await elementSelectors.batch(batchSelectors)
        indexRecommendVideoHistoryCategory.innerHTML = '<li class="all adjustment_button primary plain">全部</li>'
        indexRecommendVideoHistoryCategoryV2.innerHTML = ''
        indexRecommendVideoHistoryList.innerHTML = ''
        indexRecommendVideoHistoryPopoverTitleCount.innerText = `首页视频推荐历史记录(${totalCount})`
        const setCategoryButtonActiveClass = async element => {
            elementSelectors.each('indexRecommendVideoHistoryCategoryButtons', item => {
                item.classList.remove('active')
            })
            await sleep(100)
            element.classList.add('active')
        }
        const tnameList = Array.from(
            Object.entries(indexRecommendVideoHistories)
                // eslint-disable-next-line no-unused-vars
                .reduce((acc, [_, value]) => {
                    const key = `${value.tid}_${value.tname}`
                    return acc.has(key) ? acc : acc.set(key, { tname: value.tname, tid: value.tid })
                }, new Map())
                .values()
        )
        const tnameV2List = Array.from(
            Object.entries(indexRecommendVideoHistories)
                // eslint-disable-next-line no-unused-vars
                .reduce((acc, [_, value]) => {
                    const key = `${value.tid_v2}_${value.tname_v2}`
                    return acc.has(key) ? acc : acc.set(key, { tname_v2: value.tname_v2, tid_v2: value.tid_v2 })
                }, new Map())
                .values()
        )
        for (const category of tnameList){
            createElementAndInsert(`<li data-tid="${category.tid}">${category.tname}</li>`, indexRecommendVideoHistoryCategory)
        }
        for (const category of tnameV2List){
            createElementAndInsert(`<li data-tid="${category.tid_v2}">${category.tname_v2}</li>`, indexRecommendVideoHistoryCategoryV2)
        }
        for (const record of Object.entries(indexRecommendVideoHistories)){
            createElementAndInsert(`<li><span><img src="${record[1].pic}"></span><a href="${record[1].url}" target="_blank">${record[1].title}</a></li>`, indexRecommendVideoHistoryList)
        }
        elementSelectors.each('indexRecommendVideoHistoryCategoryButtons', item => {
            addEventListenerToElement(item, 'click', async () => {
                setCategoryButtonActiveClass(item)
                indexRecommendVideoHistoryList.innerHTML = ''
                const tid = Number(item.dataset.tid)
                for (const record of Object.entries(indexRecommendVideoHistories)) {
                    if ([record[1].tid, record[1].tid_v2].includes(tid)) {
                        createElementAndInsert(`<li><span><img src="${record[1].pic}"></span><a href="${record[1].url}" target="_blank">${record[1].title}</a></li>`, indexRecommendVideoHistoryList)
                    }
                }
            })
        })
        elementSelectors.each('indexRecommendVideoHistoryCategoryButtonAll', item => {
            addEventListenerToElement(item, 'click', async () => {
                setCategoryButtonActiveClass(item)
                indexRecommendVideoHistoryList.innerHTML = ''
                for (const record of Object.entries(indexRecommendVideoHistories)) {
                    createElementAndInsert(`<li><span><img src="${record[1].pic}"></span><a href="${record[1].url}" target="_blank">${record[1].title}</a></li>`, indexRecommendVideoHistoryList)
                }
            })
        })
    },
    async clearRecommendVideoHistory (){
        await storageService.clear('index')
        const indexRecommendVideoHistoryPopover = await elementSelectors.indexRecommendVideoHistoryPopover
        indexRecommendVideoHistoryPopover.hidePopover()
    },
    handleExecuteFunctionsSequentially () {
        const functions = [
            this.setRecordRecommendVideoHistory,
            this.insertIndexRecommendVideoHistoryPopover,
            this.generatorIndexRecommendVideoHistoryContents
        ]
        executeFunctionsSequentially(functions)
    }
}
