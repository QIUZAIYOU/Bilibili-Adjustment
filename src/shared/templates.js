const templates = {
    videoLocateButton: '<div class="fixed-sidenav-storage-item locate" title="定位至播放器" [[DATAV]]><svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg>定位</div>',
    bangumiLocateButton: '<div class="[[FLOATNAVMENUITEMCLASS]] locate" style="height:40px;padding:0" title="定位至播放器">\n<svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg></div>',
    locateToCommentBtn: '<div class="bpx-player-ctrl-btn bpx-player-ctrl-comment" role="button" aria-label="前往评论" tabindex="0"><div id="goToComments" class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="88" height="88" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px);"><path d="M512 85.333c235.637 0 426.667 191.03 426.667 426.667S747.637 938.667 512 938.667a424.779 424.779 0 0 1-219.125-60.502A2786.56 2786.56 0 0 0 272.82 866.4l-104.405 28.48c-23.893 6.507-45.803-15.413-39.285-39.296l28.437-104.288c-11.008-18.688-18.219-31.221-21.803-37.91A424.885 424.885 0 0 1 85.333 512c0-235.637 191.03-426.667 426.667-426.667zm-102.219 549.76a32 32 0 1 0-40.917 49.216A223.179 223.179 0 0 0 512 736c52.97 0 103.19-18.485 143.104-51.67a32 32 0 1 0-40.907-49.215A159.19 159.19 0 0 1 512 672a159.19 159.19 0 0 1-102.219-36.907z" fill="#currentColor"/></svg></span></div></div>',
    shadowRootVideoDescriptionReply: '<bili-adjustment-comment-thread-renderer id="adjustment-comment-description"><style>[[VIDEOCOMMENTDESCRIPTION]]</style><bili-adjustment-comment-renderer><div id="bili-adjustment-body"class="light"><a id="bili-adjustment-user-avatar"><bili-adjustment-avatar><img id="bili-adjustment-avatar-picture"src="[[UPAVATARFACELINK]]"alt="[[UPAVATARFACELINK]]"></bili-adjustment-avatar></a><div id="bili-adjustment-main"style="width:100%"><div id="bili-adjustment-header"><bili-adjustment-comment-user-info><div id="bili-adjustment-info"><div id="bili-adjustment-user-name"><a href="#"onclick="event.preventDefault()">视频简介君(ﾉ≧∀≦)ﾉ</a></div><div id="bili-adjustment-user-badge">Bilibili调整</div></div></bili-adjustment-comment-user-info></div><div id="bili-adjustment-content"><bili-adjustment-rich-text><p id="bili-adjustment-contents">[[PROCESSVIDEOCOMMENTDESCRIPTION]]</p></bili-adjustment-rich-text></div></div></div></bili-adjustment-comment-renderer><div id="bili-adjustment-spread-line"></div></bili-adjustment-comment-thread-renderer>',
    indexRecommendVideoHistoryOpenButton: '<button id="indexRecommendVideoHistoryOpenButton" popovertarget="indexRecommendVideoHistoryPopover" class="primary-btn roll-btn"><span>历史记录</span></button>',
    indexRecommendVideoHistoryPopover: '<div id="indexRecommendVideoHistoryPopover" class="adjustment_popover" popover><div id="indexRecommendVideoHistoryPopoverTitle"><span>首页视频推荐历史记录</span><div id="clearRecommendVideoHistoryButton">清空记录</div></div><div id="indexRecommendVideohistoryContents"><div id="indexRecommendVideohistoryCategories"><ul id="indexRecommendVideoHistoryCategory"><li class="all adjustment_button primary plain">全部</li></ul><hr><ul id="indexRecommendVideoHistoryCategoryV2"></ul></div><ul id="indexRecommendVideoHistoryList"></ul></div></div>'
}
const replaceTemplateKeywords = (template, variables) => {
    if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
            template = template.replaceAll(`[[${key.toUpperCase()}]]`, value)
        })
        return template
    }
    return template
}
export const getTemplates = new Proxy(templates, {
    get (target, prop) {
        if (prop === 'replace') {
            return (template, variables) => replaceTemplateKeywords(templates[template], variables)
        }
        return target[prop]
    }
})
