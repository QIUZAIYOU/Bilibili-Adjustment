/* global NodeList */
const elementCache = new Map()
const selectors = {
    app: '#app',
    header: '#biliMainHeader',
    headerMini: '#biliMainHeader .bili-header .mini-header',
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
    video: '#bilibili-player video',
    videoWrap: '#bilibili-player .bpx-player-video-wrap',
    videoBwp: 'bwp-video',
    videoTitleArea: '#viewbox_report',
    videoFloatNav: '.fixed-sidenav-storage',
    videoFloatNavBackToTopButton: '.back-to-top-wrap',
    videoComment: '#commentapp',
    videoCommentRoot: 'bili-comments',
    videoCommentReplyList: '#comment .reply-list',
    videoCommentRenderder: 'bili-comment-renderer',
    videoCommentReplyRenderder: 'bili-comment-reply-renderer',
    videoRootReplyContainer: '#comment .root-reply-container',
    videoReplyPubDate: '#pubdate',
    videoTime: 'a[data-type="seek"]',
    videoDescription: '#v_desc',
    videoDescriptionInfo: '#v_desc .basic-desc-info',
    videoDescriptionText: '#v_desc .desc-info-text',
    adjustmentCommentDescription: '#adjustment-comment-description',
    videoNextPlayAndRecommendLink: '.video-page-card-small .card-box',
    videoSectionsEpisodeLink: '.video-pod__list .video-pod__item',
    videoEpisodeListMultiMenuItem: '.bpx-player-ctrl-eplist-multi-menu-item',
    videoMultiPageLink: '#multi_page ul li',
    videoPreviousButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-prev',
    videoNextButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-next',
    bangumiApp: '#__next',
    bangumiComment: '#comment_module',
    bangumiFloatNav: '#__next div[class*="navTools_floatNavExp"] div[class*="navTools_navMenu"]',
    bangumiMainContainer: '.main-container',
    bangumiSectionsEpisodeLink: '#__next div[class*="numberList_wrapper"] div[class*="numberListItem_number_list_item"] ',
    qualitySwitchButtons: '.bpx-player-ctrl-quality-menu-item',
    playerModeWideEnterButton: '.bpx-player-ctrl-wide-enter',
    playerModeWideLeaveButton: '.bpx-player-ctrl-wide-leave',
    playerModeWebEnterButton: '.bpx-player-ctrl-web-enter',
    playerModeWebLeaveButton: '.bpx-player-ctrl-web-leave',
    playerModeFullControlButton: '.bpx-player-ctrl-full',
    highResButton: '.bpx-player-ctrl-flac',
    danmukuBox: '#danmukuBox',
    danmuShowHideTip: 'div[aria-label="弹幕显示隐藏"]',
    membersContainer: '.members-info-container',
    membersUpAvatarFace: '.membersinfo-upcard:first-child picture img',
    upAvatarFace: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-face',
    upAvatarDecoration: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-pendent-dom .bili-avatar-img',
    upAvatarIcon: '.up-info-container .up-avatar-wrap .bili-avatar .bili-avatar-icon',
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
    indexApp: '#i_cecream',
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
    clearRecommendVideoHistoryButton: '#clearRecommendVideoHistoryButton',
    notChargeHighLevelCover: '.not-charge-high-level-cover',
    switchSubtitleButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-subtitle',
    subtitleLanguageChinese: '.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]',
    subtitleCloseSwitch: '.bpx-player-ctrl-subtitle-close-switch',
    dynamicListItem: '.bili-dyn-list__item',
    dynamicSidebar: '.bili-dyn-sidebar',
    dynamicCommentLoadButton: '[data-type="comment"]:not(.active)',
    DynamicSettingsPopover: '#DynamicSettingsPopover',
    DynamicSettingSaveButton: '#DynamicSettingSaveButton',
    DynamicSettingsPopoverTips: '#DynamicSettingsPopoverTips',
    DynamicHeaderContainer: '#bili-header-container',
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
    ExportUserConfigs: '#ExportUserConfigs',
    ImportUserConfigsFileInput: '#ImportUserConfigsFileInput',
    ImportUserConfigs: '#ImportUserConfigs',
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
export const shadowDomSelectors = {
    descriptionRenderer: '#feed > bili-adjustment-comment-thread-renderer',
    timeSeekElement: '[data-type="seek"]',
    commentRenderderContainer: '#feed',
    commentRenderder: 'bili-comment-renderer',
    commentRepliesRenderer: 'bili-comment-replies-renderer',
    commentReplyRenderder: 'bili-comment-reply-renderer',
    commentTags: '#tags'
}
const createCachedQuery = async (selector, all = false) => {
    const cacheKey = `${selector}|${all}`
    if (elementCache.has(cacheKey)) {
        const cached = elementCache.get(cacheKey)
        const elements = Array.isArray(cached.element) ? cached.element : [cached.element]
        if (elements.every(el => el?.isConnected && el.matches?.(selector))) {
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
    elementCache.set(cacheKey, {
        element: all ? [...result] : result,
        observer: new MutationObserver(() => elementCache.delete(cacheKey))
    })
    if (result && !all && result.parentElement) {
        elementCache.get(cacheKey).observer.observe(result.parentElement, {
            childList: true
        })
    }
    return all ? [...result] : result
}
const each = async (selectorKey, callback) => {
    const selector = selectors[selectorKey]
    const elements = await createCachedQuery(selector, true)
    elements.forEach(callback)
}
export const elementSelectors = new Proxy(selectors, {
    get (target, prop) {
        if (prop === 'batch') {
            return async selArray => {
                const selectorString = selArray.map(s => target[s]).join(', ')
                // console.log(selectorString)
                const elements = await createCachedQuery(selectorString, true)
                const elementMap = new Map()
                elements.forEach(el => {
                    selArray.forEach(s_1 => {
                        if (el.matches(target[s_1])) elementMap.set(s_1, el)
                    })
                })
                return selArray.map(s_2 => elementMap.get(s_2))
            }
        }
        if (prop === 'all') return selector => createCachedQuery(selector, true)
        if (prop === 'value') return selector => selectors[selector]
        if (prop === 'query') return selector => document.querySelector(selectors[selector])
        if (prop === 'queryAll') return selector => document.querySelectorAll(selectors[selector])
        if (prop === 'each') return each
        return createCachedQuery(target[prop])
    }
})
window.addEventListener('unload', () => {
    elementCache.forEach(entry => entry.observer.disconnect())
})
