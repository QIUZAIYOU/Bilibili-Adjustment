import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import type { AdjustmentDialogInstance } from '@/components/popover-dialog'
import { createElementAndInsert, sleep } from '@/utils/common'
import {
    DEFAULT_PREVIEW_VOLUME,
    VOLUME_CONFIG_KEY,
    buildPreviewUrl,
    extractPreviewBvid,
    normalizePreviewTitle,
    normalizePreviewVolume
} from './video-preview-pure'
const logger = new LoggerService('HomeModule')
/**
 * 首页视频预览
 *
 * 背景（2026-09-24 用户需求）：首页只想"瞄一眼"某个视频时，现在只能靠鼠标悬停的 B 站内联预览 ——
 * 画面只有卡片那么大、**没有声音**、**不能拖进度**。本功能在卡片封面左上角加一个预览按钮，
 * 点击后在弹窗里用**同源 html5 播放页**真正播放：有声音、有进度条（可拖）、画面大，
 * 且因为同源，我们能注入样式把播放器自带的 logo/评论/调起 APP 等元素去掉，做到"弹窗里只有视频"。
 *
 * 关键取舍（都实测过）：
 * - 同源播放页 `www.bilibili.com/blackboard/html5mobileplayer.html`：`contentDocument` 可访问 → 可注入 CSS、
 *   可直接控制 `<video>`（音量/进度）；实测 `high_quality=1&qn=80` 可到 720P，未静音自动播放。
 * - 官方外链播放器 `player.bilibili.com/player.html`：**跨源**，内部样式改不了（自带标题/UP 浮层会与我们的
 *   标题栏重复），仅作兜底 —— 兜底时把弹窗标题清空，只留右侧「新标签页打开 + 关闭」。
 */
/** 关闭后保留弹窗实例的时长：期间再点别的视频直接复用（不重建 DOM，满足"所有预览共用一个弹窗"） */
const PREVIEW_KEEP_ALIVE_MS = 10 * 60 * 1000
/** 弹窗宽度 */
const PREVIEW_DIALOG_WIDTH = 'min(1100px, 94vw)'
/** 同源播放页最长等待（超时未出画面就回退官方外链播放器） */
const SAME_ORIGIN_READY_TIMEOUT_MS = 6000
/**
 * 注入同源播放页的样式：
 * - 去掉 B 站 logo、评论按钮、调起 APP 提示，并让控制条常显（弹窗里不需要"鼠标移入才出现"）；
 * - 音量控件落在**播放器自带工具栏**里（与宽屏/全屏按钮同级），故这里要覆盖 B 站给 `.mplayer-control-btn`
 *   定的 44px 固定宽度；图标与滑杆配色一律 `currentColor`（跟随播放器自身配色，也就不需要任何色值字面量）。
 */
const PLAYER_INJECTED_CSS = `
    .mplayer-panorama-logo,
    .mplayer-btn-comment,
    .mplayer-btn-comment-middle,
    .mplayer-btn-comment-full,
    .mplayer-comment-text-callapp,
    .mplayer-video-tips { display: none !important; }
    .mplayer-control-bar { opacity: 1 !important; }
    .mplayer-control-bar-right .adj-preview-volume { width: auto !important; gap: 6px; padding: 0 4px; }
    .adj-preview-volume svg { display: block; flex: none; }
    /* 滑杆的 color 必须显式 inherit：表单控件不继承文字色，Chrome 会给它自己的近黑色（#101010），
       那样 accent-color: currentColor 算出来就是几乎看不见的近黑滑杆 */
    .adj-preview-volume-slider { width: 72px; margin: 0; color: inherit; accent-color: currentColor; cursor: pointer; }
`
const INJECTED_STYLE_ID = 'adj-preview-player-style'
/** 播放器内音量控件的类名（也是"是否已注入"的幂等判据） */
const PLAYER_VOLUME_CLASS = 'adj-preview-volume'
/** 播放器内音量滑杆的类名 */
const PLAYER_VOLUME_SLIDER_CLASS = 'adj-preview-volume-slider'
/** 视频区已绑定「单击暂停/播放」的标记（打在 B 站元素上，按文档幂等） */
const PLAYER_CLICK_BOUND_ATTR = 'data-adj-preview-click-bound'
/** 首页视频预览特性上下文（由 home.module 的模块实例混入） */
export interface HomeVideoPreviewContext {
    userConfigs: Record<string, unknown>
    _previewDialog?: AdjustmentDialogInstance | null
    _previewFrame?: HTMLIFrameElement | null
    _previewObserver?: MutationObserver | null
    _previewBound?: boolean
    _previewBvid?: string
    _previewUsingFallback?: boolean
    /** 关闭弹窗时是否已绑定"停止播放"监听（只绑一次） */
    _previewHideBound?: boolean
    /** 是否是"因为关闭弹窗而暂停"（用于下次打开同一视频时接着播） */
    _previewPausedByHide?: boolean
    /** 是否正在等待同源播放页就绪（加载中关弹窗只能卸载 iframe，暂停旧文档没用） */
    _previewLoading?: boolean
    initVideoPreview: () => Promise<void>
    injectVideoPreviewButtons: () => void
    applySameOriginPlayerStyle: (volume: number) => void
    injectPlayerControls: (doc: Document, volume: number) => void
    togglePlayerPlayback: (doc: Document) => void
    pausePreviewPlayback: () => void
    resumePreviewPlaybackIfPausedByHide: () => void
    isPreviewDialogOpen: () => boolean
    openVideoPreview: (bvid: string, title: string) => Promise<void>
    destroyVideoPreview: () => void
}
const cardSelector = (): string | null => elementSelectors.CSS('homeVideoCard')
const linkSelector = (): string | null => elementSelectors.CSS('homeVideoCardLink')
const titleSelector = (): string | null => elementSelectors.CSS('homeVideoCardTitle')
/** 读卡片上的 bvid 与标题（bvid 取不到返回 null） */
const readCardInfo = (wrap: Element): { bvid: string, title: string } | null => {
    const cardSelectorValue = cardSelector()
    const card = cardSelectorValue ? wrap.closest(cardSelectorValue) : null
    const linkSelectorValue = linkSelector()
    const href = (linkSelectorValue ? card?.querySelector(linkSelectorValue) : null)?.getAttribute('href')
    const bvid = extractPreviewBvid(href)
    if (!bvid) return null
    const titleSelectorValue = titleSelector()
    const title = normalizePreviewTitle(titleSelectorValue ? card?.querySelector(titleSelectorValue)?.textContent : '')
    return { bvid, title }
}
/** 用**目标文档**建元素（模板仍走注册表） */
const createElementIn = (doc: Document, html: string): HTMLElement | null => {
    const holder = doc.createElement('div')
    holder.innerHTML = html.trim()
    return holder.firstElementChild as HTMLElement | null
}
/** 给弹窗标题栏加我们的自定义控件（只有一颗「新标签页打开」图标；关闭按钮由弹窗壳自带） */
const buildHeaderExtra = (context: HomeVideoPreviewContext): HTMLElement => {
    const wrap = document.createElement('div')
    wrap.className = 'adj-video-preview-header-extra'
    const openButton = createElementAndInsert(getTemplates.homePreviewOpenButton, wrap) as HTMLElement | null
    openButton?.addEventListener('click', () => {
        const bvid = context._previewBvid
        if (!bvid) return
        // 被浏览器拦截时 window.open 返回 null：这种情况**不关弹窗**，否则用户白丢正在看的画面
        const opened = window.open(buildPreviewUrl(getTemplates.homePreviewVideoPageUrl, bvid), '_blank')
        if (opened) context._previewDialog?.close()
        else logger.warn('首页视频预览丨新标签页被浏览器拦截，已保留预览弹窗')
    })
    return wrap
}
/**
 * 等同一源播放页真的出画面；等待期间**持续**套用我们的样式与音量（否则换视频后重新加载的那一瞬间
 * 会有 logo 闪现、音量回到 100%）。超时返回 false（调用方据此回退官方外链播放器）。
 */
/**
 * 等同一源播放页真的加载出「我们刚设的这个地址」并且出画面；等待期间**持续**套用样式与音量
 * （否则换视频后重新加载的那一瞬间会有 logo 闪现、音量回到 100%）。超时返回 false → 调用方回退官方外链播放器。
 *
 * ⚠️ 必须比对文档地址：在**已有 iframe** 上换视频时，一开始 `contentDocument` 还是**上一条视频**的文档
 * （同源、视频已就绪），只判 `video.readyState` 会立刻误判"就绪"，导致新视频加载完成后既没有我们的样式、
 * 音量也回到 100%（2026-09-24 夹具实测踩到）。
 */
const waitForSameOriginPlayer = async (context: HomeVideoPreviewContext, frame: HTMLIFrameElement, volume: number, expectedUrl: string, timeout = SAME_ORIGIN_READY_TIMEOUT_MS): Promise<boolean> => {
    const deadline = Date.now() + timeout
    let expected: URL | null = null
    try {
        expected = new URL(expectedUrl, location.href)
    } catch { /* 模板地址非法时退化为"只等视频就绪" */ }
    const isExpectedDocument = (doc: Document | null): boolean => {
        if (!doc) return false
        const url = doc.URL
        // 刚设上 src 时 contentDocument 还是初始 about:blank 占位文档（同源，会被立刻替换）
        if (!url || url === 'about:blank') return false
        if (!expected) return true
        try {
            const actual = new URL(url)
            return actual.pathname === expected.pathname && actual.search === expected.search
        } catch {
            return false
        }
    }
    while (Date.now() < deadline) {
        const doc = frame.contentDocument
        if (isExpectedDocument(doc) && doc) {
            context.applySameOriginPlayerStyle?.(volume)
            const video = doc.querySelector('video')
            if (video && video.readyState > 0) return true
        }
        await sleep(300)
    }
    return false
}
export const homeVideoPreviewFeatures = {
    /** 给卡片封面区注入预览按钮（幂等：已注入的卡片跳过；广告位没有封面区天然跳过） */
    injectVideoPreviewButtons (this: HomeVideoPreviewContext): void {
        const wrapSelector = elementSelectors.CSS('homeVideoCardImageWrap')
        if (!wrapSelector) return
        elementSelectors.queryAll('homeVideoCardImageWrap').forEach(wrap => {
            if (wrap.querySelector('.adj-video-preview-btn')) return
            const info = readCardInfo(wrap)
            if (!info) return
            const button = createElementAndInsert(getTemplates.homePreviewButton, wrap) as HTMLElement | null
            if (!button) return
            button.setAttribute('data-adj-preview-bvid', info.bvid)
        })
    },
    async initVideoPreview (this: HomeVideoPreviewContext): Promise<void> {
        if (!this.userConfigs.home_video_preview) {
            logger.debug('首页视频预览丨功能已关闭')
            return
        }
        this.injectVideoPreviewButtons()
        // 首页「换一换」与无限滚动都会新增卡片：用观察者补注入（同一批变更只扫一次）
        if (!this._previewObserver) {
            let pending = false
            const observer = new MutationObserver(() => {
                if (pending) return
                pending = true
                setTimeout(() => {
                    pending = false
                    this.injectVideoPreviewButtons()
                }, 200)
            })
            observer.observe(document.body, { childList: true, subtree: true })
            this._previewObserver = observer
        }
        // 事件委托：只在 document 上挂一次，动态新增的卡片按钮同样生效
        if (!this._previewBound) {
            this._previewBound = true
            document.addEventListener('click', event => {
                const target = event.target as Element | null
                const button = target?.closest('.adj-video-preview-btn')
                if (!button) return
                // 卡片外层是 <a>：必须拦住默认跳转，否则点预览会跳进视频页
                event.preventDefault()
                event.stopPropagation()
                const wrap = button.parentElement
                const info = wrap ? readCardInfo(wrap) : null
                const bvid = button.getAttribute('data-adj-preview-bvid') || info?.bvid
                if (!bvid) return
                // 顺手暂停卡片自带的 hover 内联预览，避免两个播放器一起响
                const inlineSelector = elementSelectors.CSS('homeVideoCardInlineVideo')
                const inlineVideo = inlineSelector ? wrap?.querySelector(inlineSelector) as HTMLVideoElement | null : null
                inlineVideo?.pause()
                void this.openVideoPreview(bvid, info?.title || '')
            }, true)
        }
        logger.debug('首页视频预览丨已初始化')
    },
    async openVideoPreview (this: HomeVideoPreviewContext, bvid: string, title: string): Promise<void> {
        if (!bvid) return
        this._previewBvid = bvid
        this._previewUsingFallback = false
        const volume = normalizePreviewVolume(this.userConfigs[VOLUME_CONFIG_KEY], DEFAULT_PREVIEW_VOLUME)
        const dialog = openAdjustmentDialog({
            key: 'home-video-preview',
            keepAliveMs: PREVIEW_KEEP_ALIVE_MS,
            title,
            width: PREVIEW_DIALOG_WIDTH,
            className: 'adj-video-preview-dialog',
            headerExtra: buildHeaderExtra(this),
            content: body => {
                const frame = document.createElement('iframe')
                frame.className = 'adj-video-preview-frame'
                frame.allowFullscreen = true
                frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media')
                frame.setAttribute('scrolling', 'no')
                body.appendChild(frame)
                this._previewFrame = frame
            }
        })
        this._previewDialog = dialog
        // ⚠️ 弹窗按 `keepAliveMs` 缓存复用 —— 关闭只是**隐藏**，iframe 与里面的播放器会继续播（用户能听见声音）。
        // 弹窗壳的 `onClosed` 只在真正销毁时触发，所以这里直接听 popover 的 toggle：关闭即停止播放。
        if (!this._previewHideBound) {
            this._previewHideBound = true
            dialog.root.addEventListener('toggle', (event: Event) => {
                if ((event as ToggleEvent).newState !== 'closed') return
                this.pausePreviewPlayback()
            })
        }
        // 复用已存在的弹窗时，标题与「新标签页打开」的目标要跟着换（同 key 单例不会重建 DOM）
        const titleEl = dialog.header.querySelector('.adjustment-dialog-title')
        if (titleEl) titleEl.textContent = title
        dialog.root.setAttribute('aria-label', title || '视频预览')
        const frame = this._previewFrame
        if (!frame) return
        const primaryUrl = buildPreviewUrl(getTemplates.homePreviewPlayerUrl, bvid)
        const fallbackUrl = buildPreviewUrl(getTemplates.homePreviewPlayerUrlFallback, bvid)
        // 已是同一地址（缓存复用）就不要重设 src：给 iframe.src 赋相同值也会触发重新加载，
        // 白白丢掉已缓冲的进度（UP主空间弹窗同款处理）
        if (frame.getAttribute('src') !== primaryUrl) {
            frame.src = primaryUrl
            this._previewPausedByHide = false
        }
        this._previewLoading = true
        const ready = await waitForSameOriginPlayer(this, frame, volume, primaryUrl)
        this._previewLoading = false
        // 等待期间用户把弹窗关了：别再恢复播放，也别继续加载（否则页面加载完自己就播起来、关了还在响）
        if (!this.isPreviewDialogOpen()) {
            frame.src = 'about:blank'
            logger.debug('首页视频预览丨加载期间弹窗已被关闭，已卸载播放器')
            return
        }
        if (ready) {
            this.applySameOriginPlayerStyle(volume)
            this.resumePreviewPlaybackIfPausedByHide()
            logger.debug(`首页视频预览丨同源播放页已就绪（${bvid}）`)
            return
        }
        // 兜底：官方外链播放器（跨源，改不了它的内部样式，标题交给它自带的浮层显示）
        if (!this.isPreviewDialogOpen()) {
            frame.src = 'about:blank'
            return
        }
        this._previewUsingFallback = true
        frame.src = fallbackUrl
        if (titleEl) titleEl.textContent = ''
        dialog.root.setAttribute('aria-label', '视频预览')
        logger.warn(`首页视频预览丨同源播放页不可用，已回退官方外链播放器（${bvid}）`)
    },
    /** 给同源播放页注入样式、套用音量，并挂上音量控件与「单击暂停/播放」（跨源时静默跳过） */
    applySameOriginPlayerStyle (this: HomeVideoPreviewContext, volume: number): void {
        const doc = this._previewFrame?.contentDocument
        if (!doc?.head) return
        if (!doc.getElementById(INJECTED_STYLE_ID)) {
            const style = doc.createElement('style')
            style.id = INJECTED_STYLE_ID
            style.textContent = PLAYER_INJECTED_CSS
            doc.head.appendChild(style)
        }
        const video = doc.querySelector('video')
        if (video) video.volume = volume
        // 注入失败不能连累调用方：本方法在等待播放页就绪的轮询里被反复调用，异常会一路穿过
        // waitForSameOriginPlayer → openVideoPreview，把「恢复播放/回退兜底/清加载标记」全部打断
        // （2026-09-24 就是这样让音量控件与单击绑定一起消失的）
        try {
            this.injectPlayerControls(doc, volume)
        } catch (error) {
            logger.error('首页视频预览丨播放器控件注入失败', error)
        }
    },
    /**
     * 在播放页里挂两样东西（等待播放页就绪期间会被反复调用，故必须幂等）：
     * - 音量控件：插进**播放器自带的右侧工具栏**（进度条右边、与宽屏/全屏按钮同一条），拖动即改 `<video>.volume`，
     *   松手才写库（遵守 P0-3 的批量/低频写入约定）；
     * - 单击视频区暂停/播放：这套 html5 播放页自己**不支持**点击切换（实测 click 后 `paused` 不变），
     *   所以由我们绑；监听挂在 `.mplayer-video-wrap` 上，控制条在同级的 `.mplayer-display` 里，
     *   点控件不会误触发。
     */
    injectPlayerControls (this: HomeVideoPreviewContext, doc: Document, volume: number): void {
        const toolbarSelector = elementSelectors.CSS('previewPlayerRightToolbar')
        const toolbar = toolbarSelector ? doc.querySelector(toolbarSelector) : null
        if (toolbar && !toolbar.querySelector(`.${PLAYER_VOLUME_CLASS}`)) {
            // ⚠️ 必须用 iframe 自己的 document 建元素：`createElementAndInsert` 里的 `target instanceof Node`
            // 用的是**顶层窗口**的 Node 构造器，跨文档的 iframe 元素一律判定失败并抛
            // 「Target must be a valid DOM node」—— 2026-09-24 实测就是它让音量控件与单击绑定**双双失效**
            // （异常从 waitForSameOriginPlayer 的轮询里抛出，后面所有初始化一起中断）
            const control = createElementIn(doc, getTemplates.homePreviewVolumeControl)
            const slider = control?.querySelector(`.${PLAYER_VOLUME_SLIDER_CLASS}`) as HTMLInputElement | null
            if (control && slider) {
                toolbar.prepend(control)
                slider.value = String(volume)
                const applyVolume = (value: number): void => {
                    const video = doc.querySelector('video')
                    if (video) video.volume = value
                }
                slider.addEventListener('input', () => applyVolume(normalizePreviewVolume(slider.value)))
                slider.addEventListener('change', () => {
                    const value = normalizePreviewVolume(slider.value)
                    applyVolume(value)
                    // 同步进内存配置：否则同一次会话里再打开预览会用旧值把音量覆盖回去
                    this.userConfigs[VOLUME_CONFIG_KEY] = value
                    void storageService.userSet(VOLUME_CONFIG_KEY, value)
                })
            } else {
                logger.warn('首页视频预览丨音量控件模板异常，已跳过注入')
            }
        }
        const wrapSelector = elementSelectors.CSS('previewPlayerVideoWrap')
        const videoWrap = wrapSelector ? doc.querySelector(wrapSelector) : null
        if (videoWrap && !videoWrap.hasAttribute(PLAYER_CLICK_BOUND_ATTR)) {
            videoWrap.setAttribute(PLAYER_CLICK_BOUND_ATTR, '')
            videoWrap.addEventListener('click', () => this.togglePlayerPlayback(doc))
        }
    },
    /** 播放器单击切换：按当前状态决定播还是停（自动播放被浏览器拦下时静默忽略） */
    togglePlayerPlayback (this: HomeVideoPreviewContext, doc: Document): void {
        const video = doc.querySelector('video')
        if (!video) return
        if (video.paused) void video.play().catch(() => { /* 被自动播放策略拦下：保持暂停，用户点播放键即可 */ })
        else video.pause()
    },
    /** 预览弹窗当前是否处于打开状态 */
    isPreviewDialogOpen (this: HomeVideoPreviewContext): boolean {
        return !!this._previewDialog?.root?.matches(':popover-open')
    },
    /**
     * 关闭弹窗时停止播放。
     *
     * 弹窗按 keepAlive 缓存复用，关闭只是隐藏 —— 不处理的话 iframe 里的播放器会继续播、用户关了还听得见声音。
     * 三种情况分别处理：
     * - 同源播放页已就绪：直接 `pause()`（保留已加载页面，下次打开接着看）；
     * - **还在加载中**：暂停旧文档没有意义（新页面加载完会按 `autoplay=1` 自己播），直接卸载成 `about:blank`；
     * - 兜底的官方外链播放器（跨源，父页面碰不到它内部）：同样卸载 iframe 来立刻静音。
     */
    pausePreviewPlayback (this: HomeVideoPreviewContext): void {
        const frame = this._previewFrame
        if (!frame) return
        this._previewPausedByHide = false
        if (this._previewLoading) {
            frame.src = 'about:blank'
            logger.debug('首页视频预览丨加载期间关闭弹窗，已卸载播放器')
            return
        }
        const video = frame.contentDocument?.querySelector('video')
        if (video) {
            if (!video.paused) this._previewPausedByHide = true
            video.pause()
            logger.debug('首页视频预览丨弹窗已关闭，已暂停播放')
            return
        }
        frame.src = 'about:blank'
        logger.debug('首页视频预览丨弹窗已关闭，已卸载跨源播放器')
    },
    /** 重新打开同一视频时，如果上次是"因为关闭而暂停"、且弹窗确实开着，就接着播 */
    resumePreviewPlaybackIfPausedByHide (this: HomeVideoPreviewContext): void {
        if (!this._previewPausedByHide) return
        this._previewPausedByHide = false
        if (!this.isPreviewDialogOpen()) return
        const video = this._previewFrame?.contentDocument?.querySelector('video')
        if (!video) return
        void video.play().catch(() => { /* 自动播放被拦时保持暂停，用户点播放即可 */ })
    },
    destroyVideoPreview (this: HomeVideoPreviewContext): void {
        this._previewDialog?.destroy()
        this._previewDialog = null
        this._previewFrame = null
        this._previewObserver?.disconnect()
        this._previewObserver = null
        logger.debug('首页视频预览丨已销毁')
    }
}
