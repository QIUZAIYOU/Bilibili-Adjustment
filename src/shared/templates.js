const templates = {
    locateButton: '<div class="[[CLASS]]" [[STYLE]] title="定位至播放器" [[DATAV]]><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M432 512a80 80 0 1 0 160 0 80 80 0 1 0-160 0z"/><path fill="currentColor" d="M960 480h-33.632C910.752 276.16 747.84 113.248 544 97.632V64a32 32 0 1 0-64 0v33.632C276.16 113.248 113.248 276.16 97.632 480H64a32 32 0 0 0 0 64h33.632C113.248 747.84 276.16 910.752 480 926.368V960a32 32 0 1 0 64 0v-33.632C747.84 910.752 910.752 747.84 926.368 544H960a32 32 0 1 0 0-64zM544 862.368V800a32 32 0 1 0-64 0v62.368C311.424 847.104 176.896 712.576 161.632 544H224a32 32 0 1 0 0-64h-62.368C176.896 311.424 311.424 176.896 480 161.632V224a32 32 0 0 0 64 0v-62.368C712.576 176.928 847.104 311.424 862.368 480H800a32 32 0 1 0 0 64h62.368C847.104 712.576 712.576 847.104 544 862.368z"/></svg>[[TEXT]]</div>',
    locateToCommentBtn: '<div class="bpx-player-ctrl-btn bpx-player-ctrl-comment" role="button" aria-label="前往评论" tabindex="0"><div id="goToComments" class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="88" height="88" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px);"><path d="M512 85.333c235.637 0 426.667 191.03 426.667 426.667S747.637 938.667 512 938.667a424.779 424.779 0 0 1-219.125-60.502A2786.56 2786.56 0 0 0 272.82 866.4l-104.405 28.48c-23.893 6.507-45.803-15.413-39.285-39.296l28.437-104.288c-11.008-18.688-18.219-31.221-21.803-37.91A424.885 424.885 0 0 1 85.333 512c0-235.637 191.03-426.667 426.667-426.667zm-102.219 549.76a32 32 0 1 0-40.917 49.216A223.179 223.179 0 0 0 512 736c52.97 0 103.19-18.485 143.104-51.67a32 32 0 1 0-40.907-49.215A159.19 159.19 0 0 1 512 672a159.19 159.19 0 0 1-102.219-36.907z" fill="#currentColor"/></svg></span></div></div>',
    shadowRootVideoDescriptionReply: '<bili-adjustment-comment-thread-renderer id="adjustment-comment-description"><style>[[VIDEOCOMMENTDESCRIPTION]]</style><bili-adjustment-comment-renderer><div id="bili-adjustment-body"class="light"><a id="bili-adjustment-user-avatar"><bili-adjustment-avatar><img id="bili-adjustment-avatar-picture"src="[[UPAVATARFACELINK]]"alt="[[UPAVATARFACELINK]]"></bili-adjustment-avatar></a><div id="bili-adjustment-main"style="width:100%"><div id="bili-adjustment-header"><bili-adjustment-comment-user-info><div id="bili-adjustment-info"><div id="bili-adjustment-user-name"><a href="#"onclick="event.preventDefault()">视频简介君(ﾉ≧∀≦)ﾉ</a></div><div id="bili-adjustment-user-badge">Bilibili调整</div></div></bili-adjustment-comment-user-info></div><div id="bili-adjustment-content"><bili-adjustment-rich-text><p id="bili-adjustment-contents">[[PROCESSVIDEOCOMMENTDESCRIPTION]]</p></bili-adjustment-rich-text></div></div></div></bili-adjustment-comment-renderer><div id="bili-adjustment-spread-line"></div></bili-adjustment-comment-thread-renderer>',
    indexRecommendVideoHistoryOpenButton: '<button id="indexRecommendVideoHistoryOpenButton" popovertarget="indexRecommendVideoHistoryPopover" class="primary-btn roll-btn"><span>历史记录</span></button>',
    indexRecommendVideoHistoryPopover: '<div id="indexRecommendVideoHistoryPopover" class="adjustment-popover" popover><div id="indexRecommendVideoHistoryPopoverTitle"><span>首页视频推荐历史记录</span><div id="clearRecommendVideoHistoryButton">清空记录</div></div><div id="indexRecommendVideohistoryContents"><div id="indexRecommendVideohistoryCategories"><ul id="indexRecommendVideoHistoryCategory"><li class="all adjustment_button primary plain">全部</li></ul><hr><ul id="indexRecommendVideoHistoryCategoryV2"></ul></div><ul id="indexRecommendVideoHistoryList"></ul></div></div>',
    videoSettingsOpenButton: '<div class="fixed-sidenav-storage-item bili-adjustment-icon settings [[FLOATNAVMENUITEMCLASS]]" title="打开脚本设置" [[DATAV]]><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M812.698 195.977L936.02 409.6a204.8 204.8 0 0 1 0 204.8L812.715 828.023a204.8 204.8 0 0 1-177.374 102.4H388.676a204.8 204.8 0 0 1-177.374-102.4L87.98 614.4a204.8 204.8 0 0 1 0-204.8l123.323-213.623a204.8 204.8 0 0 1 177.374-102.4h246.648a204.8 204.8 0 0 1 177.374 102.4zm-59.12 34.133a136.533 136.533 0 0 0-118.254-68.267H388.676a136.533 136.533 0 0 0-118.255 68.267L147.115 443.733a136.533 136.533 0 0 0 0 136.534L270.438 793.89a136.533 136.533 0 0 0 118.255 68.267h246.648a136.533 136.533 0 0 0 118.255-68.267l123.29-213.623a136.533 136.533 0 0 0 0-136.534L753.561 230.11z"/><path fill="currentColor" d="M512 682.667c94.26 0 170.667-76.408 170.667-170.667S606.259 341.333 512 341.333 341.333 417.741 341.333 512 417.741 682.667 512 682.667zm0-68.267a102.4 102.4 0 1 1 0-204.8 102.4 102.4 0 0 1 0 204.8z"/></svg>[[TEXT]]</div>',
    videoSettings: `<bilibili-adjustment-video-setting id="VideoSettingsPopover"class="adjustment-popover" popover><div class="adjustment-popover-title">哔哩哔哩播放页设置<div class="subTitle">（以下设置内容更改即生效，刷新页面即可）</div></div><div class="recommend">推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a></div><div class="adjustment-form"><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>是否为大会员</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="IsVip" checked="[[ISVIP]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">请如实勾选，否则影响部分设置项</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>自动定位至播放器</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoLocate" checked="[[AUTOLOCATE]]"class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><div class="adjustment-checkboxGroup"><div class="adjustment-checkbox video"><span>普通视频(video)</span><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoLocateVideo" checked="[[AUTOLOCATEVIDEO]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><div class="adjustment-checkbox bangumi"><span>其他视频(bangumi)</span><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoLocateBangumi" checked="[[AUTOLOCATEBANGUMI]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div></div><span class="adjustment-tips info">只有勾选自动定位至播放器，才会执行自动定位的功能；勾选自动定位至播放器后，video 和 bangumi 两者全选或全不选，默认在这两种类型视频播放页都执行；否则勾选哪种类型，就只在这种类型的播放页才执行。</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>播放器顶部偏移(px)</label><input id="OffsetTop" class="adjustment-input" value="[[OFFSETTOP]]"></div><span class="adjustment-tips info">播放器距离浏览器窗口默认距离为 [[PLAYEROFFSETTOP]]；请填写小于 [[PLAYEROFFSETTOP]] 的正整数或 0；当值为 0 时，播放器上沿将紧贴浏览器窗口上沿;值为 [[PLAYEROFFSETTOP]] 时，将保持B站默认。</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>点击播放器时定位</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="ClickPlayerAutoLocate" checked="[[ClickPlayerAutoLocate]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div></div><div class="adjustment-form-item player-mod"><div class="adjustment-form-item-content"><label>播放器默认模式</label><div class="adjustment-checkboxGroup"><div class="adjustment-checkbox"><div class="adjustment-radio-btn"><input class="radio" type="radio" name="PlayerMode" value="normal" checked="[[SELECTEDPLAYERMODECLOSE]]"><div class="circle"></div><span>关闭</span></div></div><div class="adjustment-checkbox"><div class="adjustment-radio-btn"><input class="radio" type="radio" name="PlayerMode" value="wide" checked="[[SELECTEDPLAYERMODEWIDE]]"><div class="circle"></div><span>宽屏</span></div></div><div class="adjustment-checkbox"><div class="adjustment-radio-btn"><input class="radio" type="radio" name="PlayerMode" value="web" checked="[[SELECTEDPLAYERMODEWEB]]"><div class="circle"></div><span>网页全屏</span></div></div></div></div><span class="adjustment-tips info">若遇到不能自动选择播放器模式可尝试刷新页面</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>网页全屏模式解锁</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="WebfullUnlock" checked="[[WebfullUnlock]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">勾选后网页全屏模式下可以滑动滚动条查看下方评论等内容（番剧播放页不支持）
<br><span class='adjustment-linethrough'>新增迷你播放器显示，不过比较简陋，只支持暂停/播放操作，有条件的建议还是直接使用浏览器自带的小窗播放功能。</span></span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>自动选择最高画质</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoSelectVideoHighestQuality" checked="[[AUTOSELECTVIDEOHIGHESTQUALITY]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><div class="adjustment-checkboxGroup"><div id="Checkbox4K" class="adjustment-checkbox fourK" style="display:[[CONTAINQUALITY4KSTYLE]]"><span>包含4K画质</span><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="ContainQuality4k" checked="[[CONTAINQUALITY4K]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><div id="Checkbox8K" class="adjustment-checkbox eightK" style="display:[[CONTAINQUALITY8KSTYLE]]"><span>包含8K画质</span><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="ContainQuality8k" checked="[[CONTAINQUALITY8K]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div></div><span class="adjustment-tips info">网络条件好时可以启用此项，勾哪项选哪项，都勾选8k，否则选择4k及8k外最高画质。</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>优化视频简介并插入评论区</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="InsertVideoDescriptionToComment" checked="[[INSERTVIDEODESCRIPTIONTOCOMMENT]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">将视频简介内容优化后插入评论区或直接替换原简介区内容(替换原简介中固定格式的静态内容为跳转链接)。</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label><span class='adjustment-linethrough'>自动跳过时间节点</span></label><div class="adjustment-checkbox-btn btn-pill disabled"><input type="checkbox" id="AutoSkip" checked="[[AUTOSKIP]]" class="adjustment-checkbox checkbox" disabled><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info"><span class='adjustment-linethrough'>自动跳过视频已设置设置时间节点，视频播放到相应时间点时将触发跳转至设定时间点。</span></span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>离开页面自动暂停视频</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="PauseVideo" checked="[[PAUSEVIDEO]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><div class="adjustment-checkboxGroup"><div class="adjustment-checkbox continuePlay" style="display:[[CONTINUEPLAYSTYLE]]"><span>返回页面恢复播放</span><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="ContinuePlay" checked="[[CONTINUEPLAY]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div></div></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>自动开启字幕</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoSubtitle" checked="[[AUTOSUBTITLE]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">注意：此选项并非控制字幕的开关，而是控制是否自动开启字幕，开启此选项后每个视频都会尝试自动开启字幕。<br>此选项的开启与关闭不会对「视频本身（UP主）」设置的字幕开关状态产生影响。</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>移除评论标签</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="RemoveCommentTags" checked="[[REMOVECOMMENTTAGS]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">移除评论中「UP主觉得很赞」这类标签</span></div><div class="adjustment-form-item"><div class="adjustment-form-item-content"><label>自动刷新</label><div class="adjustment-checkbox-btn btn-pill"><input type="checkbox" id="AutoReload" checked="[[AUTORELOAD]]" class="adjustment-checkbox checkbox"><div class="knob"></div><div class="btn-bg"></div></div></div><span class="adjustment-tips info">（不建议开启）若脚本执行失败是否自动刷新页面重试，开启后可能会对使用体验起到一定改善作用，但若是因为B站页面改版导致脚本失效，则会陷入页面无限刷新的情况，此时则必须在页面加载时看准时机关闭此项才能恢复正常，请自行选择是否开启。</span></div></div><div class="adjustment-buttonGroup" style="margin-top:15px;justify-content:start;"><div id="ExportUserConfigs" class="adjustment-button primary">导出配置</div><div id="ImportUserConfigs" class="adjustment-button info">导入配置</div><input type="file" id="ImportUserConfigsFileInput" accept=".json" style="display:none"></div></bilibili-adjustment-video-setting>`,
    dynamicSettings: '<bilibili-adjustment-dynamic-setting id="DynamicSettingsPopover" class="adjustment-popover" popover><div class="adjustment-popover-title">哔哩哔哩动态页设置<div class="subTitle">（以下设置内容更改即生效，刷新页面即可）</div></div><div class="recommend">推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a></div><label class="bilibili-adjustment-setting-label" style="padding-top:0!important;display: grid;grid-gap: 10px">「投稿视频」链接：<input id="WebVideoLinkInput" class="adjustment-input" value="[[DYNAMICVIDEOLINK]]"></label><div id="DynamicSettingsPopoverTips" class="adjustment-tips info">点击「投稿视频」选项后，填入当前浏览器地址栏链接，即可自动跳转至该链接</div><div class="adjustment-buttonGroup"><button id="DynamicSettingsSaveButton" class="adjustment-button primary">保存</button></div></bilibili-adjustment-dynamic-setting>',
    dynamicSettingsOpenButton: '<div class="bili-dyn-sidebar__btn bili-adjustment-icon settings" title="打开脚本设置" [[DATAV]]><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M812.698 195.977L936.02 409.6a204.8 204.8 0 0 1 0 204.8L812.715 828.023a204.8 204.8 0 0 1-177.374 102.4H388.676a204.8 204.8 0 0 1-177.374-102.4L87.98 614.4a204.8 204.8 0 0 1 0-204.8l123.323-213.623a204.8 204.8 0 0 1 177.374-102.4h246.648a204.8 204.8 0 0 1 177.374 102.4zm-59.12 34.133a136.533 136.533 0 0 0-118.254-68.267H388.676a136.533 136.533 0 0 0-118.255 68.267L147.115 443.733a136.533 136.533 0 0 0 0 136.534L270.438 793.89a136.533 136.533 0 0 0 118.255 68.267h246.648a136.533 136.533 0 0 0 118.255-68.267l123.29-213.623a136.533 136.533 0 0 0 0-136.534L753.561 230.11z"/><path fill="currentColor" d="M512 682.667c94.26 0 170.667-76.408 170.667-170.667S606.259 341.333 512 341.333 341.333 417.741 341.333 512 417.741 682.667 512 682.667zm0-68.267a102.4 102.4 0 1 1 0-204.8 102.4 102.4 0 0 1 0 204.8z"/></svg></div>',
    update: '<bilibili-adjustment-update id="UpdatePopover" class="adjustment-popover" popover><div class="adjustment-popover-title">哔哩哔哩调整 · 有新版本<div class="subTitle">（点击更新按钮安装最新版）</div></div><div class="adjustment-form"><div class="adjustment-form-item"><div class="adjustment-version"><div>当前版本: [[CURRENT]]</div><div>最新版本: [[LATEST]]</div></div>[[CONTENTS]]</div><div class="adjustment-button primary adjustment-button-update">更新</div></div></bilibili-adjustment-update>',
    autoEnableSubtitleSwitchButton: '<div id="autoEnableSubtitleSwitchButton" class="bpx-player-dm-switch bui bui-danmaku-switch" aria-label="跳过开启关闭"><div class="bui-area"><input id="AutoEnableSubtitle" class="bui-danmaku-switch-input" type="checkbox" checked="[[AUTOSUBTITLE]]"><label class="bui-danmaku-switch-label"><span class="bui-danmaku-switch-on"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 4.8h-1.5L8.8 2.3c-.3-.5-1-.6-1.4-.3s-.6.9-.3 1.4l1 1.5-2.2.1C4 5.1 2.4 6.5 2.1 8.4c-.2 1.4-.3 2.8-.2 4.2 0 1.7.1 3.4.3 5.1.3 1.9 1.9 3.3 3.8 3.4h.9c1.2.1 1.8.1 3.6.1.6 0 1-.4 1-1s-.4-1-1-1c-1.8 0-2.3 0-3.5-.1h-.9c-1 0-1.8-.8-1.9-1.7-.2-1.6-.3-3.2-.3-4.8 0-1.3.1-2.6.2-3.9C4.2 7.7 5 7 6 6.9c2.4-.1 4.5-.1 6.1-.1s3.6 0 6.1.1c1 .1 1.8.8 1.9 1.8.1.5.1 2 .1 3.1v.9c0 .6.5 1 1 1 .6 0 1-.5 1-1v-.9c0-1.1-.1-2.7-.2-3.3-.2-1.9-1.8-3.4-3.8-3.5l-2.5-.1 1.1-1.5c.2-.4.1-1-.3-1.4-.5-.3-1.1-.2-1.4.2l-1.9 2.5H12z" clip-rule="evenodd"/><path fill="#00aeec" fill-rule="evenodd" d="M22.9 14.6c-.4-.4-1-.3-1.4.1l-5.1 5.7-2.2-2.3-.2-.1c-.4-.3-1.1-.2-1.4.2-.3.4-.2.9.1 1.3l3 3 .1.1c.4.3 1 .3 1.4-.1L23 16l.1-.1c.2-.4.1-.9-.2-1.3z" clip-rule="evenodd"/><path d="M9.3 11.4H14l.7.6c-.2.2-.5.5-.8.7s-.6.5-1 .7c-.2.1-.3.2-.5.3v.2h3.8v1h-3.8v1.7c0 .3 0 .5-.1.7-.1.2-.2.3-.5.4-.2.1-.5.1-.8.2s-.7 0-1.1 0c0-.1-.1-.2-.1-.4s-.1-.3-.2-.4c-.1-.1-.1-.2-.2-.3h1.7V15H7.6v-1h3.8v-.6c.3-.1.6-.3.8-.5.2-.1.4-.3.5-.4H9.3v-1.1zM7.7 9.5h3.8v-.1c-.1-.2-.2-.5-.4-.6l1.1-.3c.1.2.3.4.4.6.1.2.2.3.2.4h3.5v2.2h-1.1v-1.2H8.7v1.2h-1V9.5z"/></svg></span><span class="bui-danmaku-switch-off"><svg xmlns="http://www.w3.org/2000/svg" id="图层_1" viewBox="0 0 24 24"><path d="M8.1 5l-1-1.5c-.3-.5-.2-1.1.3-1.4s1.1-.2 1.4.3L10.5 5h2.7l1.9-2.6c.3-.5 1-.6 1.4-.2s.6 1 .2 1.4l-1 1.4 2.5.1c1.9.1 3.5 1.6 3.7 3.5.1.6.1 2.1.2 3.3v.9c0 .6-.4 1-1 1s-1-.4-1-1v-.9c0-1.1-.1-2.5-.1-3.1-.1-1-.9-1.8-1.9-1.8-2-.1-4-.1-6.1-.1-1.6 0-3.6 0-6.1.1-1 0-1.8.8-1.9 1.7-.2 1.3-.2 2.6-.2 3.9 0 1.6.1 3.2.3 4.8.1 1 .9 1.7 1.9 1.7 1.8.1 3.6.1 5.4.1.6 0 1 .4 1 1s-.4 1-1 1c-1.8 0-3.7 0-5.5-.1-1.9-.1-3.5-1.5-3.8-3.4-.3-1.7-.4-3.4-.4-5.1 0-1.4.1-2.8.2-4.2C2.4 6.6 4 5.2 6 5.1L8.1 5z" class="st0"/><path d="M18 14.1c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 6.5c-1.4 0-2.5-1.1-2.5-2.5 0-.4.1-.8.3-1.2l3.3 3.4c-.3.2-.7.3-1.1.3zm2.5-2.5c0 .4-.1.8-.3 1.2l-3.3-3.4c1.2-.6 2.7-.1 3.4 1.1.2.3.2.7.2 1.1z" class="st0"/><path d="M12.8 9.5c-.1-.1-.1-.3-.2-.5s-.3-.4-.4-.6l-1.1.3c.1.2.3.4.4.6v.1H7.7v2.2h1.1v-1.2h6.4v1.2h1.1V9.5h-3.5zm-.2 4.4v-.2c.2-.1.3-.2.5-.3.3-.2.7-.5 1-.7.3-.2.6-.5.8-.7l-.7-.6H9.3v1h3.4c-.2.1-.4.3-.5.4-.3.2-.5.4-.8.5v.6H7.6v1h3.8v1.8H9.6c.1.1.1.2.2.3l.2.4c0 .1.1.3.1.4h1.1c.3 0 .6-.1.8-.2.2-.1.4-.2.5-.4.1-.2.1-.4.1-.7v-1.7h1.3c.3-.4.7-.7 1.1-1h-2.4z"/></svg></span></label></div></div>',
    autoEnableSubtitleSwitchButtonTip: '<div id="autoEnableSubtitleTip" class="bpx-player-tooltip-item" style="visibility: hidden; opacity: 0; transform: translate(0px, 0px);"><div class="bpx-player-tooltip-title">[[AUTOENABLESUBTITLESWITCHBUTTONTIPTEXT]]</div></div>',
    bilibiliAdjustmentShowILocation: '<bilibili-adjustment-show-location><style>bilibili-adjustment-show-location{font-size:13px;margin-left:auto;cursor:pointer;border:1px solid #424242;padding:2px 5px;border-radius:4px}bilibili-adjustment-show-location:hover{color:#00a1d6;border-color:#00a1d6}</style>显示评论归属地</bilibili-adjustment-show-location>'
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
