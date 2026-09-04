import { LoggerService } from '@/services/logger.service'
import { registerSelector, getSelector, hasSelector } from './selector-registry'
const logger = new LoggerService('ElementSelectors')

// ========== 选择器定义 ==========
const CSS_MAP = {
    // 通用
    app: '#app',
    header: '#biliMainHeader',
    headerMini: '#biliMainHeader .bili-header .mini-header',
    // 播放器
    player: '#bilibili-player',
    playerWrap: '#playerWrap',
    playerWebscreen: '#bilibili-player.mode-webscreen',
    playerContainer: '#bilibili-player .bpx-player-container',
    playerController: '#bilibili-player .bpx-player-ctrl-btn',
    playerProgress: '.bpx-player-progress-area .bpx-player-progress',
    playerControllerBottomRight: '.bpx-player-control-bottom-right',
    playerTooltipArea: '.bpx-player-tooltip-area',
    playerTooltipTitle: '.bpx-player-tooltip-title',
    playerDanmuSetting: '.bpx-player-dm-setting',
    playerEndingRelateVideo: '.bpx-player-ending-related-item',
    volumeButton: '.bpx-player-ctrl-volume-icon',
    mutedButton: '.bpx-player-ctrl-muted-icon',
    // 右键菜单
    playerContextMenu: '.bpx-player-contextmenu',
    // 视频
    video: '#bilibili-player video',
    videoWrap: '#bilibili-player .bpx-player-video-wrap',
    videoBwp: 'bwp-video',
    videoTitleArea: '#viewbox_report',
    videoTitle: '#viewbox_report h1',
    playerTitle: '#player-title',
    videoFloatNav: '.fixed-sidenav-storage',
    videoFloatNavBackToTopButton: '.back-to-top-wrap',
    // 评论区
    videoComment: '#commentapp',
    videoCommentRoot: 'bili-comments',
    videoCommentReplyList: '#comment .reply-list',
    videoCommentRenderder: 'bili-comment-renderer',
    videoCommentReplyRenderder: 'bili-comment-reply-renderer',
    videoRootReplyContainer: '#comment .root-reply-container',
    videoReplyPubDate: '#pubdate',
    videoTime: 'a[data-type="seek"]',
    // 视频简介
    videoDescription: '#v_desc',
    videoDescriptionInfo: '#v_desc .basic-desc-info',
    videoDescriptionText: '#v_desc .desc-info-text',
    adjustmentCommentDescription: '#adjustment-comment-description',
    // 推荐/选集
    videoNextPlayAndRecommendLink: '.video-page-card-small .card-box',
    videoSectionsEpisodeLink: '.video-pod__list .video-pod__item',
    videoEpisodeListMultiMenuItem: '.bpx-player-ctrl-eplist-multi-menu-item',
    videoMultiPageLink: '#multi_page ul li',
    videoPreviousButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-prev',
    videoNextButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-next',
    // 番剧
    bangumiApp: '#__next',
    bangumiComment: '#comment_module',
    bangumiFloatNav: '#__next div[class*="navTools_floatNavExp"] div[class*="navTools_navMenu"]',
    bangumiMainContainer: '.main-container',
    bangumiSectionsEpisodeLink: '#__next div[class*="numberList_wrapper"] div[class*="numberListItem_number_list_item"] ',
    // 播放器控制
    qualitySwitchButtons: '.bpx-player-ctrl-quality-menu-item',
    playerModeWideEnterButton: '.bpx-player-ctrl-wide-enter',
    playerModeWideLeaveButton: '.bpx-player-ctrl-wide-leave',
    playerModeWebEnterButton: '.bpx-player-ctrl-web-enter',
    playerModeWebLeaveButton: '.bpx-player-ctrl-web-leave',
    playerModeFullControlButton: '.bpx-player-ctrl-full',
    highResButton: '.bpx-player-ctrl-flac',
    // 弹幕/字幕
    danmukuBox: '#danmukuBox',
    danmuShowHideTip: 'div[aria-label="弹幕显示隐藏"]',
    switchSubtitleButton: '[aria-label="字幕"]',
    subtitleLanguageChineseAI: '[data-lan="ai-zh"]',
    subtitleCloseSwitch: '[data-action="close"]',
    // 迷你播放器
    miniPlayer: '#mirror-vdcon .mini-player-window.fixed-sidenav-storage-item',
    miniPlayerOpen: '.mini-player-window[title="点击打开迷你播放器"]',
    miniPlayerClose: '.mini-player-window[title="点击关闭迷你播放器"]',
    // UP主信息
    membersContainer: '.members-info-container',
    membersUpAvatarFace: '.membersinfo-upcard:first-child picture img',
    upAvatarFace: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-face',
    upAvatarDecoration: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-pendent-dom .bili-avatar-img',
    upAvatarIcon: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-icon',
    // 跳过时间节点弹窗
    setSkipTimeNodesPopover: '#setSkipTimeNodesPopover',
    setSkipTimeNodesPopoverToggleButton: '#setSkipTimeNodesPopoverToggleButton',
    setSkipTimeNodesPopoverHeaderExtra: '#setSkipTimeNodesPopover .header .extra',
    setSkipTimeNodesPopoverTips: '#setSkipTimeNodesPopover .tips',
    setSkipTimeNodesPopoverTipsDetail: '#setSkipTimeNodesPopover .tips .detail',
    setSkipTimeNodesPopoverTipsContents: '#setSkipTimeNodesPopover .tips .contents',
    setSkipTimeNodesPopoverRecords: '#setSkipTimeNodesPopover .setSkipTimeNodesWrapper .records',
    setSkipTimeNodesPopoverClouds: '#setSkipTimeNodesPopover .setSkipTimeNodesWrapper .clouds',
    setSkipTimeNodesPopoverResult: '#setSkipTimeNodesPopover .setSkipTimeNodesWrapper .result',
    setSkipTimeNodesInput: '#setSkipTimeNodesInput',
    skipTimeNodesRecordsArray: '#skipTimeNodesRecordsArray',
    skipTimeNodesCloudsArray: '#skipTimeNodesCloudsArray',
    clearRecordsButton: '#clearRecordsButton',
    saveRecordsButton: '#saveRecordsButton',
    uploadSkipTimeNodesButton: '#uploadSkipTimeNodesButton',
    syncSkipTimeNodesButton: '#syncSkipTimeNodesButton',
    // 首页
    indexApp: '#app',
    indexRecommendVideo: '.recommended-container_floor-aside .feed-card:nth-child(-n+11):not(:has([class*="-ad"]))',
    indexRecommendVideoRollButtonWrapper: '.recommended-container_floor-aside .feed-roll-btn',
    indexRecommendVideoHistoryPopoverTitle: '#indexRecommendVideoHistoryPopoverTitle',
    indexRecommendVideoHistoryPopoverTitleCount: '#indexRecommendVideoHistoryPopoverTitle span',
    indexRecommendVideoRollButton: '.recommended-container_floor-aside .feed-roll-btn button.roll-btn',
    indexRecommendVideoHistoryOpenButton: '#indexRecommendVideoHistoryOpenButton',
    indexRecommendVideoHistoryPopover: '#indexRecommendVideoHistoryPopover',
    indexRecommendVideoHistoryCategory: '#indexRecommendVideoHistoryCategory',
    indexRecommendVideoHistoryCategoryV2: '#indexRecommendVideoHistoryCategoryV2',
    indexRecommendVideoHistoryCategoryButtons: '#indexRecommendVideoHistoryCategory li,#indexRecommendVideoHistoryCategoryV2 li',
    indexRecommendVideoHistoryCategoryButtonsExceptAll: '#indexRecommendVideoHistoryCategory li:not(.all)',
    indexRecommendVideoHistoryCategoryButtonAll: '#indexRecommendVideoHistoryCategory li.all,#indexRecommendVideoHistoryCategoryV2 li.all_v2',
    indexRecommendVideoHistoryList: '#indexRecommendVideoHistoryList',
    indexRecommendVideoHistoryListItem: '#indexRecommendVideoHistoryList li',
    indexRecommendVideoHistorySearchInput: '#indexRecommendVideoHistorySearchInput',
    clearRecommendVideoHistoryButton: '#clearRecommendVideoHistoryButton',
    notChargeHighLevelCover: '.not-charge-high-level-cover',
    // 动态页
    dynamicListItem: '.bili-dyn-list__item',
    dynamicSidebar: '.bili-dyn-sidebar',
    dynamicCommentLoadButton: '[data-type="comment"]:not(.active)',
    DynamicSettingsPopover: '#DynamicSettingsPopover',
    DynamicSettingSaveButton: '#DynamicSettingSaveButton',
    DynamicSettingsPopoverTips: '#DynamicSettingsPopoverTips',
    DynamicHeaderContainer: '#bili-header-container',
    // 设置弹窗
    VideoSettingsPopover: '#VideoSettingsPopover',
    VideoSettingsSaveButton: '#VideoSettingsSaveButton',
    AutoSkipSwitchInput: '#AutoSkipSwitch',
    AutoEnableSubtitleSwitchInput: '#AutoEnableSubtitle',
    AutoEnableSubtitleTooltipTitle: '#autoEnableSubtitleTip .bpx-player-tooltip-title',
    WebVideoLinkInput: '#WebVideoLink',
    IsVip: '#IsVip',
    AutoLocate: '#AutoLocate',
    AutoLocateVideo: '#AutoLocateVideo',
    AutoLocateBangumi: '#AutoLocateBangumi',
    OffsetTop: '#OffsetTop',
    ClickPlayerAutoLocate: '#ClickPlayerAutoLocate',
    AutoSelectVideoHighestQuality: '#AutoSelectVideoHighestQuality',
    ContainQuality4k: '#ContainQuality4k',
    ContainQuality8k: '#ContainQuality8k',
    Checkbox4K: '#Checkbox4K',
    Checkbox8K: '#Checkbox8K',
    FourKAndEightK: '.fourK,.eightK',
    SelectPlayerModeButtons: 'input[name="PlayerMode"]',
    WebfullUnlock: '#WebfullUnlock',
    AutoReload: '#AutoReload',
    AutoSkip: '#AutoSkip',
    InsertVideoDescriptionToComment: '#InsertVideoDescriptionToComment',
    PauseVideo: '#PauseVideo',
    ContinuePlay: '#ContinuePlay',
    AutoSubtitle: '#AutoSubtitle',
    AutoHiRes: '#AutoHiRes',
    RemoveCommentTags: '#RemoveCommentTags',
    ShowCommentLocation: '#ShowCommentLocation',
    AutoCheckUpdate: '#AutoCheckUpdate',
    AiApikey: '#AiApikey',
    LogLevelInfo: '#LogLevelInfo',
    LogLevelError: '#LogLevelError',
    LogLevelWarn: '#LogLevelWarn',
    LogLevelDebug: '#LogLevelDebug',
    UpdateCheckFrequency: '#UpdateCheckFrequency',
    AutoUpdate: '#AutoUpdate',
    SkipUpdateCheck: '#SkipUpdateCheck',
    AIProvider: '#AIProvider',
    CustomBaseURL: '#CustomBaseURL',
    AIModel: '#AIModel',
    UseCustomModel: '#UseCustomModel',
    CustomModelId: '#CustomModelId',
    RefreshModels: '#RefreshModels',
    ValidateApiKey: '#ValidateApiKey',
    ValidateCustomModelApiKey: '#ValidateCustomModelApiKey',
    CustomModelApiUrl: '#CustomModelApiUrl',
    CustomModelApiKey: '#CustomModelApiKey',
    ExportUserConfigs: '#ExportUserConfigs',
    ImportUserConfigsFileInput: '#ImportUserConfigsFileInput',
    ImportUserConfigs: '#ImportUserConfigs',
    // 样式标签
    BilibiliAdjustmentStyle: '#BilibiliAdjustmentStyle',
    VideoPageAdjustmentStyle: '#VideoPageAdjustmentStyle',
    FreezeHeaderAndVideoTitleStyle: '#FreezeHeaderAndVideoTitleStyle',
    UnlockEpisodeSelectorStyle: '#UnlockEpisodeSelectorStyle',
    UnlockWebPlayerStyle: '#UnlockWebPlayerStyle',
    ResetPlayerLayoutStyle: '#ResetPlayerLayoutStyle',
    VideoSettingsStyle: '#VideoSettingsStyle',
    IndexAdjustmentStyle: '#IndexAdjustmentStyle',
    DynamicSettingStyle: '#DynamicSettingStyle',
    BodyOverflowHiddenStyle: '#BodyOverflowHiddenStyle'
}

// ========== Shadow DOM 选择器 ==========
export const shadowDomSelectors = {
    descriptionRenderer: '#feed > bili-adjustment-comment-thread-renderer',
    timeSeekElement: '[data-type="seek"]',
    commentRenderderContainer: '#feed',
    commentRenderder: 'bili-comment-renderer',
    commentRepliesRenderer: 'bili-comment-replies-renderer',
    commentReplyRenderder: 'bili-comment-reply-renderer',
    commentTags: '#tags'
}

// ========== 页面类型专属选择器 ==========
// 用于 wait() 判断：如果选择器属于其他页面类型，直接跳过不等待
const PAGE_TYPE_EXCLUSIVE = {
    video: new Set([
        'videoTitleArea', 'videoTitle', 'playerTitle',
        'videoFloatNav', 'videoFloatNavBackToTopButton',
        'videoNextPlayAndRecommendLink', 'videoSectionsEpisodeLink',
        'videoEpisodeListMultiMenuItem', 'videoMultiPageLink',
        'videoPreviousButton', 'videoNextButton'
    ]),
    bangumi: new Set([
        'bangumiApp', 'bangumiComment', 'bangumiFloatNav',
        'bangumiMainContainer', 'bangumiSectionsEpisodeLink'
    ]),
    home: new Set([
        'indexApp', 'indexRecommendVideo', 'indexRecommendVideoRollButtonWrapper',
        'indexRecommendVideoHistoryPopoverTitle', 'indexRecommendVideoHistoryPopoverTitleCount',
        'indexRecommendVideoRollButton', 'indexRecommendVideoHistoryOpenButton',
        'indexRecommendVideoHistoryPopover', 'indexRecommendVideoHistoryCategory',
        'indexRecommendVideoHistoryCategoryV2', 'indexRecommendVideoHistoryCategoryButtons',
        'indexRecommendVideoHistoryCategoryButtonsExceptAll',
        'indexRecommendVideoHistoryCategoryButtonAll',
        'indexRecommendVideoHistoryList', 'indexRecommendVideoHistoryListItem',
        'indexRecommendVideoHistorySearchInput', 'clearRecommendVideoHistoryButton',
        'notChargeHighLevelCover'
    ]),
    dynamic: new Set([
        'dynamicListItem', 'dynamicSidebar', 'dynamicCommentLoadButton',
        'DynamicSettingsPopover', 'DynamicSettingSaveButton',
        'DynamicSettingsPopoverTips', 'DynamicHeaderContainer'
    ])
}

// ========== 初始化：注册所有选择器 ==========
Object.entries(CSS_MAP).forEach(([name, selector]) => {
    try {
        registerSelector(name, selector)
    } catch (e) {
        logger.warn(`选择器注册失败: ${name}`, e.message)
    }
})

// ========== 缓存系统 ==========
const elementCache = new Map()
const CACHE_MAX_SIZE = 50

// ========== 负缓存：已知不存在的元素短期内不再等待 ==========
const NEGATIVE_CACHE_TTL = 5000 // 5 秒
const negativeCache = new Map() // key → expiry timestamp

const getNegativeCacheKey = (key, all) => `${key}|${all}`

const setNegative = (key, all) => {
    negativeCache.set(getNegativeCacheKey(key, all), Date.now() + NEGATIVE_CACHE_TTL)
}

const checkNegative = (key, all) => {
    const k = getNegativeCacheKey(key, all)
    const expiry = negativeCache.get(k)
    if (expiry === undefined) return false
    if (Date.now() > expiry) {
        negativeCache.delete(k)
        return false
    }
    return true
}

/**
 * 清理最旧的缓存条目
 */
const trimCache = () => {
    if (elementCache.size <= CACHE_MAX_SIZE) return
    const entriesToDelete = elementCache.size - CACHE_MAX_SIZE
    const keys = elementCache.keys()
    for (let i = 0; i < entriesToDelete; i++) {
        const key = keys.next().value
        if (key) {
            const entry = elementCache.get(key)
            entry?.observer?.disconnect()
            elementCache.delete(key)
        }
    }
}

/**
 * 内部：同步查询 DOM，带缓存
 * @param {string} key - 选择器名称
 * @param {boolean} all - 是否查询所有匹配元素
 * @returns {Element|Element[]|null}
 */
const syncQuery = (key, all = false) => {
    const selector = CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)
    if (!selector) {
        logger.error(`未注册的选择器: "${key}"`)
        return all ? [] : null
    }
    if (all) {
        return [...document.querySelectorAll(selector)]
    }
    // 检查缓存
    const cacheKey = `${selector}|false`
    if (elementCache.has(cacheKey)) {
        const cached = elementCache.get(cacheKey)
        if (cached.element?.isConnected && cached.element.matches?.(selector)) {
            return cached.element
        }
        cached.observer?.disconnect()
        elementCache.delete(cacheKey)
    }
    const element = document.querySelector(selector)
    if (!element) return null
    // 缓存结果
    trimCache()
    const observer = new MutationObserver(() => {
        observer.disconnect()
        elementCache.delete(cacheKey)
    })
    elementCache.set(cacheKey, { element, observer })
    if (element.parentElement) {
        observer.observe(element.parentElement, { childList: true })
    }
    return element
}

/**
 * 内部：异步等待元素出现（带 MutationObserver + 超时）
 * @param {string} key - 选择器名称
 * @param {number} timeout - 超时毫秒数
 * @param {boolean} all - 是否查询所有匹配元素
 * @returns {Promise<Element|Element[]|null>}
 */
const asyncWait = (key, timeout = 3000, all = false) => {
    const selector = CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)
    if (!selector) {
        logger.error(`未注册的选择器: "${key}"`)
        return Promise.resolve(all ? [] : null)
    }
    // 页面类型检查：如果选择器属于其他页面类型，直接跳过
    const currentPageType = getCurrentPageType()
    if (currentPageType) {
        for (const [pageType, exclusiveSet] of Object.entries(PAGE_TYPE_EXCLUSIVE)) {
            if (pageType !== currentPageType && exclusiveSet.has(key)) {
                logger.debug(`选择器 "${key}" 属于 ${pageType} 页，当前为 ${currentPageType} 页，跳过等待`)
                setNegative(key, all)
                return Promise.resolve(all ? [] : null)
            }
        }
    }
    // 负缓存检查
    if (checkNegative(key, all)) {
        return Promise.resolve(all ? [] : null)
    }
    // 先尝试同步查询
    const queryMethod = all ? 'querySelectorAll' : 'querySelector'
    let result = document[queryMethod](selector)
    if (all && result.length > 0) return Promise.resolve([...result])
    if (!all && result) {
        // 缓存单元素
        if (!elementCache.has(`${selector}|false`)) {
            trimCache()
            const observer = new MutationObserver(() => {
                observer.disconnect()
                elementCache.delete(`${selector}|false`)
            })
            elementCache.set(`${selector}|false`, { element: result, observer })
            if (result.parentElement) {
                observer.observe(result.parentElement, { childList: true })
            }
        }
        return Promise.resolve(result)
    }
    // 元素不存在，创建 MutationObserver 等待
    return new Promise(resolve => {
        const observer = new MutationObserver(() => {
            const els = document[queryMethod](selector)
            if ((all && els.length > 0) || (!all && els)) {
                observer.disconnect()
                clearTimeout(timer)
                resolve(all ? [...els] : els)
            }
        })
        observer.observe(document, { childList: true, subtree: true })
        const timer = setTimeout(() => {
            observer.disconnect()
            setNegative(key, all)
            resolve(all ? [] : null)
        }, timeout)
    })
}

// ========== 当前页面类型缓存 ==========
let _currentPageType = null

const getCurrentPageType = () => {
    if (_currentPageType !== null) return _currentPageType
    const path = location.pathname
    if (path.startsWith('/bangumi/')) _currentPageType = 'bangumi'
    else if (path.startsWith('/video/')) _currentPageType = 'video'
    else if (path === '/' || path.startsWith('/home')) _currentPageType = 'home'
    else if (path.startsWith('/dynamic')) _currentPageType = 'dynamic'
    else _currentPageType = 'other'
    return _currentPageType
}

// ========== 对外暴露的 API ==========
export const elementSelectors = {
    /**
     * 同步查询：立即返回 DOM 中已存在的元素，不存在返回 null
     * 适用于大多数场景：元素应该已经在页面上
     * @param {string} key - 选择器名称
     * @returns {Element|null}
     */
    get (key) {
        return syncQuery(key, false)
    },

    /**
     * 异步等待：等待元素出现在 DOM 中，超时返回 null
     * 适用于元素在页面 JS 加载后才渲染的场景
     * @param {string} key - 选择器名称
     * @param {number} [timeout=3000] - 超时毫秒数（默认 3 秒）
     * @returns {Promise<Element|null>}
     */
    wait (key, timeout = 3000) {
        return asyncWait(key, timeout, false)
    },

    /**
     * 获取原始 CSS 选择器字符串（替代旧版 .value()）
     * @param {string} key - 选择器名称
     * @returns {string|null}
     */
    CSS (key) {
        return CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)
    },

    /**
     * 批量查询多个选择器（一次 DOM 遍历）
     * @param {string[]} keys - 选择器名称数组
     * @returns {Promise<(Element|null)[]>}
     */
    async batch (keys) {
        const selectorStrings = keys.map(k => CSS_MAP[k] || (hasSelector(k) ? getSelector(k) : null)).filter(Boolean)
        if (selectorStrings.length === 0) {
            logger.error('batch 查询失败: 所有选择器均未注册')
            return keys.map(() => null)
        }
        const combinedSelector = selectorStrings.join(', ')
        // 先同步查询
        let elements = [...document.querySelectorAll(combinedSelector)]
        if (elements.length === 0) {
            // 异步等待（用最长的超时）
            elements = await new Promise(resolve => {
                const observer = new MutationObserver(() => {
                    const els = [...document.querySelectorAll(combinedSelector)]
                    if (els.length > 0) {
                        observer.disconnect()
                        clearTimeout(timer)
                        resolve(els)
                    }
                })
                observer.observe(document, { childList: true, subtree: true })
                const timer = setTimeout(() => {
                    observer.disconnect()
                    resolve([])
                }, 3000)
            })
        }
        // 分发到各个选择器
        const resultMap = new Map()
        elements.forEach(el => {
            keys.forEach(k => {
                const sel = CSS_MAP[k] || (hasSelector(k) ? getSelector(k) : null)
                if (sel && el.matches(sel) && !resultMap.has(k)) {
                    resultMap.set(k, el)
                }
            })
        })
        return keys.map(k => resultMap.get(k) || null)
    },

    /**
     * 遍历所有匹配元素（同步）
     * @param {string} key - 选择器名称
     * @param {Function} callback - 对每个元素执行的回调
     */
    each (key, callback) {
        const elements = syncQuery(key, true)
        elements.forEach(callback)
    },

    /**
     * 查询所有匹配元素（同步，不缓存）
     * @param {string} key - 选择器名称
     * @returns {Element[]}
     */
    queryAll (key) {
        return syncQuery(key, true)
    },

    /**
     * 原始 CSS 选择器映射表（用于需要完整列表的场景）
     */
    CSS_MAP
}

// ========== 页面卸载时清理 ==========
window.addEventListener('unload', () => {
    elementCache.forEach(entry => entry.observer.disconnect())
    elementCache.clear()
    negativeCache.clear()
})
