import axios from 'axios'
import MD5 from 'md5'
import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { sleep, addEventListenerToElement, executeFunctionsSequentially, isTabActive, createElementAndInsert } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
const logger = new LoggerService('VideoModule')
const biliApis = {
    async getQueryWithWbi (originalParams) {
        const mixinKeyEncTab = [
            46,
            47,
            18,
            2,
            53,
            8,
            23,
            32,
            15,
            50,
            10,
            31,
            58,
            3,
            45,
            35,
            27,
            43,
            5,
            49,
            33,
            9,
            42,
            19,
            29,
            28,
            14,
            39,
            12,
            38,
            41,
            13,
            37,
            48,
            7,
            16,
            24,
            55,
            40,
            61,
            26,
            17,
            0,
            1,
            60,
            51,
            30,
            4,
            22,
            25,
            54,
            21,
            56,
            59,
            6,
            63,
            57,
            62,
            11,
            36,
            20,
            34,
            44,
            52
        ]
        // 对 imgKey 和 subKey 进行字符顺序打乱编码
        const getMixinKey = orig => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)
        // 为请求参数进行 wbi 签名
        const encWbi = (params, img_key, sub_key) => {
            const mixin_key = getMixinKey(img_key + sub_key),
                curr_time = Math.round(Date.now() / 1000),
                chr_filter = /[!'()*]/g
            Object.assign(params, { wts: curr_time }) // 添加 wts 字段
            // 按照 key 重排参数
            const query = Object.keys(params).sort().map(key => {
                // 过滤 value 中的 "!'()*" 字符
                const value = params[key].toString().replace(chr_filter, '')
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            }).join('&')
            const wbi_sign = MD5(query + mixin_key) // 计算 w_rid
            return query + '&w_rid=' + wbi_sign
        }
        // 获取最新的 img_key 和 sub_key
        const getWbiKeys = async () => {
            const url = 'https://api.bilibili.com/x/web-interface/nav'
            const res = await axios.get(url, { withCredentials: true })
            const { data: { wbi_img: { img_url, sub_url } } } = res.data
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
    async getVideoInformation (videoId) {
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`
        const { data, data: { code } } = await axios.get(url, { withCredentials: true })
        if (code === 0) return data
        else if (code === -400) logger.info('获取视频基本信息丨请求错误')
        else if (code === -403) logger.info('获取视频基本信息丨权限不足')
        else if (code === -404) logger.info('获取视频基本信息丨无视频')
        else if (code === 62002) logger.info('获取视频基本信息丨稿件不可见')
        else if (code === 62004) logger.info('获取视频基本信息丨稿件审核中')
        else if (code === 'ERR_BAD_REQUEST') logger.info('获取视频基本信息丨请求失败')
        else logger.warn('获取视频基本信息丨请求错误')
    },
    async getUserInformation (userId) {
        const url = `https://api.bilibili.com/x/web-interface/card?mid=${userId}`
        const { data, data: { code } } = await axios.get(url, { withCredentials: true })
        if (code === 0) return data
        else if (code === -400) logger.info('获取用户基本信息丨请求错误')
        else if (code === -403) logger.info('获取用户基本信息丨权限不足')
        else if (code === -404) logger.info('获取用户基本信息丨用户不存在')
        else if (code === 'ERR_BAD_REQUEST') logger.info('获取用户基本信息丨请求失败')
        else logger.warn('获取用户基本信息丨请求失败')
    },
    async isVip () {
        const userId = this.getCookieByName('DedeUserID')
        const { data: { card: { vip: { status } } } } = await biliApis.getUserInformation(userId)
        if (status) storageService.set('is_vip', true)
        else storageService.set('is_vip', false)
    },
    async getUserVideoList (userId) {
        const wib = await biliApis.getQueryWithWbi({ mid: userId })
        const url = `https://api.bilibili.com/x/space/wbi/arc/search?${wib}`
        const { data, data: { code } } = await axios.get(url, { withCredentials: true })
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
export default {
    name: 'home',
    dependencies: [],
    version: '1.0.0',
    async install () {
        eventBus.on('app:ready', () => {
            logger.info('首页模块｜已加载')
            this.preFunctions()
            this.handleExecuteFunctionsSequentially()
        })
    },
    async preFunctions () {
        this.userConfigs = await storageService.getAll()
        if (isTabActive()) {
            logger.info('标签页｜已激活')
        }
    },
    async setRecordRecommendVideoHistory () {
        const recordRecommendVideos = await elementSelectors.all('.recommended-container_floor-aside .feed-card:nth-child(-n+11):not(:has([class*="-ad"]))')
        recordRecommendVideos.forEach( async video => {
            const url = video.querySelector('a').href
            const title = video.querySelector('h3').title
            if (location.host.includes('bilibili.com') && !url.includes('cm.bilibili.com')) {
                const { data: { tid, pic } } = await biliApis.getVideoInformation(biliApis.getCurrentVideoID(url))
                logger.debug('推荐视频｜', title, tid, pic)
            }
        })
    },
    handleExecuteFunctionsSequentially () {
        const functions = [this.setRecordRecommendVideoHistory]
        executeFunctionsSequentially(functions)
    }
}
