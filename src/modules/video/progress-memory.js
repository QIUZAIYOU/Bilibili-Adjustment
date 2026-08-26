/* global _ */
import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { STORAGE_KEYS } from '@/shared/constants'
const logger = new LoggerService('VideoModule')
// 播放进度记忆（官方进度记忆失效时的兜底）
const PLAYBACK_STORE_LIMIT = 50
// 用户手动操作进度条后立即保存新进度：指针抬起时 seek 可能尚未完全结束，
// 延迟片刻等 currentTime 稳定后再写入，绕过 timeupdate 的 10s 节流
const PLAYBACK_SEEK_SAVE_DELAY_MS = 300
export const progressMemoryFeatures = {
    // ========== 播放进度记忆（官方进度记忆失效时的兜底） ==========
    initPlaybackMemory () {
        if (this._playbackBound) return
        // 先算 key 再置 bound：若 key 计算失败，不会留下 bound=true 的"半初始化"状态卡死后续重试
        this._playbackKey = this._getPlaybackKey()
        this._playbackBound = true
        this._playbackLastVideo = null
        this._playbackUserInteracted = false
        this._playbackUserSeeking = false
        this._playbackSeekSaveTimer = null
        this._playbackRestoredKey = null
        this._playbackRestoreTimer = null
        this._playbackSaveThrottled = _.throttle(this.savePlaybackPosition.bind(this), 10000)
        const isMainVideo = event => event.target instanceof HTMLVideoElement &&
                                     event.target.matches('#bilibili-player video')
        const diagLog = (type, event) => {
            if (this._playbackDiagFlags?.[type]) return
            this._playbackDiagFlags = this._playbackDiagFlags || {}
            this._playbackDiagFlags[type] = true
            logger.debug('播放进度诊断丨' + type + ' 事件 target=' + event.target?.tagName +
                ' matches=' + Boolean(event.target?.matches?.('#bilibili-player video')) +
                ' instanceof=' + (event.target instanceof HTMLVideoElement))
        }
        this._playbackTimeUpdateHandler = event => {
            diagLog('timeupdate', event)
            if (!isMainVideo(event)) return
            this._playbackLastVideo = { video: event.target, key: this._playbackKey }
            this._playbackSaveThrottled()
        }
        this._playbackPlayHandler = event => {
            diagLog('play', event)
            if (!isMainVideo(event)) return
            this._playbackLastVideo = { video: event.target, key: this._playbackKey }
            // 播放即视为用户主动控制，直到点击播放器内任意位置前豁免恢复
            this._playbackUserInteracted = false
            clearTimeout(this._playbackRestoreTimer)
            // 800ms 窗口：给官方进度记忆的 seek 留出时间，避免兜底与官方恢复竞争
            this._playbackRestoreTimer = setTimeout(() => this.restorePlaybackPosition(event.target), 800)
        }
        this._playbackPauseHandler = event => {
            diagLog('pause', event)
            if (!isMainVideo(event)) return
            // 切换选集后旧视频仍可能触发暂停：保留带旧 key 的条目，防止写入新视频 key
            if (this._playbackLastVideo?.video !== event.target) {
                this._playbackLastVideo = { video: event.target, key: this._playbackKey }
            }
            this.savePlaybackPosition()
        }
        this._playbackClickHandler = event => {
            if (event.target instanceof Element && event.target.closest('#bilibili-player')) {
                this._playbackUserInteracted = true
            }
        }
        this._playbackProgressPointerDownHandler = event => {
            if (!(event.target instanceof Element) || !event.target.closest(elementSelectors.value('playerProgress'))) return
            // 用户手动点击/拖动进度条：标记操作，抬起后立即保存新进度
            this._playbackUserSeeking = true
            clearTimeout(this._playbackSeekSaveTimer)
        }
        // 指针抬起/取消时 target 可能在进度条外（拖出控制条后松开），只依据标记判断
        this._playbackProgressReleaseHandler = () => {
            if (!this._playbackUserSeeking) return
            this._playbackUserSeeking = false
            // 延迟片刻等 seek 稳定后立即保存（绕过 timeupdate 的 10s 节流）
            clearTimeout(this._playbackSeekSaveTimer)
            this._playbackSeekSaveTimer = setTimeout(() => {
                this._playbackSeekSaveTimer = null
                this.savePlaybackPosition()
            }, PLAYBACK_SEEK_SAVE_DELAY_MS)
        }
        this._playbackPageHideHandler = () => this.savePlaybackPosition()
        this._playbackVisibilityHandler = () => {
            if (document.visibilityState === 'hidden') this.savePlaybackPosition()
        }
        // 捕获阶段监听：SPA 导航后 video 元素被替换，document 级监听无需重新绑定
        document.addEventListener('timeupdate', this._playbackTimeUpdateHandler, true)
        document.addEventListener('play', this._playbackPlayHandler, true)
        document.addEventListener('pause', this._playbackPauseHandler, true)
        document.addEventListener('click', this._playbackClickHandler, true)
        document.addEventListener('pointerdown', this._playbackProgressPointerDownHandler, true)
        document.addEventListener('pointerup', this._playbackProgressReleaseHandler, true)
        document.addEventListener('pointercancel', this._playbackProgressReleaseHandler, true)
        window.addEventListener('pagehide', this._playbackPageHideHandler)
        document.addEventListener('visibilitychange', this._playbackVisibilityHandler)
        logger.debug('播放进度诊断丨初始化完成 key=' + this._playbackKey)
        this._cleanup.push(() => this.destroyPlaybackMemory())
    },
    destroyPlaybackMemory () {
        if (!this._playbackBound) return
        logger.debug('播放进度诊断丨已销毁')
        this._playbackBound = false
        document.removeEventListener('timeupdate', this._playbackTimeUpdateHandler, true)
        document.removeEventListener('play', this._playbackPlayHandler, true)
        document.removeEventListener('pause', this._playbackPauseHandler, true)
        document.removeEventListener('click', this._playbackClickHandler, true)
        document.removeEventListener('pointerdown', this._playbackProgressPointerDownHandler, true)
        document.removeEventListener('pointerup', this._playbackProgressReleaseHandler, true)
        document.removeEventListener('pointercancel', this._playbackProgressReleaseHandler, true)
        window.removeEventListener('pagehide', this._playbackPageHideHandler)
        document.removeEventListener('visibilitychange', this._playbackVisibilityHandler)
        this._playbackSaveThrottled?.cancel?.()
        clearTimeout(this._playbackSeekSaveTimer)
        this._playbackSeekSaveTimer = null
        clearTimeout(this._playbackRestoreTimer)
        this._playbackRestoreTimer = null
    },
    _getPlaybackKey () {
        // 不能直接读 window.location.searchParams：Tampermonkey 沙箱（Chrome 隔离世界）中
        // Location 对象不暴露 searchParams，会抛 TypeError；new URL() 在沙箱中可用
        const url = new URL(window.location.href)
        // 归一化尾部斜杠：B站会通过 replaceState 在 /video/BV1xxx 与 /video/BV1xxx/ 之间切换，
        // 而 getFinalHref 判定 URL 变化时同样剥离尾部斜杠，两者不一致会导致 key 永远停留在旧形态
        return `${url.pathname.replace(/\/+$/, '')}?p=${url.searchParams.get('p') || '1'}`
    },
    _getPlaybackStore () {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_PLAYBACK_PROGRESS)) || {}
        } catch (error) {
            logger.error('播放进度丨读取存储失败', error)
            return {}
        }
    },
    _setPlaybackStore (store) {
        try {
            localStorage.setItem(STORAGE_KEYS.LOCAL_PLAYBACK_PROGRESS, JSON.stringify(store))
        } catch (error) {
            logger.error('播放进度丨保存存储失败', error)
        }
    },
    async savePlaybackPosition () {
        if (!this.userConfigs?.playback_memory || !this._playbackBound) {
            logger.debug('播放进度诊断丨守卫拦截 playback_memory=' + this.userConfigs?.playback_memory + ' bound=' + this._playbackBound)
            return
        }
        // URL 已变化时跳过，等待 handleHrefChanged 用缓存的旧 key 写入
        if (this._getPlaybackKey() !== this._playbackKey) {
            logger.debug('播放进度诊断丨守卫拦截 key runtime=' + this._getPlaybackKey() + ' cached=' + this._playbackKey)
            return
        }
        this._writePlaybackPosition(this._playbackLastVideo, this._playbackKey)
    },
    _writePlaybackPosition (entry, key) {
        // 仅当条目与 key 同源时才写入，避免旧视频事件把进度写到新视频 key 下
        const video = entry?.key === key ? entry.video : null
        logger.debug('播放进度诊断丨写入检查 entryKey=' + entry?.key + ' key=' + key + ' readyState=' + video?.readyState + ' currentTime=' + video?.currentTime)
        if (!video || !key || !this.userConfigs?.playback_memory) return
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) return
        const { currentTime, duration } = video
        if (!Number.isFinite(currentTime) || currentTime < 1) return
        const store = this._getPlaybackStore()
        // 已观看至结尾则清除记录，避免下次误跳
        if (Number.isFinite(duration) && currentTime >= duration - 3) {
            if (store[key]) {
                delete store[key]
                this._setPlaybackStore(store)
                logger.debug('播放进度丨已观看完毕，清除进度记录')
            }
            return
        }
        store[key] = { position: Math.floor(currentTime), timestamp: Date.now() }
        // LRU 上限：超出时按时间戳删除最旧记录
        const entries = Object.entries(store).sort((a, b) => b[1].timestamp - a[1].timestamp)
        if (entries.length > PLAYBACK_STORE_LIMIT) {
            entries.slice(PLAYBACK_STORE_LIMIT).forEach(([k]) => delete store[k])
        }
        this._setPlaybackStore(store)
        logger.debug('播放进度诊断丨已保存 ' + key + ' position=' + store[key]?.position)
    },
    async restorePlaybackPosition (video) {
        if (!video || !this.userConfigs?.playback_memory) return
        const key = this._playbackKey
        if (!key || this._playbackRestoredKey === key) return
        // 用户已交互（点击过播放器内任意位置）视为主动控制，不恢复
        if (this._playbackUserInteracted) {
            logger.debug('播放进度丨检测到用户交互，跳过恢复')
            return
        }
        // 官方进度记忆已生效（seek 后 currentTime > 2），兜底不再介入
        if (video.currentTime > 2) {
            logger.debug('播放进度丨官方进度记忆已生效，跳过兜底恢复')
            return
        }
        const record = this._getPlaybackStore()[key]
        if (!record) return
        const { position, timestamp } = record
        const { duration } = video
        if (position < 5 || (Number.isFinite(duration) && position >= duration - 3)) return
        // 超过 7 天的记录视为过期，不恢复
        if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return
        try {
            video.currentTime = position
            this._playbackRestoredKey = key
            logger.info(`播放进度丨已恢复至 ${Math.floor(position / 60)}分${position % 60}秒`)
        } catch (error) {
            logger.warn('播放进度丨恢复失败', error)
        }
    }
}
