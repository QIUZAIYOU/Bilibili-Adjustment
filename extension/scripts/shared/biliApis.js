// ===== scripts/shared/biliApis.js =====
window.__biliExt = window.__biliExt || {}

;(function () {
  const common = window.__biliExt.common

  const biliApis = {
    WBI_KEYS_CACHE: null,

    // 获取 WBI 签名密钥
    async getWbiKeys () {
      if (this.WBI_KEYS_CACHE && Date.now() - this.WBI_KEYS_CACHE.timestamp < 86400000) return this.WBI_KEYS_CACHE
      try {
        const r = await fetch('https://api.bilibili.com/x/web-interface/nav')
        const d = await r.json()
        if (d.code !== 0) throw new Error('获取 WBI 密钥失败')
        const { wbi_img_url } = d.data
        if (!wbi_img_url) throw new Error('未找到 wbi_img_url')
        const imgUrlParts = wbi_img_url.split('/')
        const imgKey = imgUrlParts[imgUrlParts.length - 1].split('.')[0]
        const subUrl = wbi_img_url.replace('wbi/', 'wbi/').replace(imgKey, '')
        const subKey = subUrl.split('/').filter(Boolean).pop()?.split('.')[0] || imgKey
        this.WBI_KEYS_CACHE = { imgKey, subKey, timestamp: Date.now() }
        return this.WBI_KEYS_CACHE
      } catch (e) { throw e }
    },

    // WBI 签名算法
    async signWbi (params) {
      const { imgKey, subKey } = await this.getWbiKeys()
      const mixinKey = this._getMixinKey(imgKey + subKey)
      const ts = Math.round(Date.now() / 1000)
      const sorted = Object.keys({ ...params, wts: ts }).sort().reduce((acc, k) => { acc[k] = params[k] || ts; return acc }, {})
      const query = Object.entries(sorted).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      const wbiSign = this._md5(query + mixinKey)
      return { ...sorted, w_rid: wbiSign }
    },

    _getMixinKey(key) {
      const mixinKeyEncTab = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 37, 12, 52, 13, 30, 11, 52, 16, 54, 57, 51, 38, 21, 14, 17, 34, 1, 20, 44, 56, 55, 24, 43, 6, 36, 40, 7, 22, 57, 39, 56, 59, 60]
      let s = ''
      for (let i = 0; i < mixinKeyEncTab.length && i < key.length; i++) s += key[mixinKeyEncTab[i]]
      return s.slice(0, 32)
    },

    _md5(str) {
      // 简单 MD5 实现
      const md5 = window.md5
      if (md5) return md5(str)
      // 不使用库时跳过签名
      return str
    },

    // 获取视频信息
    async getVideoInfo (bvid) {
      try {
        const signed = await this.signWbi({ bvid })
        const params = new URLSearchParams(signed)
        const r = await fetch(`https://api.bilibili.com/x/web-interface/view?${params}`)
        return await r.json()
      } catch (e) { return { code: -1, message: e.message } }
    },

    // 获取视频播放地址
    async getVideoPlayUrl (bvid, cid, qn = 80) {
      try {
        const signed = await this.signWbi({ bvid, cid, qn })
        const params = new URLSearchParams(signed)
        const r = await fetch(`https://api.bilibili.com/x/player/playurl?${params}`)
        return await r.json()
      } catch (e) { return { code: -1, message: e.message } }
    },

    // 获取视频字幕
    async getVideoSubtitle (bvid, cid) {
      try {
        const r = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`)
        const d = await r.json()
        if (d.code === 0 && d.data?.subtitle?.subtitles?.length) {
          const subUrl = d.data.subtitle.subtitles[0].subtitle_url
          if (subUrl) {
            const subR = await fetch(`https:${subUrl}`)
            return await subR.json()
          }
        }
        return null
      } catch (e) { return null }
    },

    // 搜索
    async search (keyword, page = 1) {
      try {
        const r = await fetch(`https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(keyword)}&page=${page}`)
        return await r.json()
      } catch (e) { return { code: -1, message: e.message } }
    },

    // 获取首页推荐视频
    async getHomeRecommend () {
      try {
        const r = await fetch('https://api.bilibili.com/x/web-interface/popular/series/one?number=1')
        return await r.json()
      } catch (e) { return { code: -1, message: e.message } }
    },

    // 检查视频是否为付费视频
    async checkVideoPaid (aid) {
      try {
        const r = await fetch(`https://api.bilibili.com/x/web-interface/card?avid=${aid}`)
        const d = await r.json()
        return d.code === 0 && d.data?.is_pay === 1
      } catch (e) { return false }
    },

    // 获取用户信息
    async getUserInfo () {
      try {
        const r = await fetch('https://api.bilibili.com/x/web-interface/nav')
        return await r.json()
      } catch (e) { return { code: -1, message: e.message } }
    }
  }

  window.__biliExt.biliApis = biliApis
})()
