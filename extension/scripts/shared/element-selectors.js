// ===== scripts/shared/element-selectors.js =====
// 对齐原始 src/shared/element-selectors.js
window.__biliExt = window.__biliExt || {}

;(function () {
  const EventBus = window.__biliExt.EventBus
  const LoggerService = window.__biliExt.LoggerService
  const logger = LoggerService ? new LoggerService('ElementSelectors') : console

  // ===== Shadow DOM 相关选择器 =====
  const shadowDomSelectors = {
    commentRenderderContainer: 'bili-comments',
    commentRenderder: 'bili-comment-renderer',
    commentReplyRenderder: 'bili-comment-reply-renderer',
    commentTags: '.comment-tag, .up-tag, .note-tag, .top-tag, .bili-rich-text-module.tag, .root-reply-tag',
    timeSeekElement: 'a[data-type="seek"], [data-video-time]',
    descriptionRenderer: '#adjustment-comment-description',
  }

  // ===== 元素选择器定义 =====
  // 每个选择器支持字符串（直接 CSS 选择器）或对象（selector + options）
  const selectorDefinitions = new Map()

  const define = (entries) => {
    for (const [name, config] of Object.entries(entries)) {
      selectorDefinitions.set(name, typeof config === 'string' ? { selector: config } : config)
    }
  }

  define({
    // 播放器容器
    playerContainer: '.bpx-player-container',
    playerWrap: '#playerWrap',
    videoWrap: '.bpx-player-video-wrap',
    video: 'video',
    app: '#app',
    headerMini: '#biliMainHeader, .bili-header__bar',

    // 播放器模式按钮
    playerModeWideEnterButton: '.bpx-player-ctrl-wide, [class*="player-ctrl-wide"]',
    playerModeWideLeaveButton: '.bpx-player-ctrl-wide[class*="active"], [data-screen="wide"] .bpx-player-ctrl-wide',
    playerModeWebEnterButton: '.bpx-player-ctrl-web, [class*="player-ctrl-web-full"]',
    playerModeWebLeaveButton: '.bpx-player-ctrl-web[class*="active"]',
    playerModeFullControlButton: '.bpx-player-ctrl-full',
    playerWebscreen: '#bilibiliPlayer .bpx-player-video-wrap, #bilibili-player .bpx-player-video-wrap',

    // 播放器控件
    playerControllerBottomRight: '.bpx-player-ctrl-bottom .bpx-player-ctrl-right, .bpx-player-ctrl-right',
    qualitySwitchButtons: '.bpx-player-ctrl-quality-menu .bpx-player-ctrl-quality-item, .bpx-player-ctrl-quality .bpx-player-ctrl-btn',
    subtitleButton: '.bpx-player-ctrl-subtitle',
    subtitleMenu: '.bpx-player-ctrl-subtitle-menu',
    highResButton: '.bpx-player-ctrl-btn[class*="hi-res"], .bpx-player-ctrl-quality-item[data-value="30250"]',
    volumeButton: '.bpx-player-ctrl-volume',
    settingButton: '.bpx-player-ctrl-setting',
    miniPlayerButton: '.bpx-player-ctrl-pip',

    // 视频信息
    videoTitle: '.video-title, .video-info-title',
    videoInfo: '.video-info',
    videoDescription: '.video-desc, .video-desc-container',
    videoDescriptionInfo: '.video-desc .desc-info, .desc-info',
    videoDescriptionText: '.video-desc .desc-text',

    // 评论区（常规 DOM）
    videoComment: '.comment-container, #comment, .comment',
    commentInput: '.comment-input',

    // 选集
    videoEpisodeList: '.video-pod.video-pod-m, .multi-page',
    videoEpisodeListItem: '.video-pod__list .video-pod__item, .multi-page .list-box li',
    videoEpisodeListMultiMenuItem: '.video-pod__list .video-pod__item a, .multi-page .list-box li a',

    // 侧边浮层
    playerSideFloatNav: '.player-auxiliary-area, .bpx-player-auxiliary',
    settingBtn: '.bpx-player-ctrl-setting',
    pipBtn: '.bpx-player-ctrl-pip',
    wideBtn: '.bpx-player-ctrl-wide',
    webFullBtn: '.bpx-player-ctrl-web',

    // 弹幕
    danmakuContainer: '.bpx-player-dialog-wrap',
    danmakuMenu: '.bpx-player-ctrl-dm',

    // 视频简介插入评论区标识
    adjustmentCommentDescription: '#adjustment-comment-description',

    // 解锁网页播放器样式
    UnlockWebPlayerStyle: '#UnlockWebPlayerStyle',

    // 视频回复发布日期
    videoReplyPubDate: '.reply-item .pub-date, .sub-reply-item .pub-date, .reply-pubdate',
  })

  // ===== 元素等待 / 查询 API =====
  // 模拟原始 elementSelectors Proxy API
  class ElementSelectorAPI {
    /**
     * 查询单个元素，等待直到出现或超时
     */
    async query (name) {
      const def = selectorDefinitions.get(name)
      if (!def) throw new Error(`未知选择器: ${name}`)
      return this._waitForElement(def.selector, def.timeout || 10000)
    }

    /**
     * 查询所有匹配元素，等待直到至少出现一个或超时
     */
    async queryAll (name) {
      const def = selectorDefinitions.get(name)
      if (!def) throw new Error(`未知选择器: ${name}`)
      return this._waitForElements(def.selector, def.timeout || 10000)
    }

    /**
     * 批量查询多个选择器，返回 [el, el, ...] 数组
     */
    async batch (names) {
      return Promise.all(names.map(n => this.query(n)))
    }

    /**
     * 获取选择器的 CSS 字符串值
     */
    value (name) {
      const def = selectorDefinitions.get(name)
      return def ? def.selector : ''
    }

    /**
     * 遍历查询到的所有元素执行回调
     */
    async each (name, callback) {
      const def = selectorDefinitions.get(name)
      if (!def) return
      const elements = await this._waitForElements(def.selector, def.timeout || 10000)
      elements.forEach(callback)
    }

    /**
     * 等待元素出现
     */
    _waitForElement (selector, timeout) {
      return new Promise((resolve, reject) => {
        const el = document.querySelector(selector)
        if (el) return resolve(el)

        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector)
          if (el) { observer.disconnect(); clearTimeout(timer); resolve(el) }
        })
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true })

        const timer = setTimeout(() => {
          observer.disconnect()
          logger.warn(`选择器超时: ${selector}`)
          resolve(null)
        }, timeout)
      })
    }

    /**
     * 等待元素出现（多个）
     */
    _waitForElements (selector, timeout) {
      return new Promise((resolve) => {
        const els = document.querySelectorAll(selector)
        if (els.length > 0) return resolve([...els])

        const observer = new MutationObserver(() => {
          const els = document.querySelectorAll(selector)
          if (els.length > 0) { observer.disconnect(); clearTimeout(timer); resolve([...els]) }
        })
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true })

        const timer = setTimeout(() => {
          observer.disconnect()
          resolve([])
        }, timeout)
      })
    }
  }

  const elementSelectors = new ElementSelectorAPI()

  window.__biliExt.elementSelectors = elementSelectors
  window.__biliExt.shadowDomSelectors = shadowDomSelectors
  window.__biliExt.ShadowDOMHelper = window.__biliExt.ShadowDOMHelper // will be set by shadowDOMHelper.js

  logger.debug('元素选择器注册完成')
})()
