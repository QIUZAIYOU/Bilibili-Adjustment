import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import axios from 'axios'
import MD5 from 'md5'
const logger = new LoggerService('BiliApis')
export const biliApis = {
    async getQueryWithWbi (originalParams) {
        const mixinKeyEncTab = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
        ]
        const getMixinKey = orig => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)
        const encWbi = (params, img_key, sub_key) => {
            const mixin_key = getMixinKey(img_key + sub_key),
                curr_time = Math.round(Date.now() / 1000),
                chr_filter = /[!'()*]/g
            Object.assign(params, { wts: curr_time })
            const query = Object.keys(params).sort().map(key => {
                const value = params[key].toString().replace(chr_filter, '')
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            }).join('&')
            const wbi_sign = MD5(query + mixin_key)
            return query + '&w_rid=' + wbi_sign
        }
        const getWbiKeys = async () => {
            const url = 'https://api.bilibili.com/x/web-interface/nav'
            const res = await axios.get(url, { withCredentials: true })
            const { data: { wbi_img: { img_url, sub_url }}} = res.data
            return {
                img_key: img_url.slice(
                    img_url.lastIndexOf('/') + 1,
                    img_url.lastIndexOf('.')
                ),
                sub_key: sub_url.slice(
                    sub_url.lastIndexOf('/') + 1,
                    sub_url.lastIndexOf('.')
                )
            }
        }
        const main = async () => {
            const web_keys = await getWbiKeys()
            const params = originalParams,
                img_key = web_keys.img_key,
                sub_key = web_keys.sub_key
            const query = encWbi(params, img_key, sub_key)
            return query
        }
        return main()
    },
    getCurrentVideoID (url = location.href) {
        if (!url) return
        const { pathname } = new URL(url)
        if (pathname.startsWith('/video/')) {
            const match = pathname.match(/\/video\/(BV\w+)/)
            return match?.[1] || 'error'
        } else if (pathname.startsWith('/bangumi/')) {
            const match = pathname.match(/\/bangumi\/play\/ep(\d+)/)
            return match?.[1] || 'error'
        }
        return 'error'
    },
    async getVideoInformation (pageType, videoId) {
        if (!videoId) return
        const url = pageType === 'video' ? `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}` : `https://api.bilibili.com/pgc/view/web/season?ep_id=${videoId}`
        if (pageType === 'video') {
            const { data: { code, data }} = await axios.get(url, { withCredentials: true })
            // logger.debug(pageType, videoId, data)
            if (code === 0) return data
            else if (code === -400) logger.info('获取视频基本信息丨请求错误')
            else if (code === -403) logger.info('获取视频基本信息丨权限不足')
            else if (code === -404) logger.info('获取视频基本信息丨无视频')
            else if (code === 62002) logger.info('获取视频基本信息丨稿件不可见')
            else if (code === 62004) logger.info('获取视频基本信息丨稿件审核中')
            else if (code === 'ERR_BAD_REQUEST') logger.info('获取视频基本信息丨请求失败')
            else logger.warn('获取视频基本信息丨请求错误')
        } else {
            const { data: { code, result }} = await axios.get(url, { withCredentials: true })
            // logger.debug(pageType, videoId, result)
            if (code === 0) return result
        }
    },
    async getUserInformation (userId) {
        const url = `https://api.bilibili.com/x/web-interface/card?mid=${userId}`
        const { data, data: { code }} = await axios.get(url, { withCredentials: true })
        if (code === 0) return data
        else if (code === -400) logger.info('获取用户基本信息丨请求错误')
        else if (code === -403) logger.info('获取用户基本信息丨权限不足')
        else if (code === -404) logger.info('获取用户基本信息丨用户不存在')
        else if (code === 'ERR_BAD_REQUEST') logger.info('获取用户基本信息丨请求失败')
        else logger.warn('获取用户基本信息丨请求失败')
    },
    async isVip () {
        const userId = this.getCookieByName('DedeUserID')
        const { data: { card: { vip: { status }}}} = await biliApis.getUserInformation(userId)
        if (status) storageService.userSet('is_vip', true)
        else storageService.userSet('is_vip', false)
    },
    async getUserVideoList (userId) {
        const wib = await biliApis.getQueryWithWbi({ mid: userId })
        const url = `https://api.bilibili.com/x/space/wbi/arc/search?${wib}`
        const { data, data: { code }} = await axios.get(url, { withCredentials: true })
        if (code === 0) return data
        else if (code === -400) {
            logger.info('获取用户投稿视频列表丨权限不足')
        } else if (code === -412) {
            logger.info('获取用户投稿视频列表丨请求被拦截')
        } else {
            logger.info('获取用户投稿视频列表丨请求失败')
        }
    }
}
