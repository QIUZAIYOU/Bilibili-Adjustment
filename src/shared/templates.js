const templates = {
    videoLocateButton: '<div class="fixed-sidenav-storage-item locate" title="定位至播放器" [DATAV]><svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg>定位</div>',
    bangumiLocateButton: '<div class="[FLOATNAVMENUITEMCLASS] locate" style="height:40px;padding:0" title="定位至播放器">\n<svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg></div>',
    shadowRootVideoDescriptionReply: '<bili-adjustment-comment-thread-renderer id="adjustment-comment-description"><style>[VIDEOCOMMENTDESCRIPTION]</style><bili-adjustment-comment-renderer><div id="bili-adjustment-body"class="light"><a id="bili-adjustment-user-avatar"><bili-adjustment-avatar><img id="bili-adjustment-avatar-picture"src="[UPAVATARFACELINK]"alt="[UPAVATARFACELINK]"></bili-adjustment-avatar></a><div id="bili-adjustment-main"style="width:100%"><div id="bili-adjustment-header"><bili-adjustment-comment-user-info><div id="bili-adjustment-info"><div id="bili-adjustment-user-name"><a href="#"onclick="event.preventDefault()">视频简介君(ﾉ≧∀≦)ﾉ</a></div><div id="bili-adjustment-user-badge">Bilibili调整</div></div></bili-adjustment-comment-user-info></div><div id="bili-adjustment-content"><bili-adjustment-rich-text><p id="bili-adjustment-contents">[PROCESSVIDEOCOMMENTDESCRIPTION]</p></bili-adjustment-rich-text></div></div></div></bili-adjustment-comment-renderer><div id="bili-adjustment-spread-line"></div></bili-adjustment-comment-thread-renderer>'
}
const replaceTemplateKeywords = (template, variables) => { // 修改参数名为variables
    if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
            template = template.replaceAll(`[${key.toUpperCase()}]`, value)
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
