// import { LoggerService } from '@/services/logger.service'
// const logger = new LoggerService('ElementSelectors')

const elementCache = new Map()

const selectors = {
    app: '#app',
    header: '#biliMainHeader',
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
    videoComment: '#commentapp',
    videoCommentReplyList: '#comment .reply-list',
    videoRootReplyContainer: '#comment .root-reply-container',
    videoTime: 'a[data-type="seek"]',
    videoDescription: '#v_desc',
    videoDescriptionInfo: '#v_desc .basic-desc-info',
    videoDescriptionText: '#v_desc .desc-info-text',
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
    indexRecommendVideoSix: '.recommended-container_floor-aside .feed-card:nth-child(-n+7)',
    indexRecommendVideoRollButtonWrapper: '.recommended-container_floor-aside .feed-roll-btn',
    indexRecommendVideoHistoryPopoverTitle: '#indexRecommendVideoHistoryPopoverTitle',
    indexRecommendVideoRollButton: '.recommended-container_floor-aside .feed-roll-btn button.roll-btn',
    indexRecommendVideoHistoryOpenButton: '#indexRecommendVideoHistoryOpenButton',
    indexRecommendVideoHistoryPopover: '#indexRecommendVideoHistoryPopover',
    indexRecommendVideoHistoryCategory: '#indexRecommendVideoHistoryCategory',
    indexRecommendVideoHistoryCategoryButtons: '#indexRecommendVideoHistoryCategory li',
    indexRecommendVideoHistoryCategoryButtonsExceptAll: '#indexRecommendVideoHistoryCategory li:not(.all)',
    indexRecommendVideoHistoryCategoryButtonAll: '#indexRecommendVideoHistoryCategory li.all',
    indexRecommendVideoHistoryList: '#indexRecommendVideoHistoryList',
    clearRecommendVideoHistoryButton: '#clearRecommendVideoHistoryButton',
    dynamicSettingPopover: '#dynamicSettingPopover',
    dynamicSettingSaveButton: '#dynamicSettingSaveButton',
    dynamicSettingPopoverTips: '#dynamicSettingPopoverTips',
    dynamicHeaderContainer: '#bili-header-container',
    videoSettingPopover: '#videoSettingPopover',
    videoSettingSaveButton: '#videoSettingSaveButton',
    notChargeHighLevelCover: '.not-charge-high-level-cover',
    switchSubtitleButton: '.bpx-player-ctrl-btn.bpx-player-ctrl-subtitle',
    AutoSkipSwitchInput: '#Auto-Skip-Switch',
    AutoEnableSubtitleSwitchInput: '#Auto-Enable-Subtitle',
    WebVideoLinkInput: '#Web-Video-Link',
    IsVip: '#Is-Vip',
    AutoLocate: '#Auto-Locate',
    AutoLocateVideo: '#Auto-Locate-Video',
    AutoLocateBangumi: '#Auto-Locate-Bangumi',
    TopOffset: '#Top-Offset',
    ClickPlayerAutoLocation: '#Click-Player-Auto-Location',
    AutoQuality: '#Auto-Quality',
    Quality4K: '#Quality-4K',
    Quality8K: '#Quality-8K',
    Checkbox4K: '.adjustment_checkbox.fourK',
    Checkbox8K: '.adjustment_checkbox.eightK',
    FourKAndEightK: '.fourK,.eightK',
    SelectScreenMode: 'input[name="Screen-Mode"]',
    WebfullUnlock: '#Webfull-Unlock',
    AutoReload: '#Auto-Reload',
    AutoSkip: '#Auto-Skip',
    InsertVideoDescriptionToComment: '#Insert-Video-Description-To-Comment',
    PauseVideo: '#PauseVideo',
    ContinuePlay: '#ContinuePlay',
    AutoSubtitle: '#AutoSubtitle'
}

const createCachedQuery = async selector => {
    if (elementCache.has(selector)) {
        const cached = elementCache.get(selector)
        if (cached.element?.isConnected && cached.element.matches(selector)) {
            return cached.element
        }
        elementCache.delete(selector)
    }

    // 新增元素等待机制
    const waitForElement = () => {
        const result = document.querySelector(selector)
        if (result) return result

        return new Promise(resolve => {
            const observer = new MutationObserver((_, obs) => {
                const el = document.querySelector(selector)
                if (el) {
                    obs.disconnect()
                    resolve(el)
                }
            })

            observer.observe(document, {
                childList: true,
                subtree: true
            })

            // 10秒后自动取消监听
            setTimeout(() => {
                observer.disconnect()
                resolve(null)
            }, 10000)
        })
    }

    // 同步尝试获取 + 异步监听获取组合
    const result = document.querySelector(selector) || await waitForElement()

    elementCache.set(selector, {
        element: result,
        observer: new MutationObserver(() => elementCache.delete(selector))
    })

    // 新增父元素监听
    if (result?.parentElement) {
        elementCache.get(selector).observer.observe(result.parentElement, {
            childList: true
        })
    }
    return result || null
}

export const elementSelectors = new Proxy(selectors, {
    get(target, prop) {
        const selector = target[prop]
        return createCachedQuery(selector)
    }
})

// 添加全局清理监听
window.addEventListener('unload', () => {
    elementCache.forEach(entry => entry.observer.disconnect())
})
