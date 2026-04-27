import { LoggerService } from '@/services/logger.service'
import {
    registerSelector, getSelector, hasSelector, recordUsage
} from './selector-registry'
const logger = new LoggerService('ElementSelectors')
// ========== 选择器定义 ==========
const selectors = {
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
    playerControllerBottomRight: '.bpx-player-control-bottom-right',
    playerTooltipArea: '.bpx-player-tooltip-area',
    playerTooltipTitle: '.bpx-player-tooltip-title',
    playerDanmuSetting: '.bpx-player-dm-setting',
    playerEndingRelateVideo: '.bpx-player-ending-related-item',
    volumeButton: '.bpx-player-ctrl-volume-icon',
    mutedButton: '.bpx-player-ctrl-muted-icon',
    // 视频
    video: '#bilibili-player video',
    videoWrap: '#bilibili-player .bpx-player-video-wrap',
    videoBwp: 'bwp-video',
    videoTitleArea: '#viewbox_report',
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
// ========== 分类元数据 ==========
const selectorMeta = {
    // 播放器相关
    player: { category: 'player', description: '播放器主容器' },
    playerWrap: { category: 'player', description: '播放器包装层' },
    playerContainer: { category: 'player', description: '播放器控制容器' },
    playerController: { category: 'player', description: '播放器控制按钮' },
    playerTooltipArea: { category: 'player', description: '播放器提示区域' },
    volumeButton: { category: 'player', description: '音量按钮' },
    mutedButton: { category: 'player', description: '静音按钮' },
    // 视频相关
    video: { category: 'video', description: '视频元素' },
    videoTitleArea: { category: 'video', description: '视频标题区域' },
    videoDescription: { category: 'video', description: '视频简介' },
    videoDescriptionInfo: { category: 'video', description: '视频简介信息' },
    // 评论相关
    videoComment: { category: 'comment', description: '评论区容器' },
    videoCommentRoot: { category: 'comment', description: '评论根元素' },
    videoCommentRenderder: { category: 'comment', description: '评论渲染器' },
    adjustmentCommentDescription: { category: 'comment', description: '插入评论区的视频简介' },
    // 设置相关
    VideoSettingsPopover: { category: 'settings', description: '视频设置弹窗' },
    IsVip: { category: 'settings', description: '大会员开关' },
    AutoLocate: { category: 'settings', description: '自动定位开关' },
    LogLevelInfo: { category: 'settings', description: 'Info日志级别' },
    LogLevelError: { category: 'settings', description: 'Error日志级别' },
    LogLevelWarn: { category: 'settings', description: 'Warn日志级别' },
    LogLevelDebug: { category: 'settings', description: 'Debug日志级别' }
}
// ========== 初始化注册所有选择器 ==========
Object.entries(selectors).forEach(([name, selector]) => {
    try {
        registerSelector(name, selector, selectorMeta[name] || { category: 'general' })
    } catch (e) {
        logger.warn(`选择器注册失败: ${name}`, e.message)
    }
})
// ========== 缓存系统 ==========
const elementCache = new Map()
const CACHE_MAX_SIZE = 200
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
 * 验证选择器名称是否已注册
 * @param {string} selectorKey
 * @returns {string|null}
 */
const resolveSelector = selectorKey => {
    if (hasSelector(selectorKey)) {
        return getSelector(selectorKey)
    }
    // 兼容直接使用 CSS 选择器字符串的情况（用于外部传入的原始选择器）
    if (typeof selectorKey === 'string' && selectorKey.includes(' ') || selectorKey.startsWith('#') || selectorKey.startsWith('.')) {
        return selectorKey
    }
    logger.error(`未注册的选择器: "${selectorKey}"，请先在 element-selectors.js 中定义或在 SelectorRegistry 中注册`)
    return null
}
/**
 * 带缓存和性能监控的元素查询
 * @param {string} selectorKey - 选择器名称或 CSS 选择器
 * @param {boolean} all - 是否查询所有匹配元素
 * @returns {Promise<Element|Element[]|null>}
 */
const createCachedQuery = async (selectorKey, all = false) => {
    const startTime = performance.now()
    const selector = resolveSelector(selectorKey)
    if (!selector) {
        recordUsage(selectorKey, performance.now() - startTime)
        return all ? [] : null
    }
    const cacheKey = `${selector}|${all}`
    // 检查缓存
    if (elementCache.has(cacheKey)) {
        const cached = elementCache.get(cacheKey)
        const elements = Array.isArray(cached.element) ? cached.element : [cached.element]
        if (elements.every(el => el?.isConnected && el.matches?.(selector))) {
            recordUsage(selectorKey, performance.now() - startTime)
            return all ? elements : elements[0]
        }
        elementCache.delete(cacheKey)
    }
    const queryMethod = all ? 'querySelectorAll' : 'querySelector'
    const waitForElements = () => {
        const result = document[queryMethod](selector)
        if (result && !all && result !== null) return result
        if (all && result?.length > 0) return result
        return new Promise(resolve => {
            const observer = new MutationObserver(() => {
                const els = document[queryMethod](selector)
                if ((all && els.length > 0) || (!all && els)) {
                    observer.disconnect()
                    resolve(els)
                }
            })
            observer.observe(document, {
                childList: true,
                subtree: true
            })
            setTimeout(() => {
                observer.disconnect()
                resolve(all ? [] : null)
            }, 10000)
        })
    }
    let result = document[queryMethod](selector) || await waitForElements()
    if (all && !(result instanceof NodeList)) {
        result = result ? [result] : []
    }
    // 存储缓存
    trimCache()
    elementCache.set(cacheKey, {
        element: all ? [...result] : result,
        observer: new MutationObserver(() => elementCache.delete(cacheKey))
    })
    if (result && !all && result.parentElement) {
        elementCache.get(cacheKey).observer.observe(result.parentElement, {
            childList: true
        })
    }
    recordUsage(selectorKey, performance.now() - startTime)
    return all ? [...result] : result
}
/**
 * 遍历所有匹配元素
 * @param {string} selectorKey
 * @param {Function} callback
 */
const each = async (selectorKey, callback) => {
    const selector = resolveSelector(selectorKey)
    if (!selector) return
    const elements = await createCachedQuery(selectorKey, true)
    elements.forEach(callback)
}
// ========== 对外暴露的 Proxy API ==========
export const elementSelectors = new Proxy(selectors, {
    get (target, prop) {
        if (prop === 'batch') {
            return async selArray => {
                const selectorString = selArray.map(s => resolveSelector(s) || '').filter(Boolean).join(', ')
                if (!selectorString) {
                    logger.error('batch 查询失败: 所有选择器均未注册')
                    return selArray.map(() => null)
                }
                const elements = await createCachedQuery(selectorString, true)
                const elementMap = new Map()
                elements.forEach(el => {
                    selArray.forEach(s_1 => {
                        const sel = resolveSelector(s_1)
                        if (sel && el.matches(sel)) elementMap.set(s_1, el)
                    })
                })
                return selArray.map(s_2 => elementMap.get(s_2))
            }
        }
        if (prop === 'all') return selector => createCachedQuery(selector, true)
        if (prop === 'value') return selector => resolveSelector(selector)
        if (prop === 'query') {return selector => {
            const sel = resolveSelector(selector)
            return sel ? document.querySelector(sel) : null
        }}
        if (prop === 'queryAll') {return selector => {
            const sel = resolveSelector(selector)
            return sel ? document.querySelectorAll(sel) : []
        }}
        if (prop === 'each') return each
        // 返回带验证的选择器字符串
        return createCachedQuery(target[prop])
    }
})
// ========== 页面卸载时清理 ==========
window.addEventListener('unload', () => {
    elementCache.forEach(entry => entry.observer.disconnect())
    elementCache.clear()
})
