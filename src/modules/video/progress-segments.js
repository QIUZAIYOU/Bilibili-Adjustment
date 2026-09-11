/**
 * 进度条片段染色
 *
 * 在官方进度条上，把「跳过片段」覆盖的时间区间染色，便于一眼看出哪些部分会被跳过。
 * 颜色取自主题变量 --adj-progress-tint（官方蓝色系里更深的一档），随主题自动变化，
 * 不写死任何色值（项目红线：样式只用 var(--adj-*)）。
 */
import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { storageService } from '@/services/storage.service'
import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { sanitizeSegments } from './skip-manager/pure'
const logger = new LoggerService('ProgressTint')
const TINT_CLASS = 'adjustment-progress-tint'
const BAR_SELECTOR = '.bpx-player-progress-area .bpx-player-progress'
const STYLE_ID = 'adjustment-progress-tint-style'
const TINT_STYLE = `
    .${TINT_CLASS}-layer {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        pointer-events: none;
    }
    .${TINT_CLASS} {
        position: absolute;
        top: 0;
        bottom: 0;
        background: var(--adj-progress-tint);
        border-radius: 2px;
    }
`
/**
 * 当前视频 id：复用 biliApis.getCurrentVideoID，因此普通视频（BVxxx）、
 * 番剧分集（epxxx）与剧集页（ssxxx → 由 biliApis 解析为当前 ep）都能命中同一份片段缓存
 */
const resolveVideoId = () => {
    const id = biliApis.getCurrentVideoID(window.location.href)
    return id && id !== 'error' ? String(id) : null
}
let started = false
let currentId = ''
let observer = null
const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = TINT_STYLE
    document.head.appendChild(style)
}
const removeTints = () => {
    document.querySelectorAll('.' + TINT_CLASS + '-layer').forEach(el => el.remove())
}
/** 把片段区间绘制到官方进度条上 */
const renderTints = async segments => {
    const bar = document.querySelector(BAR_SELECTOR)
    if (!bar) return
    const video = elementSelectors.get('video')
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0
    if (!duration) return
    removeTints()
    const valid = (segments || []).filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    if (valid.length === 0) return
    const layer = document.createElement('div')
    layer.className = TINT_CLASS + '-layer'
    for (const seg of valid) {
        const left = Math.max(0, Math.min(1, seg.start / duration))
        const right = Math.max(0, Math.min(1, seg.end / duration))
        if (right <= left) continue
        const tint = document.createElement('div')
        tint.className = TINT_CLASS
        tint.style.left = (left * 100).toFixed(4) + '%'
        tint.style.width = ((right - left) * 100).toFixed(4) + '%'
        layer.appendChild(tint)
    }
    if (layer.childElementCount === 0) return
    bar.appendChild(layer)
}
const isTintEnabled = async () => {
    try {
        // 未配置过时按开启处理（schema 默认值为 true，此处仅作兜底）
        return (await ConfigService.getValue('progress_segment_tint')) !== false
    } catch {
        return true
    }
}
const refresh = async () => {
    if (!(await isTintEnabled())) {
        removeTints()
        return
    }
    const id = resolveVideoId()
    if (!id) {
        removeTints()
        currentId = ''
        return
    }
    if (id !== currentId) currentId = id
    try {
        const cached = await storageService.adCacheGet(id)
        const segments = sanitizeSegments((cached && (cached.segments || cached)) || [])
        await renderTints(segments)
    } catch (error) {
        logger.debug('读取片段缓存失败，跳过进度条染色:', error && error.message)
    }
}
/** 启动：官方进度条插入后绘制，并在时长/视频切换时重绘 */
export const initProgressSegmentTint = () => {
    if (started) return
    started = true
    ensureStyle()
    // 配置变更即时生效：关闭后立即清除已有染色
    eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_, payload) => {
        if (payload && payload.key === 'progress_segment_tint') refresh()
    })
    const attach = () => {
        const bar = document.querySelector(BAR_SELECTOR)
        if (!bar) return false
        if (observer) observer.disconnect()
        observer = new MutationObserver(() => refresh())
        observer.observe(bar.parentElement || bar, { childList: true })
        const video = elementSelectors.get('video')
        if (video) {
            video.addEventListener('durationchange', refresh, { passive: true })
            video.addEventListener('loadedmetadata', refresh, { passive: true })
        }
        refresh()
        return true
    }
    if (attach()) return
    let timer = null
    const waitBar = new MutationObserver(() => {
        if (attach()) {
            clearTimeout(timer)
            waitBar.disconnect()
        }
    })
    try {
        waitBar.observe(document.documentElement, { childList: true, subtree: true })
    } catch {
        // 观察器不可用时退化为轮询
    }
    timer = setInterval(() => {
        if (attach()) {
            clearInterval(timer)
            waitBar.disconnect()
        }
    }, 1000)
}
export const refreshProgressSegmentTint = () => refresh()
