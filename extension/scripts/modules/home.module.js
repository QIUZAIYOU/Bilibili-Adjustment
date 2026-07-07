// ===== scripts/modules/home.module.js =====
// 对齐原始 src/modules/home/home.module.js (276行)
window.__biliExt = window.__biliExt || {}

;(function () {
  const LoggerService = window.__biliExt.LoggerService
  const logger = new LoggerService('HomeModule')

  const module = {
    name: 'home',
    version: '1.2.3',
    userConfigs: {},
    _isRecording: false,

    async install () {
      window.__biliExt.eventBus.on('app:ready', async () => {
        logger.info('首页模块｜已加载')
        await this._preFunctions()
      })
    },

    async _preFunctions () {
      this.userConfigs = await this._getAllConfigs()
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        logger.info('标签页｜已激活')
        this._handleExecuteFunctionsSequentially()
        this._initEventListeners()
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

    async _initEventListeners () {
      const common = window.__biliExt.common
      const indexRecommendVideoRollButton = document.querySelector('.recommend-switch, .refresh-btn, [class*="refresh"], [class*="roll"]')
      if (indexRecommendVideoRollButton) {
        common.addEventListenerToElement(indexRecommendVideoRollButton, 'click', async () => {
          common.executeFunctionsSequentially([
            () => this._setRecordRecommendVideoHistory(),
            () => this._markRecommendVideoPaidStatus(),
            () => this._generatorIndexRecommendVideoHistoryContents()
          ])
        })
      }
    },

    async _markRecommendVideoPaidStatus () {
      const biliApis = window.__biliExt.biliApis
      const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11), .feed-card, .video-card')
      const cards = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
      for (const video of cards.slice(0, 11)) {
        const url = video.querySelector('a')?.href
        const titleEl = video.querySelector('h3')
        const title = titleEl?.title
        if (location.host.includes('bilibili.com') && url && !url.includes('cm.bilibili.com') && title) {
          try {
            const vid = biliApis.getCurrentVideoID(url)
            if (!vid) continue
            const videoInfo = await biliApis.getVideoInformation('video', vid)
            if (videoInfo) {
              const isPaid = await biliApis.checkVideoPaid(videoInfo.aid, videoInfo.cid)
              if (isPaid && titleEl) {
                titleEl.title = '🟡付费视频 丨 ' + title
                titleEl.innerHTML = '<span style="color:#fb7299;font-weight:700;font-size:12px;border:1px solid;padding:2px 3px;border-radius:4px">付费视频</span> ' + title
              }
            }
          } catch (e) {}
        }
      }
      logger.info('首页视频付费标记｜已完成')
    },

    async _setRecordRecommendVideoHistory () {
      if (this._isRecording) return
      this._isRecording = true
      const sessionTimestamp = Date.now()
      try {
        const biliApis = window.__biliExt.biliApis
        const storageService = window.__biliExt.storageService
        const allCards = document.querySelectorAll('.recommended-container_floor-aside .feed-card:nth-child(-n+11), .feed-card, .video-card')
        const recordRecommendVideos = [...allCards].filter(card => !card.querySelector('[class*="-ad"]'))
        let order = 0
        for (const video of recordRecommendVideos.slice(0, 11)) {
          const url = video.querySelector('a')?.href
          const title = video.querySelector('h3')?.title
          if (location.host.includes('bilibili.com') && url && !url.includes('cm.bilibili.com') && title) {
            try {
              const vid = biliApis.getCurrentVideoID(url)
              if (!vid) continue
              const videoInfo = await biliApis.getVideoInformation('video', vid)
              if (videoInfo) {
                const { tid, tid_v2, tname, tname_v2, pic, owner } = videoInfo
                const author = owner?.name || '未知作者'
                await storageService.addHistoryItem({
                  title, tid, tid_v2, tname, tname_v2, url, pic, author, order, sessionTimestamp
                })
                order++
              }
            } catch (e) {}
          }
        }
        logger.info('首页视频推荐历史｜已记录')
      } finally { this._isRecording = false }
    },

    async _generatorIndexRecommendVideoHistoryContents () {
      const listEl = document.getElementById('indexRecommendVideoHistoryList')
      if (!listEl) return
      const storageService = window.__biliExt.storageService
      const history = await storageService.getHistory()
      listEl.innerHTML = ''
      if (!history || !history.length) {
        listEl.innerHTML = '<div class="empty-state">暂无记录</div>'
        return
      }
      const sorted = history.sort((a, b) => (b.sessionTimestamp || b.timestamp || 0) - (a.sessionTimestamp || a.timestamp || 0))
      for (const video of sorted.slice(0, 100)) {
        const li = document.createElement('li')
        li.innerHTML = `<span><img src="${video.pic || ''}" loading="lazy" alt="${video.title || ''}" style="width:60px;height:38px;object-fit:cover;border-radius:4px"/></span>
          <div class="video-info" style="flex:1;min-width:0">
            <a href="${video.url}" target="_blank" title="${video.title}" style="color:#eaeaea;font-size:13px;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${video.title || '未知标题'}</a>
            <div class="video-author" style="font-size:12px;color:#8899aa">UP: ${video.author || '未知作者'}</div>
          </div>`
        li.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;transition:background .15s'
        li.addEventListener('click', () => { if (video.url) window.open(video.url, '_blank') })
        li.addEventListener('mouseenter', () => { li.style.background = 'rgba(233,69,96,.08)' })
        li.addEventListener('mouseleave', () => { li.style.background = '' })
        listEl.appendChild(li)
      }
    },
  }

  window.__biliExt.modules = window.__biliExt.modules || {}
  window.__biliExt.modules.home = module
})()
