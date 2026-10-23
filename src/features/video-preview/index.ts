import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { buildUpSpaceUrl } from '@/shared/templates/video/up-space'
import { biliApis } from '@/shared/bili-apis'
import { LOADING_OVERLAY_HIDDEN_CLASS } from '@/shared/templates/loading'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import type { AdjustmentDialogInstance } from '@/components/popover-dialog'
import { createElementAndInsert, insertStyleToDocument, sleep } from '@/utils/common'
import { PREVIEW_FRAME_ATTR, isInsidePreviewFrame } from '@/utils/preview-frame'
import { videoPreviewStyles } from '@/shared/styles/video-preview'
import {
    buildPreviewUrl,
    extractPreviewBvid,
    normalizePreviewTitle,
    PREVIEW_BUTTON_CLASS,
    PREVIEW_COVER_CLASS
} from './video-preview-pure'
const logger = new LoggerService('VideoPreview')
/**
 * 视频卡片预览（**跨页特性**：所有页型上的视频卡片都能预览）
 *
 * 背景（2026-09-24 用户需求）：首页只想"瞄一眼"某个视频时，现在只能靠鼠标悬停的 B 站内联预览 ——
 * 画面只有卡片那么大、**没有声音**、**不能拖进度**。本功能在卡片封面左上角加一个预览按钮，
 * 点击后在弹窗里真正播放。
 *
 * 2026-10-24 起从「首页模块专属」提升为**全局特性**：卡片识别不再依赖首页专属类名，
 * 而是「视频链接 → 封面容器」通用推导（首页 / 动态 / 空间 / 稍后再看…都能用）。
 * 相应地它不再挂在 home 模块上，而是由 main.ts 按开关**懒加载**（关闭时连代码都不进浏览器）。
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
/** 预览功能自身的样式块 id（**按开关注入**：功能关闭时页面上一点样式都不留） */
const PREVIEW_STYLE_BLOCK_ID = 'VideoPreviewStyle'
/**
 * 增量注入的合并窗口（毫秒）
 *
 * 性能关键：B 站页面每秒能产生几十~上百次 DOM 变更（评论区尤其夸张）。
 * 观察者回调里**只收集新增节点**，真正的扫描合并到 100ms 一次，
 * 且只扫「新增的那棵子树」——不是全文档（老实现每次都全文档 querySelectorAll，是掉帧主因）。
 */
const INJECT_FLUSH_DELAY_MS = 100
/** 预览功能的状态（模块级单例：跨页存在，不随页面模块卸载而销毁） */
interface PreviewState {
    /** 功能是否处于开启状态 */
    enabled: boolean
    dialog: AdjustmentDialogInstance | null
    frame: HTMLIFrameElement | null
    /** 加载遮罩（盖在 iframe 上，铺满后才揭开） */
    loadingEl: HTMLElement | null
    /** 当前预览视频的 UP 主 mid（按 bvid 取一次后缓存，供「进入UP主空间」用） */
    ownerMid: string | number | null
    observer: MutationObserver | null
    /** 点击事件是否已委托到 document（只挂一次） */
    clickBound: boolean
    bvid: string
    usingFallback: boolean
    /** 关闭弹窗时是否已绑定"停止播放"监听（只绑一次） */
    hideBound: boolean
    /** 是否是"因为关闭弹窗而暂停"（用于下次打开同一视频时接着播） */
    pausedByHide: boolean
    /** 是否正在等待同源播放页就绪（加载中关弹窗只能卸载 iframe，暂停旧文档没用） */
    loading: boolean
    /** 已挂过「关闭后禁播」监听的 frame 文档（iframe 每次导航都换文档，故按文档比对避免重复挂） */
    playGuardDoc: Document | null
    /** 「关闭后禁播」的 load 监听是否已挂（只挂一次，避免重复开弹窗累积监听） */
    playGuardLoadBound: boolean
    /** 待处理的「新增节点」队列（增量扫描用） */
    pendingRoots: Set<Element>
    /** 合并窗口的定时器 */
    flushTimer: ReturnType<typeof setTimeout> | null
    /** 已处理过的封面容器（幂等：同一封面不重复注入） */
    processedCovers: WeakSet<Element>
}
const state: PreviewState = {
    enabled: false,
    dialog: null,
    frame: null,
    loadingEl: null,
    ownerMid: null,
    observer: null,
    clickBound: false,
    bvid: '',
    usingFallback: false,
    hideBound: false,
    pausedByHide: false,
    loading: false,
    playGuardDoc: null,
    playGuardLoadBound: false,
    pendingRoots: new Set<Element>(),
    flushTimer: null,
    processedCovers: new WeakSet<Element>()
}
/**
 * 解析封面容器（预览按钮插在它里面）
 *
 * 三条路，按可靠性排序：
 * ① **注册表里的封面类名**：链接**内部**的封面（首页就是这种：`<a class="…__image--link">` 里包着
 *    `.bili-video-card__image--wrap`）或链接**外部**的封面（有的页型是卡片包着链接）；
 * ② **兜底：封面图所在链接的图片父元素** —— 各页卡片结构不同，但「封面图在链接里」是共性。
 *    兜底只在**已知卡片容器**内生效，避免把播放页「相关推荐」这类紧凑列表也塞进按钮。
 */
const resolveCover = (link: Element): HTMLElement | null => {
    const coverSelector = elementSelectors.CSS('videoCardCover')
    if (coverSelector) {
        // 封面在链接内部（首页等）
        const inner = link.querySelector(coverSelector)
        if (inner instanceof HTMLElement) return inner
        // 封面在链接外部（有的页型是卡片包着链接）
        const outer = link.closest(coverSelector)
        if (outer instanceof HTMLElement) return outer
    }
    const containerSelector = elementSelectors.CSS('videoCardContainer')
    if (containerSelector && !link.closest(containerSelector)) return null
    const image = link.querySelector('img')
    const parent = image?.parentElement
    return parent instanceof HTMLElement ? parent : null
}
/** 读卡片标题（取不到用兜底文案） */
const readCardTitle = (cover: HTMLElement): string => {
    const titleSelector = elementSelectors.CSS('videoCardTitle')
    if (!titleSelector) return normalizePreviewTitle('')
    const containerSelector = elementSelectors.CSS('videoCardContainer')
    const card = containerSelector ? cover.closest(containerSelector) : null
    const titleEl = (card ?? cover).querySelector(titleSelector)
    return normalizePreviewTitle(titleEl?.textContent)
}
/**
 * 保证封面是绝对定位的参照系
 *
 * 预览按钮是 `position: absolute`（左上角），需要有定位的祖先。
 * B 站自己的封面容器（首页 `.bili-video-card__image--wrap` 等）本来就是 `relative`；
 * 兜底路径拿到的容器可能是 `static`，这时补一个 `relative` —— 不改变布局，
 * 只会把该容器变成它内部绝对定位元素的参照系（那正是我们要的）。
 */
const ensurePositioned = (el: HTMLElement): void => {
    if (el.style.position) return
    const position = window.getComputedStyle(el).position
    if (position === 'static') el.style.position = 'relative'
}
/** 给封面注入预览按钮（幂等：已有按钮就跳过） */
const injectPreviewButton = (cover: HTMLElement, bvid: string): void => {
    if (cover.querySelector(`.${PREVIEW_BUTTON_CLASS}`)) return
    const button = createElementAndInsert(getTemplates.videoPreviewButton, cover) as HTMLElement | null
    if (!button) return
    button.setAttribute('data-adj-preview-bvid', bvid)
    button.setAttribute('data-adj-preview-title', readCardTitle(cover))
    cover.classList.add(PREVIEW_COVER_CLASS)
    ensurePositioned(cover)
}
/** 处理单个视频链接（取 bvid → 定位封面 → 注入按钮） */
const processLink = (link: Element): void => {
    if (!state.enabled) return
    const bvid = extractPreviewBvid(link.getAttribute('href'))
    if (!bvid) return
    const cover = resolveCover(link)
    if (!cover) return
    if (state.processedCovers.has(cover)) return
    state.processedCovers.add(cover)
    injectPreviewButton(cover, bvid)
}
/** 全文档扫一遍（初始化时用一次；之后交给观察者增量处理） */
const scanDocument = (): void => {
    const linkSelector = elementSelectors.CSS('videoCardLink')
    if (!linkSelector) return
    document.querySelectorAll(linkSelector).forEach(link => processLink(link))
}
/** 增量扫描：只扫新增的那几棵子树 */
const flushPending = (): void => {
    if (!state.enabled) {
        state.pendingRoots.clear()
        return
    }
    const roots = [...state.pendingRoots]
    state.pendingRoots.clear()
    const linkSelector = elementSelectors.CSS('videoCardLink')
    if (!linkSelector) return
    for (const root of roots) {
        // 节点可能已被移除（列表重渲染）：跳过
        if (!root.isConnected) continue
        if (root.matches(linkSelector)) processLink(root)
        root.querySelectorAll(linkSelector).forEach(link => processLink(link))
    }
}
/** 合并窗口：同一批 DOM 变更只扫一次 */
const scheduleFlush = (): void => {
    if (state.flushTimer) return
    state.flushTimer = setTimeout(() => {
        state.flushTimer = null
        flushPending()
    }, INJECT_FLUSH_DELAY_MS)
}
/** 观察页面新增内容（无限滚动 / 换一换 / SPA 路由都会新增卡片） */
const observeNewCards = (): void => {
    if (state.observer) return
    const observer = new MutationObserver(records => {
        if (!state.enabled) return
        for (const record of records) {
            for (const node of record.addedNodes) {
                // 只收元素节点（文本节点不可能是卡片）
                if (node.nodeType !== 1) continue
                state.pendingRoots.add(node as Element)
            }
        }
        if (state.pendingRoots.size > 0) scheduleFlush()
    })
    // 观察 documentElement（而不是 body）：脚本可能在 body 存在前就跑到
    observer.observe(document.documentElement, { childList: true, subtree: true })
    state.observer = observer
}
/**
 * 预览弹窗里「进入UP主空间」：先取 UP 主 mid（按当前 bvid 缓存一次），
 * 再开新标签页 —— 与播放页那颗按钮同一套逻辑。
 * 打开成功后**不关**预览：看完空间回来还能接着看（旁边那颗「新标签页打开」才是"离开预览"的语义）。
 */
const openUpSpaceFromPreview = async (): Promise<void> => {
    const bvid = state.bvid
    if (!bvid) return
    if (!state.ownerMid) {
        try {
            const info = await biliApis.getVideoInformation('video', bvid) as { owner?: { mid?: string | number }} | null | undefined
            state.ownerMid = info?.owner?.mid ?? null
        } catch (error) {
            logger.warn('视频预览丨取 UP 主 mid 失败', error)
        }
    }
    const mid = state.ownerMid
    if (!mid) {
        logger.warn('视频预览丨未取到 UP 主 mid，无法进入空间')
        return
    }
    // ⚠️ 预览里**一律开新标签页**，不走 `open_author_space_mode` 设置：预览弹窗本身已占着屏幕中间，
    //    再叠一个空间弹窗既别扭（看着像"在预览里打开了空间"），两处内容也互相遮挡
    //    （地址拼接走模板注册表里的公共实现，不依赖播放页模块 —— 两者分属不同 chunk）
    if (!window.open(buildUpSpaceUrl(mid), '_blank')) logger.warn('视频预览丨新标签页被浏览器拦截，未打开 UP 主空间')
}
/** 给弹窗标题栏加我们的自定义控件（「新标签页打开」+「进入UP主空间」两颗图标；关闭按钮由弹窗壳自带） */
const buildHeaderExtra = (): HTMLElement => {
    const wrap = document.createElement('div')
    wrap.className = 'adj-video-preview-header-extra'
    const openButton = createElementAndInsert(getTemplates.videoPreviewOpenButton, wrap) as HTMLElement | null
    openButton?.addEventListener('click', () => {
        const bvid = state.bvid
        if (!bvid) return
        // 被浏览器拦截时 window.open 返回 null：这种情况**不关弹窗**，否则用户白丢正在看的画面
        const opened = window.open(buildPreviewUrl(getTemplates.videoPreviewVideoPageUrl, bvid), '_blank')
        if (opened) state.dialog?.close()
        else logger.warn('视频预览丨新标签页被浏览器拦截，已保留预览弹窗')
    })
    const upSpaceButton = createElementAndInsert(getTemplates.videoPreviewUpSpaceButton, wrap) as HTMLElement | null
    upSpaceButton?.addEventListener('click', () => { void openUpSpaceFromPreview() })
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
/** 播放器是否已经铺满 iframe（网页全屏的几何判据，不依赖 B 站的态类名） */
const isPlayerFilled = (doc: Document, player?: Element | null): boolean => {
    const playerSelector = elementSelectors.CSS('player')
    const el = player || (playerSelector ? doc.querySelector(playerSelector) : null)
    const view = doc.defaultView
    if (!el || !view) return false
    const rect = el.getBoundingClientRect()
    return rect.width >= view.innerWidth - 2 && rect.height >= view.innerHeight - 2
}
/**
 * 让播放器进入 **B 站自己的「网页全屏」**：这是本功能的关键一步 ——
 * 视频播放页整页塞进弹窗后，只有网页全屏（B 站自己的模式）能让播放器正好铺满 iframe，
 * 并且完全保留它自己的控制条与原生行为；我们因此不需要自己造音量/单击暂停等任何控件，
 * 也不需要用 CSS 去钉版面（钉版面会触发它的迷你播放器逻辑，反而把点击吃掉）。
 *
 * 控制条是**悬停后才渲染**的，所以先合成一次鼠标进入，再轮询「网页全屏」按钮；进不去也不影响播放
 * （用户可自己点那个按钮），只是画面尺寸会退回播放页默认版式。
 */
const enterPlayerWebFullscreen = async (doc: Document): Promise<boolean> => {
    const buttonSelector = elementSelectors.CSS('playerWebFullscreenButton')
    const playerSelector = elementSelectors.CSS('player')
    const player = playerSelector ? doc.querySelector(playerSelector) : null
    if (!buttonSelector || !player) return false
    // ⚠️ 已经在网页全屏就**别再点**：那个按钮是开关，复用缓存弹窗重开同一视频时会把它关掉
    // （而注入的 CSS 又把该按钮藏了，用户没法再点回来）
    if (isPlayerFilled(doc, player)) {
        logger.debug('视频预览丨已在网页全屏，无需再次进入')
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
        logger.warn('视频预览丨未等到播放器「网页全屏」按钮，保持播放页默认版式')
        return false
    }
    button.click()
    await sleep(400)
    // 用几何验证是否真的铺满了（不依赖 B 站的态类名）
    if (isPlayerFilled(doc, player)) {
        logger.debug('视频预览丨播放器已进入网页全屏')
        return true
    }
    logger.warn('视频预览丨播放器网页全屏未生效，保持播放页默认版式')
    return false
}
/**
 * 注入"只留视频元素"的样式（幂等）。内容是模板注册表里的 `homePreviewPlayerCss`（可热更）：
 * 去掉压在画面上的顶部标题/关注/提示条，并兜底隐藏播放器以外的整页内容。
 */
const applyPreviewPlayerStyle = (doc: Document): void => {
    if (!doc.head || doc.getElementById(PREVIEW_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = PREVIEW_STYLE_ID
    style.textContent = getTemplates.videoPreviewPlayerCss
    doc.head.appendChild(style)
}
/** 显示/隐藏加载遮罩（元素由弹窗内容区创建，随弹窗缓存复用） */
const setPreviewLoadingVisible = (visible: boolean): void => {
    // 类名从模板模块导入（别写字面量：改过名字后这里若没跟着改，遮罩就永远揭不开）
    state.loadingEl?.classList.toggle(LOADING_OVERLAY_HIDDEN_CLASS, !visible)
}
/** 预览弹窗当前是否处于打开状态 */
const isPreviewDialogOpen = (): boolean => !!state.dialog?.root?.matches(':popover-open')
/**
 * 关闭弹窗时停止播放。
 *
 * 弹窗按 keepAlive 缓存复用，关闭只是隐藏 —— 不处理的话 iframe 里的播放器会继续播、用户关了还听得见声音。
 * 三种情况分别处理：
 * - 播放页已就绪：直接 `pause()`（保留已加载页面，下次打开接着看）；
 * - **还在加载中**：暂停旧文档没有意义（新页面加载完会自己播起来），直接卸载成 `about:blank`；
 * - 兜底的官方外链播放器（跨源，父页面碰不到它内部）：同样卸载 iframe 来立刻静音。
 */
const pausePreviewPlayback = (): void => {
    const frame = state.frame
    if (!frame) return
    state.pausedByHide = false
    if (state.loading) {
        frame.src = 'about:blank'
        logger.debug('视频预览丨加载期间关闭弹窗，已卸载播放器')
        return
    }
    const video = previewVideoElement(frame)
    if (video) {
        if (!video.paused) state.pausedByHide = true
        video.pause()
        logger.debug('视频预览丨弹窗已关闭，已暂停播放')
        return
    }
    frame.src = 'about:blank'
    logger.debug('视频预览丨弹窗已关闭，已卸载跨源播放器')
}
/**
 * 「关了就必须静音」兜底监听：iframe 里**任何来源**的播放（B 站播放器自己恢复、我们漏掉的关闭事件、
 * 再次 hover 触发等），只要此刻弹窗没开着，就立刻暂停。
 *
 * 与 `toggle` 那次暂停构成双保险：`toggle` 负责"关闭动作发生时"主动暂停（常态路径），
 * 这里保证的是"只要弹窗没开着就不能有声音"这个**不变量** —— 用户报过"关了还在后台响"，
 * 只靠事件在异常路径（事件没到、播放器自己又播起来）下会漏。
 * 同源播放页可直达其文档；跨源兜底播放器读不到文档，仍由 pausePreviewPlayback 卸载 iframe。
 */
const guardPreviewPlaybackWhileHidden = (): void => {
    const frame = state.frame
    if (!frame) return
    const bind = (): void => {
        const doc = frame.contentDocument
        if (!doc || doc === state.playGuardDoc) return
        state.playGuardDoc = doc
        doc.addEventListener('play', (event: Event) => {
            if (isPreviewDialogOpen()) return
            const media = event.target as HTMLMediaElement | null
            if (!media || typeof media.pause !== 'function') return
            state.pausedByHide = true
            media.pause()
            logger.debug('视频预览丨弹窗未开启，已拦下后台播放')
        }, true)
    }
    // iframe 每次导航都会换文档，故 load 后重挂一次（同一文档重复挂由上面的文档比对挡住）
    if (!state.playGuardLoadBound) {
        state.playGuardLoadBound = true
        frame.addEventListener('load', bind)
    }
    bind()
}
/** 重新打开同一视频时，如果上次是"因为关闭而暂停"、且弹窗确实开着，就接着播 */
const resumePreviewPlaybackIfPausedByHide = (): void => {
    if (!state.pausedByHide) return
    state.pausedByHide = false
    if (!isPreviewDialogOpen()) return
    const video = previewVideoElement(state.frame)
    if (!video) return
    void video.play().catch(() => { /* 自动播放被拦时保持暂停，用户点播放即可 */ })
}
/** 打开预览弹窗并播放指定视频 */
const openVideoPreview = async (bvid: string, title: string): Promise<void> => {
    if (!bvid) return
    state.bvid = bvid
    state.usingFallback = false
    const dialog = openAdjustmentDialog({
        key: 'home-video-preview',
        keepAliveMs: PREVIEW_KEEP_ALIVE_MS,
        title,
        width: PREVIEW_DIALOG_WIDTH,
        className: 'adj-video-preview-dialog',
        headerExtra: buildHeaderExtra(),
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
            state.frame = frame
            // 「关了就必须静音」的兜底监听（不依赖关闭事件，见方法注释）
            guardPreviewPlaybackWhileHidden()
            // 遮罩放在 iframe 之后（同层叠靠后 → 盖在上面），铺满后揭开
            state.loadingEl = createElementAndInsert(getTemplates.loadingOverlay, body) as HTMLElement | null
            const loadingTextField = queryTemplateTextField(state.loadingEl)
            if (loadingTextField) loadingTextField.textContent = '视频加载中'
        }
    })
    state.dialog = dialog
    // ⚠️ 弹窗按 `keepAliveMs` 缓存复用 —— 关闭只是**隐藏**，iframe 与里面的播放器会继续播（用户能听见声音）。
    // 弹窗壳的 `onClosed` 只在真正销毁时触发，所以这里直接听 popover 的 toggle：关闭即停止播放。
    if (!state.hideBound) {
        state.hideBound = true
        dialog.root.addEventListener('toggle', (event: Event) => {
            if ((event as ToggleEvent).newState !== 'closed') return
            pausePreviewPlayback()
        })
    }
    // 复用已存在的弹窗时，标题与「新标签页打开」的目标要跟着换（同 key 单例不会重建 DOM）
    const titleEl = dialog.header.querySelector('.adjustment-dialog-title')
    if (titleEl) titleEl.textContent = title
    dialog.root.setAttribute('aria-label', title || '视频预览')
    // 视频区（body）要落在页面垂直中心：弹窗整体上移 header 高度的一半（标题长度会改 header 高度，故每次量）
    const headerHalf = Math.round(dialog.header.getBoundingClientRect().height / 2)
    if (headerHalf > 0) dialog.root.style.setProperty('--adj-preview-header-half', `${headerHalf}px`)
    const frame = state.frame
    if (!frame) return
    const primaryUrl = buildPreviewUrl(getTemplates.videoPreviewPlayerUrl, bvid)
    const fallbackUrl = buildPreviewUrl(getTemplates.videoPreviewPlayerUrlFallback, bvid)
    // 已是同一地址（缓存复用）就不要重设 src：给 iframe.src 赋相同值也会触发重新加载，
    // 白白丢掉已缓冲的进度（UP主空间弹窗同款处理）
    if (frame.getAttribute('src') !== primaryUrl) {
        // 真要重新加载才盖遮罩：复用同一个已就绪的播放器时不必闪一下"视频加载中"
        setPreviewLoadingVisible(true)
        frame.src = primaryUrl
        state.pausedByHide = false
    }
    state.loading = true
    const ready = await waitForSameOriginPlayer(frame, bvid)
    state.loading = false
    // 等待期间用户把弹窗关了：别再恢复播放，也别继续加载（否则页面加载完自己就播起来、关了还在响）
    if (!isPreviewDialogOpen()) {
        frame.src = 'about:blank'
        logger.debug('视频预览丨加载期间弹窗已被关闭，已卸载播放器')
        return
    }
    if (ready) {
        const doc = frame.contentDocument
        if (doc) {
            await enterPlayerWebFullscreen(doc)
            // 铺满之后再注入"只留视频"的样式：放在进入之前会改变页面版式，干扰它自己进入网页全屏
            applyPreviewPlayerStyle(doc)
        }
        // 铺满了（或尝试失败）才揭开遮罩：失败时也揭开，否则用户会永远停在"视频加载中"，
        // 而这时播放器其实是可以用的（只是尺寸退回播放页默认版式）
        setPreviewLoadingVisible(false)
        resumePreviewPlaybackIfPausedByHide()
        logger.debug(`视频预览丨播放页已就绪（${bvid}）`)
        return
    }
    // 兜底：官方外链播放器（跨源，改不了它的内部样式，标题交给它自带的浮层显示）
    if (!isPreviewDialogOpen()) {
        frame.src = 'about:blank'
        return
    }
    state.usingFallback = true
    frame.src = fallbackUrl
    // 兜底播放器内部碰不到，加载状态无从判断，直接揭开遮罩
    setPreviewLoadingVisible(false)
    if (titleEl) titleEl.textContent = ''
    dialog.root.setAttribute('aria-label', '视频预览')
    logger.warn(`视频预览丨播放页不可用，已回退官方外链播放器（${bvid}）`)
}
/** 事件委托：只在 document 上挂一次，动态新增的卡片按钮同样生效 */
const bindClick = (): void => {
    if (state.clickBound) return
    state.clickBound = true
    document.addEventListener('click', event => {
        if (!state.enabled) return
        const target = event.target as Element | null
        const button = target?.closest(`.${PREVIEW_BUTTON_CLASS}`)
        if (!button) return
        // 卡片外层是 <a>：必须拦住默认跳转，否则点预览会跳进视频页
        event.preventDefault()
        event.stopPropagation()
        const bvid = button.getAttribute('data-adj-preview-bvid')
        if (!bvid) return
        // 顺手暂停卡片自带的 hover 内联预览，避免两个播放器一起响
        const cover = button.parentElement
        const inlineSelector = elementSelectors.CSS('videoCardInlineVideo')
        const inlineVideo = inlineSelector ? cover?.querySelector(inlineSelector) as HTMLVideoElement | null : null
        inlineVideo?.pause()
        void openVideoPreview(bvid, button.getAttribute('data-adj-preview-title') || '')
    }, true)
}
/**
 * 开启预览功能（幂等）
 *
 * 由 main.ts 在读到开关为「开」时调用（**懒加载**：关闭时这段代码根本不进浏览器）。
 */
export const initVideoPreviewFeature = (): void => {
    if (state.enabled) return
    // 预览 iframe 里的播放页**不介入**：那里只是播放器宿主，
    // 再给它的卡片注入预览按钮纯属自找麻烦（还会和弹窗抢焦点）
    if (isInsidePreviewFrame()) {
        logger.debug('视频预览丨预览窗口内不启用')
        return
    }
    state.enabled = true
    insertStyleToDocument({ [PREVIEW_STYLE_BLOCK_ID]: videoPreviewStyles.VideoPreview })
    scanDocument()
    observeNewCards()
    bindClick()
    logger.debug('视频预览丨已初始化')
}
/**
 * 关闭预览功能（幂等）：销毁弹窗、停观察者、清掉已注入的按钮与样式
 */
export const destroyVideoPreviewFeature = (): void => {
    if (!state.enabled) return
    state.enabled = false
    state.observer?.disconnect()
    state.observer = null
    if (state.flushTimer) {
        clearTimeout(state.flushTimer)
        state.flushTimer = null
    }
    state.pendingRoots.clear()
    // 已处理过的封面要**清空**：按钮被移除后若直接重新开启，靠这张表跳过旧封面会导致不再注入
    state.processedCovers = new WeakSet<Element>()
    state.dialog?.destroy()
    state.dialog = null
    state.frame = null
    state.loadingEl = null
    document.querySelectorAll(`.${PREVIEW_BUTTON_CLASS}`).forEach(el => el.remove())
    document.querySelectorAll(`.${PREVIEW_COVER_CLASS}`).forEach(el => el.classList.remove(PREVIEW_COVER_CLASS))
    insertStyleToDocument({ [PREVIEW_STYLE_BLOCK_ID]: '' })
    logger.debug('视频预览丨已销毁')
}
