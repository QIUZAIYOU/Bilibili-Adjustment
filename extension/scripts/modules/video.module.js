// ===== scripts/modules/video.module.js =====
// 对齐原始 src/modules/video/video.module.js (725行)
// 事件驱动管线: canplaythrough → playerModeSelected → startOtherFunctions
window.__biliExt = window.__biliExt || {}

;(function () {
  const EventBus = window.__biliExt.EventBus
  const LoggerService = window.__biliExt.LoggerService
  const logger = new LoggerService('VideoModule')

  // 简单 debounce
  function debounce (fn, wait, options) {
    let timer = null
    const leading = options && options.leading
    const trailing = !options || options.trailing !== false
    return function (...args) {
      const callNow = leading && !timer
      clearTimeout(timer)
      timer = setTimeout(() => { timer = null; if (trailing) fn.apply(this, args) }, wait)
      if (callNow) fn.apply(this, args)
    }
  }

  let advertisementIdentified = false
  let videoDescriptionObserver = null

  const module = {
    name: 'video',
    version: '3.3.0',
    userConfigs: {},
    _cleanups: [],

    async install () {
      const common = window.__biliExt.common
      const stylesV2 = window.__biliExt.stylesV2
      const eventBus = window.__biliExt.eventBus

      common.insertStyleToDocument({ 'BodyOverflowHiddenStyle': stylesV2.BodyOverflowHidden || '' })
      common.insertStyleToDocument({ 'VideoPageAdjustmentStyle': stylesV2.VideoPageAdjustment || '' })
      common.insertStyleToDocument({ 'VideoSettingsStyle': stylesV2.VideoSettings || '' })

      eventBus.on('app:ready', async () => {
        logger.info('视频模块｜已加载')
        await this._preFunctions()
      })
    },

    async _preFunctions () {
      const storageService = window.__biliExt.storageService
      const common = window.__biliExt.common
      const SettingsComponentV2 = window.__biliExt.SettingsPanel
      const settingsComponent = SettingsComponentV2 ? new SettingsComponentV2() : null

      await storageService.setConfig('page_type', location.pathname.startsWith('/video/') ? 'video' : 'bangumi')
      await common.sleep(300)
      this.userConfigs = await this._getAllConfigs()
      if (settingsComponent) {
        try { await settingsComponent.init(this.userConfigs) } catch (e) {}
      }
      this._initEventListeners()
      this._initMonitors()
    },

    async _getAllConfigs () {
      const ConfigService = window.__biliExt.ConfigService
      const configs = {}
      for (const [key] of ConfigService.DEFAULT_VALUES) {
        configs[key] = await ConfigService.getValue(key)
      }
      return configs
    },

    _initEventListeners () {
      const eventBus = window.__biliExt.eventBus
      eventBus.on('logger:show', (_, { type, message }) => {
        if (logger[type]) logger[type](message)
      })
      eventBus.on('video:canplaythrough', debounce(this._autoSelectPlayerMode.bind(this), { 'leading': true, 'trailing': false }))
      eventBus.on('video:playerModeSelected', debounce(this._autoLocateToPlayer.bind(this), { 'leading': true, 'trailing': false }))
      eventBus.once('video:startOtherFunctions', debounce(this._handleExecuteFunctionsSequentially.bind(this), 500, { 'leading': true, 'trailing': false }))
      eventBus.once('video:webfullPlayerModeUnlock', debounce(this._insertLocateToCommentButton.bind(this), 500, { 'leading': true, 'trailing': false }))
    },

    _initMonitors () {
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const stylesV2 = window.__biliExt.stylesV2
      const self = this

      common.monitorHrefChange(async () => {
        logger.debug('视频资源｜链接已改变')
        await self._handleHrefChangedFunctionsSequentially()
      })
      common.isTabActive({
        onActiveChange: async isActive => {
          if (isActive) {
            logger.info('标签页｜已激活')
            common.insertStyleToDocument({ 'VideoPageAdjustmentStyle': stylesV2.VideoPageAdjustment || '', 'VideoSettingsStyle': stylesV2.VideoSettings || '' })
            const video = await elementSelectors.query('video')
            self._checkVideoCanplaythrough(video)
          }
        },
        immediate: true,
        checkInterval: 10,
        once: true
      })
    },

    _isVideoCanplaythrough (videoElement) {
      return new Promise(resolve => {
        if (videoElement && videoElement.readyState >= 4) {
          return resolve(true)
        }
        if (!videoElement) return resolve(false)
        const ac = new AbortController()
        const handler = () => {
          if (videoElement.readyState >= 4) {
            ac.abort()
            resolve(true)
          }
        }
        const events = ['canplaythrough', 'loadeddata']
        events.forEach(event => videoElement.addEventListener(event, handler, { signal: ac.signal }))
        setTimeout(() => { try { ac.abort(); resolve(false) } catch (e) { resolve(false) } }, 30000)
      })
    },

    async _checkVideoCanplaythrough (videoElement, emit = true) {
      if (!videoElement) {
        const elementSelectors = window.__biliExt.elementSelectors
        videoElement = await elementSelectors.query('video')
      }
      const canplaythrough = await this._isVideoCanplaythrough(videoElement)
      if (canplaythrough && emit) {
        window.__biliExt.eventBus.emit('video:canplaythrough')
        logger.info('视频资源｜可以播放')
      }
      return canplaythrough
    },

    async _autoSelectPlayerMode () {
      const elementSelectors = window.__biliExt.elementSelectors
      const eventBus = window.__biliExt.eventBus
      const playerContainer = await elementSelectors.query('playerContainer')
      if (!playerContainer) { eventBus.emit('video:playerModeSelected'); return }
      const currentPlayerMode = playerContainer.getAttribute('data-screen')
      const targetMode = this.userConfigs.selected_player_mode
      if (currentPlayerMode === targetMode) {
        logger.debug(`屏幕模式｜当前已是${targetMode === 'wide' ? '宽屏' : targetMode === 'web' ? '网页全屏' : '正常'}模式`)
        eventBus.emit('video:playerModeSelected')
        return
      }
      try {
        if (targetMode === 'wide') {
          const btn = await elementSelectors.query('playerModeWideEnterButton')
          if (btn) btn.click()
        } else if (targetMode === 'web') {
          const btn = await elementSelectors.query('playerModeWebEnterButton')
          if (btn) btn.click()
        }
      } catch (e) { logger.error('屏幕模式切换失败', e) }
      setTimeout(() => { eventBus.emit('video:playerModeSelected') }, 500)
    },

    async _autoLocateToPlayer () {
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const [playerContainer, video] = await elementSelectors.batch(['playerContainer', 'video'])
      if (!playerContainer) return
      const isBangumi = location.pathname.startsWith('/bangumi/')
      const offset = this.userConfigs.offset_top
      const playerOffset = isBangumi ? this.userConfigs.bangumi_player_offset_top : this.userConfigs.video_player_offset_top
      if (!offset && offset !== 0) return
      const target = offset < playerOffset ? offset : playerOffset
      await common.documentScrollTo(target)
      if (this.userConfigs.click_player_auto_locate) {
        const playerArea = await elementSelectors.query('videoWrap')
        if (playerArea) {
          const rect = playerArea.getBoundingClientRect()
          const event = new MouseEvent('click', { bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10 })
          playerArea.dispatchEvent(event)
        }
      }
      window.__biliExt.eventBus.emit('video:startOtherFunctions')
    },

    async _handleExecuteFunctionsSequentially () {
      const common = window.__biliExt.common
      const functions = [
        [this._webfullPlayerModeUnlock, !!(this.userConfigs.webfull_unlock && this.userConfigs.selected_player_mode === 'web' && location.pathname.startsWith('/video/'))],
        this._autoSelectHighestQuality,
        this._autoEnableHiRes,
        this._insertAutoEnableSubtitleSwitchButton,
        [this._handleVideoPauseOnTabSwitch, !!this.userConfigs.pause_video],
        [this._insertVideoDescriptionToComment, !!(this.userConfigs.insert_video_description_to_comment && location.pathname.startsWith('/video/'))],
        [this._identifyAdvertisementTimestamps, !!this.userConfigs.auto_skip],
        this._doSomethingToCommentElements
      ]
      common.executeFunctionsSequentially(functions)
    },

    async _handleHrefChangedFunctionsSequentially () {
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const playerContainer = await elementSelectors.query('playerContainer')
      if (!playerContainer) return
      await common.sleep(200)
      const functions = [
        [this._autoSelectHighestQuality, false],
        [this._autoEnableHiRes, false],
        [this._insertVideoDescriptionToComment, !!(this.userConfigs.insert_video_description_to_comment && location.pathname.startsWith('/video/'))],
        [this._identifyAdvertisementTimestamps, !!this.userConfigs.auto_skip],
      ]
      common.executeFunctionsSequentially(functions)
    },

    // ======= 网页全屏解锁 =======
    async _webfullPlayerModeUnlock () {
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const stylesV2 = window.__biliExt.stylesV2
      common.insertStyleToDocument({ 'UnlockWebPlayerStyle': stylesV2.UnlockWebPlayer || '' })
      const webfullScreen = await elementSelectors.query('playerWebscreen')
      if (webfullScreen) {
        common.isElementSizeChange(webfullScreen, (isChanged) => {
          if (isChanged) {
            common.insertStyleToDocument({ 'UnlockWebPlayerStyle': stylesV2.UnlockWebPlayer || '' })
          }
        })
      }
      window.__biliExt.eventBus.emit('video:webfullPlayerModeUnlock')
    },

    async _insertLocateToCommentButton () {
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const playerControllerRight = await elementSelectors.query('playerControllerBottomRight')
      if (playerControllerRight) {
        const jumpBtn = common.createElementAndInsert(
          '<div class="bpx-player-ctrl-btn bili-adjustment-jump-comment" title="评论区" style="cursor:pointer;display:flex;align-items:center;padding:0 8px;font-size:13px;color:#99a2aa;">💬</div>',
          playerControllerRight, 'append'
        )
        if (jumpBtn) {
          jumpBtn.addEventListener('click', () => {
            const commentArea = document.querySelector('.comment-container, .comment, #comment')
            if (commentArea) commentArea.scrollIntoView({ behavior: 'smooth' })
          })
        }
      }
    },

    // ======= 自动选择最高画质 =======
    async _autoSelectHighestQuality () {
      const elementSelectors = window.__biliExt.elementSelectors
      if (!this.userConfigs.auto_select_video_highest_quality) return
      const qualityItems = await elementSelectors.queryAll('qualitySwitchButtons')
      if (!qualityItems.length) return
      let best = null, bestLevel = 0
      for (const item of qualityItems) {
        const level = parseInt(item.getAttribute('data-value') || item.getAttribute('data-qn') || 0)
        if (level > bestLevel) { bestLevel = level; best = item }
      }
      if (best && !best.classList.contains('active') && !best.classList.contains('bpx-player-active')) {
        best.click()
        logger.info('画质｜已自动选择最高')
      }
    },

    // ======= Hi-Res 无损音质 =======
    async _autoEnableHiRes () {
      const elementSelectors = window.__biliExt.elementSelectors
      if (!this.userConfigs.auto_hi_res) return
      const hiResBtn = await elementSelectors.query('highResButton')
      if (hiResBtn && !hiResBtn.classList.contains('active')) {
        hiResBtn.click()
        logger.info('音质｜已自动开启 Hi-Res')
      }
    },

    // ======= 自动字幕 =======
    _insertAutoEnableSubtitleSwitchButton () {
      const elementSelectors = window.__biliExt.elementSelectors
      elementSelectors.query('subtitleButton').then(btn => {
        if (btn && this.userConfigs.auto_subtitle && !btn.classList.contains('active')) {
          btn.click()
        }
      })
    },

    // ======= 视频暂停/恢复 =======
    _handleVideoPauseOnTabSwitch () {
      const elementSelectors = window.__biliExt.elementSelectors
      let wasPlaying = false
      document.addEventListener('visibilitychange', async () => {
        const video = await elementSelectors.query('video')
        if (!video) return
        if (document.hidden) {
          if (!video.paused) { wasPlaying = true; video.pause() }
        } else if (wasPlaying) {
          if (this.userConfigs.continue_play) video.play()
          wasPlaying = false
        }
      })
    },

    // ======= 视频简介插入评论区 =======
    async _insertVideoDescriptionToComment () {
      const elementSelectors = window.__biliExt.elementSelectors
      const common = window.__biliExt.common
      const shadowDOMHelper = window.__biliExt.shadowDOMHelper
      const shadowDomSelectors = window.__biliExt.shadowDomSelectors

      const [descriptionInfo, commentContainer] = await elementSelectors.batch(['videoDescriptionInfo', 'videoComment'])
      const descriptionText = descriptionInfo ? descriptionInfo.textContent?.trim() : null
      if (!descriptionText || !commentContainer) return
      if (document.querySelector(`${shadowDomSelectors.descriptionRenderer}`)) return

      const html = `<div id="adjustment-comment-description" style="margin:12px 0;padding:12px 16px;background:rgba(0,0,0,0.03);border-radius:8px;font-size:14px;line-height:1.8;word-break:break-word;">${descriptionText.replace(/\n/g, '<br>')}</div>`
      if (commentContainer.parentNode) {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = html
        commentContainer.parentNode.insertBefore(wrapper.firstElementChild, commentContainer)
      }
    },

    // ======= AI 广告识别 =======
    async _identifyAdvertisementTimestamps () {
      if (advertisementIdentified) return
      advertisementIdentified = true
      try {
        const aiService = window.__biliExt.AIService
        const biliApis = window.__biliExt.biliApis
        const elementSelectors = window.__biliExt.elementSelectors
        const common = window.__biliExt.common

        const video = await elementSelectors.query('video')
        if (!video) return
        const bvid = location.pathname.match(/BV[\w]+/)?.[0]
        if (!bvid) return
        const info = await biliApis.getVideoInfo(bvid)
        const cid = info?.data?.cid
        if (!cid) return
        const subtitleData = await biliApis.getVideoSubtitle(bvid, cid)
        if (!subtitleData?.body) return
        const subtitles = subtitleData.body.map(s => ({ from: s.from, content: s.content })).slice(0, 200)

        const ads = await aiService.detectAds(subtitles,
          this.userConfigs.ai_apikey || this.userConfigs.custom_model_api_key,
          this.userConfigs.ai_provider || 'siliconflow',
          this.userConfigs.ai_model || this.userConfigs.custom_model_id,
          this.userConfigs.custom_model_api_url
        )
        if (!ads || !ads.length) return

        const skipAds = () => {
          for (const ad of ads) {
            if (video.currentTime >= ad.start && video.currentTime < ad.end) {
              video.currentTime = ad.end
              logger.info(`广告跳过｜${ad.reason} (${ad.start}-${ad.end})`)
            }
          }
        }
        video.addEventListener('timeupdate', skipAds)
      } catch (e) { logger.error('广告识别失败', e) }
    },

    // ======= 评论区处理（IP属地、标签） =======
    _doSomethingToCommentElements () {
      const elementSelectors = window.__biliExt.elementSelectors
      const shadowDOMHelper = window.__biliExt.shadowDOMHelper
      const shadowDomSelectors = window.__biliExt.shadowDomSelectors

      // 处理已有评论元素
      this._processCommentElements()

      // 监听新插入的评论
      try {
        shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, () => {
          this._processCommentElements()
        })
      } catch (e) { logger.warn('Shadow DOM 评论监听失败', e) }

      // 移除评论标签
      if (this.userConfigs.remove_comment_tags) {
        try {
          shadowDOMHelper.observeInsertion(shadowDomSelectors.commentTags, (el) => {
            if (el && el.parentNode) el.style.display = 'none'
          })
        } catch (e) {}
      }
    },

    _processCommentElements () {
      if (this.userConfigs.show_comment_location) {
        const elements = document.querySelectorAll('.comment-location, [class*="comment-location"], .pub-date')
        elements.forEach(el => {
          if (!el.dataset.biliAdjusted) {
            el.dataset.biliAdjusted = '1'
            el.style.display = 'inline-block'
          }
        })
      }
    },
  }

  window.__biliExt.modules = window.__biliExt.modules || {}
  window.__biliExt.modules.video = module
})()
