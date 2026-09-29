import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { LOADING_OVERLAY_HIDDEN_CLASS } from '@/shared/templates/loading'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import type { AdjustmentDialogInstance } from '@/components/popover-dialog'
import { createElementAndInsert, sleep } from '@/utils/common'
import { PREVIEW_FRAME_ATTR } from '@/utils/preview-frame'
import { buildPreviewUrl, extractPreviewBvid, normalizePreviewTitle } from './video-preview-pure'
const logger = new LoggerService('HomeModule')
/**
 * 首页视频预览
 *
 * 背景（2026-09-24 用户需求）：首页只想"瞄一眼"某个视频时，现在只能靠鼠标悬停的 B 站内联预览 ——
 * 画面只有卡片那么大、**没有声音**、**不能拖进度**。本功能在卡片封面左上角加一个预览按钮，
 * 点击后在弹窗里真正播放。
 *
 * 播放器选型（2026-09-25 换过一次，都是实测结论）：
 * - ❌ 同源移动播放页 `blackboard/html5mobileplayer.html`：轻、稳、同源，但控制条**极其简陋**
 *   （只有播放/进度/宽屏），声音、倍速、清晰度、弹幕、画中画、全屏全都没有；
 *   自己往里塞控件（音量/单击暂停）则要跟它的覆盖层斗智（点击永远落在 `.mplayer-display` 上），
 *   且永远做不出"和视频播放页一样"。
 * - ✅ **视频播放页整页** + **让 B 站自己进入「网页全屏」**：控制条就是视频播放页那一套（音量/清晰度/倍速/
 *   字幕/弹幕/画中画/宽屏/网页全屏/全屏/设置），样式与行为零维护成本地"完全对齐"，
 *   「点画面暂停/播放」也是它自带的。网页全屏是 B 站自己的模式，播放器正好铺满 iframe，
 *   我们不需要用 CSS 去钉版面（钉了反而会触发它的迷你播放器逻辑、把点击吃掉）。
 * - 官方外链播放器 `player.bilibili.com/player.html`：**跨源**，内部样式改不了（自带标题/UP 浮层会与我们的
 *   标题栏重复），仅作兜底 —— 兜底时把弹窗标题清空，只留右侧「新标签页打开 + 关闭」。
 *
 * 代价：视频播放页比移动播放页重（多拉页面数据），且我们自己的脚本也会在该 iframe 里跑一遍（它匹配 /video/）。
 */
/** 关闭后保留弹窗实例的时长：期间再点别的视频直接复用（不重建 DOM，满足"所有预览共用一个弹窗"） */
const PREVIEW_KEEP_ALIVE_MS = 10 * 60 * 1000
/** 弹窗宽度 */
const PREVIEW_DIALOG_WIDTH = 'min(1100px, 94vw)'
/** 播放页最长等待（超时未出画面就回退官方外链播放器）—— 视频播放页比移动播放页慢，留宽一点 */
const SAME_ORIGIN_READY_TIMEOUT_MS = 12000
/** 注入播放页样式的 `<style>` id（幂等判据） */
const PREVIEW_STYLE_ID = 'adj-preview-style'
/** 等播放器渲染出「网页全屏」按钮的上限（控制条是悬停后才渲染的） */
const WEB_FULLSCREEN_BUTTON_TIMEOUT_MS = 6000
/** 首页视频预览特性上下文（由 home.module 的模块实例混入） */
export interface HomeVideoPreviewContext {
    userConfigs: Record<string, unknown>
    _previewDialog?: AdjustmentDialogInstance | null
    _previewFrame?: HTMLIFrameElement | null
    /** 加载遮罩（盖在 iframe 上，铺满后才揭开） */
    _previewLoadingEl?: HTMLElement | null
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
    enterPlayerWebFullscreen: (doc: Document) => Promise<boolean>
    isPlayerFilled: (doc: Document, player?: Element | null) => boolean
    applyPreviewPlayerStyle: (doc: Document) => void
    setPreviewLoadingVisible: (visible: boolean) => void
    pausePreviewPlayback: () => void
    guardPreviewPlaybackWhileHidden: () => void
    /** 已挂过「关闭后禁播」监听的 frame 文档（iframe 每次导航都换文档，故按文档比对避免重复挂） */
    _previewPlayGuardDoc?: Document | null
    /** 「关闭后禁播」的 load 监听是否已挂（只挂一次，避免重复开弹窗累积监听） */
    _previewPlayGuardLoadBound?: boolean
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
/** 取预览 iframe 里的播放器 `<video>`（选择器走注册表：`#bilibili-player video`；跨源时返回 null） */
const previewVideoElement = (frame?: HTMLIFrameElement | null): HTMLVideoElement | null => {
    const doc = frame?.contentDocument
    if (!doc) return null
    const selector = elementSelectors.CSS('video')
    return (selector ? doc.querySelector(selector) : doc.querySelector('video')) as HTMLVideoElement | null
}
/**
 * 等播放页真的加载出**我们要的那条视频**并且出画面；超时返回 false（调用方据此回退官方外链播放器）。
 *
 * ⚠️ 必须确认文档换成新视频：在**已有 iframe** 上换视频时，一开始 `contentDocument` 还是**上一条视频**的文档
 * （同源、视频已就绪），只判 `video.readyState` 会立刻误判"就绪"（2026-09-24 夹具实测踩到）。
 * 判据用「文档地址里含目标 bvid」而不是整串 URL 比对 —— 播放页会自己往地址上追加参数、也可能改路径尾斜杠，
 * 整串比对会莫名其妙判失败并回退兜底播放器。
 */
const waitForSameOriginPlayer = async (frame: HTMLIFrameElement, bvid: string, timeout = SAME_ORIGIN_READY_TIMEOUT_MS): Promise<boolean> => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        const doc = frame.contentDocument
        // 刚设上 src 时 contentDocument 还是初始 about:blank 占位文档（同源，会被立刻替换）
        if (doc && doc.URL && doc.URL !== 'about:blank' && doc.URL.includes(bvid)) {
            const video = previewVideoElement(frame)
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
                // 预览标记：子框架里的脚本据此跳过「屏幕模式」等页面级自动化，否则它会把我们刚进的
                // 网页全屏改成用户的默认模式（见 utils/preview-frame）
                frame.setAttribute(PREVIEW_FRAME_ATTR, '')
                body.appendChild(frame)
                this._previewFrame = frame
                // 「关了就必须静音」的兜底监听（不依赖关闭事件，见方法注释）
                this.guardPreviewPlaybackWhileHidden()
                // 遮罩放在 iframe 之后（同层叠靠后 → 盖在上面），铺满后揭开
                this._previewLoadingEl = createElementAndInsert(getTemplates.loadingOverlay, body) as HTMLElement | null
                const loadingTextField = queryTemplateTextField(this._previewLoadingEl)
                if (loadingTextField) loadingTextField.textContent = '视频加载中'
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
        // 视频区（body）要落在页面垂直中心：弹窗整体上移 header 高度的一半（标题长度会改 header 高度，故每次量）
        const headerHalf = Math.round(dialog.header.getBoundingClientRect().height / 2)
        if (headerHalf > 0) dialog.root.style.setProperty('--adj-preview-header-half', `${headerHalf}px`)
        const frame = this._previewFrame
        if (!frame) return
        const primaryUrl = buildPreviewUrl(getTemplates.homePreviewPlayerUrl, bvid)
        const fallbackUrl = buildPreviewUrl(getTemplates.homePreviewPlayerUrlFallback, bvid)
        // 已是同一地址（缓存复用）就不要重设 src：给 iframe.src 赋相同值也会触发重新加载，
        // 白白丢掉已缓冲的进度（UP主空间弹窗同款处理）
        if (frame.getAttribute('src') !== primaryUrl) {
            // 真要重新加载才盖遮罩：复用同一个已就绪的播放器时不必闪一下"视频加载中"
            this.setPreviewLoadingVisible(true)
            frame.src = primaryUrl
            this._previewPausedByHide = false
        }
        this._previewLoading = true
        const ready = await waitForSameOriginPlayer(frame, bvid)
        this._previewLoading = false
        // 等待期间用户把弹窗关了：别再恢复播放，也别继续加载（否则页面加载完自己就播起来、关了还在响）
        if (!this.isPreviewDialogOpen()) {
            frame.src = 'about:blank'
            logger.debug('首页视频预览丨加载期间弹窗已被关闭，已卸载播放器')
            return
        }
        if (ready) {
            const doc = frame.contentDocument
            if (doc) {
                await this.enterPlayerWebFullscreen(doc)
                // 铺满之后再注入"只留视频"的样式：放在进入之前会改变页面版式，干扰它自己进入网页全屏
                this.applyPreviewPlayerStyle(doc)
            }
            // 铺满了（或尝试失败）才揭开遮罩：失败时也揭开，否则用户会永远停在"视频加载中"，
            // 而这时播放器其实是可以用的（只是尺寸退回播放页默认版式）
            this.setPreviewLoadingVisible(false)
            this.resumePreviewPlaybackIfPausedByHide()
            logger.debug(`首页视频预览丨播放页已就绪（${bvid}）`)
            return
        }
        // 兜底：官方外链播放器（跨源，改不了它的内部样式，标题交给它自带的浮层显示）
        if (!this.isPreviewDialogOpen()) {
            frame.src = 'about:blank'
            return
        }
        this._previewUsingFallback = true
        frame.src = fallbackUrl
        // 兜底播放器内部碰不到，加载状态无从判断，直接揭开遮罩
        this.setPreviewLoadingVisible(false)
        if (titleEl) titleEl.textContent = ''
        dialog.root.setAttribute('aria-label', '视频预览')
        logger.warn(`首页视频预览丨播放页不可用，已回退官方外链播放器（${bvid}）`)
    },
    /** 显示/隐藏加载遮罩（元素由弹窗内容区创建，随弹窗缓存复用） */
    setPreviewLoadingVisible (this: HomeVideoPreviewContext, visible: boolean): void {
        // 类名从模板模块导入（别写字面量：改过名字后这里若没跟着改，遮罩就永远揭不开）
        this._previewLoadingEl?.classList.toggle(LOADING_OVERLAY_HIDDEN_CLASS, !visible)
    },
    /**
     * 注入"只留视频元素"的样式（幂等）。内容是模板注册表里的 `homePreviewPlayerCss`（可热更）：
     * 去掉压在画面上的顶部标题/关注/提示条，并兜底隐藏播放器以外的整页内容。
     */
    applyPreviewPlayerStyle (this: HomeVideoPreviewContext, doc: Document): void {
        if (!doc.head || doc.getElementById(PREVIEW_STYLE_ID)) return
        const style = doc.createElement('style')
        style.id = PREVIEW_STYLE_ID
        style.textContent = getTemplates.homePreviewPlayerCss
        doc.head.appendChild(style)
    },
    /** 播放器是否已经铺满 iframe（网页全屏的几何判据，不依赖 B 站的态类名） */
    isPlayerFilled (this: HomeVideoPreviewContext, doc: Document, player?: Element | null): boolean {
        const playerSelector = elementSelectors.CSS('player')
        const el = player || (playerSelector ? doc.querySelector(playerSelector) : null)
        const view = doc.defaultView
        if (!el || !view) return false
        const rect = el.getBoundingClientRect()
        return rect.width >= view.innerWidth - 2 && rect.height >= view.innerHeight - 2
    },
    /**
     * 让播放器进入 **B 站自己的「网页全屏」**：这是本功能的关键一步 ——
     * 视频播放页整页塞进弹窗后，只有网页全屏（B 站自己的模式）能让播放器正好铺满 iframe，
     * 并且完全保留它自己的控制条与原生行为；我们因此不需要自己造音量/单击暂停等任何控件，
     * 也不需要用 CSS 去钉版面（钉版面会触发它的迷你播放器逻辑，反而把点击吃掉）。
     *
     * 控制条是**悬停后才渲染**的，所以先合成一次鼠标进入，再轮询「网页全屏」按钮；进不去也不影响播放
     * （用户可自己点那个按钮），只是画面尺寸会退回播放页默认版式。
     */
    async enterPlayerWebFullscreen (this: HomeVideoPreviewContext, doc: Document): Promise<boolean> {
        const buttonSelector = elementSelectors.CSS('playerWebFullscreenButton')
        const playerSelector = elementSelectors.CSS('player')
        const player = playerSelector ? doc.querySelector(playerSelector) : null
        if (!buttonSelector || !player) return false
        // ⚠️ 已经在网页全屏就**别再点**：那个按钮是开关，复用缓存弹窗重开同一视频时会把它关掉
        // （而注入的 CSS 又把该按钮藏了，用户没法再点回来）
        if (this.isPlayerFilled(doc, player)) {
            logger.debug('首页视频预览丨已在网页全屏，无需再次进入')
            return true
        }
        player.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
        const deadline = Date.now() + WEB_FULLSCREEN_BUTTON_TIMEOUT_MS
        let button: HTMLElement | null = null
        while (Date.now() < deadline && !button) {
            button = doc.querySelector(buttonSelector) as HTMLElement | null
            if (!button) {
                player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
                await sleep(200)
            }
        }
        if (!button) {
            logger.warn('首页视频预览丨未等到播放器「网页全屏」按钮，保持播放页默认版式')
            return false
        }
        button.click()
        await sleep(400)
        // 用几何验证是否真的铺满了（不依赖 B 站的态类名）
        if (this.isPlayerFilled(doc, player)) {
            logger.debug('首页视频预览丨播放器已进入网页全屏')
            return true
        }
        logger.warn('首页视频预览丨播放器网页全屏未生效，保持播放页默认版式')
        return false
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
     * - 播放页已就绪：直接 `pause()`（保留已加载页面，下次打开接着看）；
     * - **还在加载中**：暂停旧文档没有意义（新页面加载完会自己播起来），直接卸载成 `about:blank`；
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
        const video = previewVideoElement(frame)
        if (video) {
            if (!video.paused) this._previewPausedByHide = true
            video.pause()
            logger.debug('首页视频预览丨弹窗已关闭，已暂停播放')
            return
        }
        frame.src = 'about:blank'
        logger.debug('首页视频预览丨弹窗已关闭，已卸载跨源播放器')
    },
    /**
     * 「关了就必须静音」兜底监听：iframe 里**任何来源**的播放（B 站播放器自己恢复、我们漏掉的关闭事件、
     * 再次 hover 触发等），只要此刻弹窗没开着，就立刻暂停。
     *
     * 与 `toggle` 那次暂停构成双保险：`toggle` 负责"关闭动作发生时"主动暂停（常态路径），
     * 这里保证的是"只要弹窗没开着就不能有声音"这个**不变量** —— 用户报过"关了还在后台响"，
     * 只靠事件在异常路径（事件没到、播放器自己又播起来）下会漏。
     * 同源播放页可直达其文档；跨源兜底播放器读不到文档，仍由 pausePreviewPlayback 卸载 iframe。
     */
    guardPreviewPlaybackWhileHidden (this: HomeVideoPreviewContext): void {
        const frame = this._previewFrame
        if (!frame) return
        const bind = (): void => {
            const doc = frame.contentDocument
            if (!doc || doc === this._previewPlayGuardDoc) return
            this._previewPlayGuardDoc = doc
            doc.addEventListener('play', (event: Event) => {
                if (this.isPreviewDialogOpen()) return
                const media = event.target as HTMLMediaElement | null
                if (!media || typeof media.pause !== 'function') return
                this._previewPausedByHide = true
                media.pause()
                logger.debug('首页视频预览丨弹窗未开启，已拦下后台播放')
            }, true)
        }
        // iframe 每次导航都会换文档，故 load 后重挂一次（同一文档重复挂由上面的文档比对挡住）
        if (!this._previewPlayGuardLoadBound) {
            this._previewPlayGuardLoadBound = true
            frame.addEventListener('load', bind)
        }
        bind()
    },
    /** 重新打开同一视频时，如果上次是"因为关闭而暂停"、且弹窗确实开着，就接着播 */
    resumePreviewPlaybackIfPausedByHide (this: HomeVideoPreviewContext): void {
        if (!this._previewPausedByHide) return
        this._previewPausedByHide = false
        if (!this.isPreviewDialogOpen()) return
        const video = previewVideoElement(this._previewFrame)
        if (!video) return
        void video.play().catch(() => { /* 自动播放被拦时保持暂停，用户点播放即可 */ })
    },
    destroyVideoPreview (this: HomeVideoPreviewContext): void {
        this._previewDialog?.destroy()
        this._previewDialog = null
        this._previewFrame = null
        this._previewLoadingEl = null
        this._previewObserver?.disconnect()
        this._previewObserver = null
        logger.debug('首页视频预览丨已销毁')
    }
}
