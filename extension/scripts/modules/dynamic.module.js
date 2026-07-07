// ===== scripts/modules/dynamic.module.js =====
// 对齐原始 src/modules/dynamic/dynamic.module.js (126行)
window.__biliExt = window.__biliExt || {}

;(function () {
  const LoggerService = window.__biliExt.LoggerService
  const ShadowDOMHelper = window.__biliExt.ShadowDOMHelper
  const shadowDOMHelper = ShadowDOMHelper ? new ShadowDOMHelper() : null
  const logger = new LoggerService('DynamicModule')

  const module = {
    name: 'dynamic',
    version: '2.0.0',
    userConfigs: {},

    async install () {
      window.__biliExt.eventBus.on('app:ready', async () => {
        logger.info('动态模块｜已加载')
        await this._preFunctions()
      })
    },

    async _preFunctions () {
      this.userConfigs = await this._getAllConfigs()
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        logger.info('标签页｜已激活')
        this._handleExecuteFunctionsSequentially()
      }
    },

    async _getAllConfigs () {
      const ConfigService = window.__biliExt.ConfigService
      const configs = {}
      for (const [key] of ConfigService.DEFAULT_VALUES) {
        configs[key] = await ConfigService.getValue(key)
      }
      return configs
    },

    _changeCurrentHrefToVideoSubmissions () {
      const dynamic_video_link = this.userConfigs.dynamic_video_link
      if (!dynamic_video_link) return
      const currentHref = location.href
      const skipPatterns = [
        /\/pages\/nav\/index/,
        /\/vote\//,
        /\/lottery\//,
        /\/more\//,
        /\/detail\//,
        /\/topic\//,
      ]
      for (const pattern of skipPatterns) {
        if (pattern.test(currentHref)) return
      }
      if (currentHref !== dynamic_video_link) {
        location.href = dynamic_video_link
      } else {
        logger.info('动态页｜已切换至投稿视频')
      }
    },

    async _insertSidebarButtons () {
      const common = window.__biliExt.common
      const sidebar = document.querySelector('.bili-dyn-sidebar, [class*="sidebar"]')
      if (!sidebar) return
      const btn = common.createElementAndInsert(
        '<div id="biliAdjustDynamicBtn" style="cursor:pointer;padding:6px 12px;margin:8px;border:1px solid #2a2a4a;border-radius:6px;color:#8899aa;font-size:13px;text-align:center">⚙️ 调整设置</div>',
        sidebar, 'prepend'
      )
      if (btn) {
        btn.addEventListener('click', () => {
          const panel = document.getElementById('biliSettingsPanel')
          if (panel) panel.style.display = 'flex'
        })
      }
    },

    _doSomethingToCommentElements (buttonElement) {
      if (!shadowDOMHelper) return
      const shadowDomSelectors = window.__biliExt.shadowDomSelectors
      const common = window.__biliExt.common
      const elementSelectors = window.__biliExt.elementSelectors
      const listItem = buttonElement.closest('.bili-dyn-item, [class*="dyn-item"]')
      if (!listItem) return

      const showLocation = (host, location) => {
        try {
          if (shadowDOMHelper.queryDescendant(host, '#location')) return
          const locationHtml = '<div id="location" style="margin-left:5px;font-size:12px;color:#8899aa">' + (location || 'IP属地：未知') + '</div>'
          const pubdate = shadowDOMHelper.queryDescendant(host, '.pub-date, [class*="pub-date"], .reply-pubdate')
          if (pubdate) common.createElementAndInsert(locationHtml, pubdate, 'after')
        } catch (e) {}
      }

      const removeTags = (host) => {
        const tags = shadowDOMHelper.queryDescendant(host, '.comment-tag, .up-tag, .note-tag, .top-tag', true)
        if (tags) tags.forEach(t => { try { t.remove() } catch (e) {} })
      }

      if (shadowDomSelectors) {
        shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
          if (this.userConfigs.show_location) {
            showLocation(renderder, renderder?.data?.reply_control?.location || 'IP属地：未知')
          }
          if (this.userConfigs.remove_comment_tags) {
            removeTags(renderder)
          }
        }, listItem)

        shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
          if (this.userConfigs.show_location) {
            showLocation(renderder, renderder?.data?.reply_control?.location || 'IP属地：未知')
          }
        }, listItem)
      }
    },

    _handleLoadComments () {
      const common = window.__biliExt.common
      const handledButtons = new WeakMap()
      const loadBtnSelector = '.bili-dyn-more, [class*="load-more"], [class*="comment"], .bili-dyn-content'
      const observer = new MutationObserver(() => {
        document.querySelectorAll(loadBtnSelector).forEach(btn => {
          if (!handledButtons.has(btn)) {
            common.addEventListenerToElement(btn, 'click', () => {
              this._doSomethingToCommentElements(btn)
              handledButtons.set(btn, true)
            })
          }
        })
      })
      observer.observe(document.body, { childList: true, subtree: true })
    },

    _handleExecuteFunctionsSequentially () {
      const common = window.__biliExt.common
      common.executeFunctionsSequentially([
        this._insertSidebarButtons.bind(this),
        this._changeCurrentHrefToVideoSubmissions.bind(this),
        this._handleLoadComments.bind(this)
      ])
    }
  }

  window.__biliExt.modules = window.__biliExt.modules || {}
  window.__biliExt.modules.dynamic = module
})()
