import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { baseStyles } from '@/shared/styles/base'
import { videoStyles } from '@/shared/styles/video-page'
import { biliApis } from '@/shared/bili-apis'
import { STORAGE_KEYS } from '@/shared/constants'
import { getTemplates } from '@/shared/templates'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { sleep, createElementAndInsert, addEventListenerToElement, insertStyleToDocument, documentScrollTo, getElementOffsetToDocument, sanitizeHttpUrl } from '@/utils/common'
import type { InsertionMethod } from '@/utils/common'
import { normalizeUpOwner, resolveAvatarSize, resolveAvatarTip } from './up-avatar-pure'
import type { UpOwnerInfo } from './up-avatar-pure'
const logger = new LoggerService('VideoModule')
/** 注入按钮的补全项：模板只描述结构，这些运行时值一律用 DOM API 补（不往 HTML 里拼字符串） */
interface InjectedButtonOptions {
    /** 追加的类名（空格分隔） */
    className?: string
    /** 内联样式（CSS 文本，不含 `style=` 前缀） */
    style?: string
    /** B 站作用域样式属性名（如 `data-v-xxxx`，从同级真实元素上抄来才能命中它的 scoped 样式） */
    dataV?: string
    /** 按钮文字（追加在图标之后；模板里没有文字节点） */
    text?: string
}
/**
 * 建并插入注入按钮：类名/内联样式/作用域属性/文字都由这里补
 * @param key 模板键（templates 注册表）
 * @param target 插入目标
 * @param method 插入方式
 * @param options 需要补的运行时值
 */
const insertInjectedButton = (key: string, target: Node, method: InsertionMethod, options: InjectedButtonOptions = {}): HTMLElement | null => {
    // 模板键是字符串（调用方传入）：按"字符串键表"索引，仅类型层收窄
    const template = (getTemplates as Record<string, string>)[key]
    if (!template) return null
    if (!target || typeof (target as Node).nodeType !== 'number') {
        logger.warn(`侧边栏工具丨插入 ${key} 失败：目标节点无效（${String(target)}）`)
        return null
    }
    let element: HTMLElement | null = null
    try {
        element = createElementAndInsert(template, target, method) as HTMLElement | null
    } catch (error) {
        logger.warn(`侧边栏工具丨插入 ${key} 抛错：${error instanceof Error ? error.message : String(error)}`)
        return null
    }
    if (!element) {
        logger.warn(`侧边栏工具丨插入 ${key} 返回空（target=${(target as Element).nodeName ?? '?'}）`)
        return null
    }
    if (options.className) element.classList.add(...options.className.split(/\s+/).filter(Boolean))
    if (options.style) element.setAttribute('style', options.style)
    if (options.dataV) element.setAttribute(options.dataV, '')
    if (options.text) element.insertAdjacentText('beforeend', options.text)
    return element
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UiButtonsContext {
    userConfigs: Record<string, unknown>
    /** 自身方法（有界重试会再次调用它；上下文由模块实例提供，运行时一定存在） */
    insertSideFloatNavToolsButtons: () => Promise<void>
    settingsComponent: { openSettings: () => Promise<void> }
    _cachedMid?: string | number
    locateToPlayer: () => Promise<void>
    /** 选集切换后的定位（等切换+布局稳定后一次性直达，见 player-mode） */
    locateToPlayerAfterEpisodeSwitch: () => Promise<void>
    locateButtonClick: () => Promise<void>
    openUpSpace: (mid: string | number) => Promise<void> | void
    showSkipSegmentManager: (id: string) => Promise<void>
    /** 刷新侧栏「UP主空间」头像（切视频后作者会变） */
    refreshUpAvatar: () => Promise<void>
    /** 点头像进 UP 主空间（mid 取自按钮上记录的作者） */
    openUpSpaceByAvatar: (button: HTMLElement | null) => void
    /** 打开「鱼塘」弹窗（大肥鱼识别结果） */
    openFishPond: () => void
    /** 「鱼塘」按钮按需显示（仅在本页命中大肥鱼评论时出现） */
    syncFishPondButton: (visible: boolean) => void
}
/** 侧栏「UP主空间」按钮（作者头像）的类名 —— 脚本自己的 DOM */
const UP_AVATAR_SELECTOR = '.bili-adjustment-icon.up'
/**
 * 读 sessionStorage 里 B 站写的当前视频信息（取 UP 主 mid/昵称/头像，零网络开销）
 *
 * B 站播放器会把当前视频的完整信息写进 `bilibili_video_info`，其中 `owner` 就是 UP 主信息。
 */
const readSessionOwner = (): UpOwnerInfo => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION_VIDEO_INFO)
        if (!raw) return {}
        const info = JSON.parse(raw) as { owner?: unknown }
        return normalizeUpOwner(info?.owner)
    } catch {
        return {}
    }
}
/**
 * 把 UP 主信息刷到头像按钮上
 *
 * 头像/昵称都是**运行时值**（每个视频的作者不同），故一律用 DOM API 填，不拼 HTML：
 * - 图片地址来自接口，必须过 `sanitizeHttpUrl`（只放行 http/https，防 `javascript:` 之类）
 * - 昵称写进模板的文本钩子（`data-adj-field="text"`），同时更新无障碍标签
 */
const applyUpOwner = (button: HTMLElement, owner: UpOwnerInfo): void => {
    const name = owner.name ?? ''
    const tip = queryTemplateTextField(button)
    if (tip) tip.textContent = resolveAvatarTip(name)
    button.setAttribute('aria-label', name ? `UP主空间：${name}` : 'UP主空间')
    if (owner.mid) button.setAttribute('data-adj-up-mid', String(owner.mid))
    const image = button.querySelector('img') as HTMLImageElement | null
    const face = sanitizeHttpUrl(owner.face)
    if (image) {
        if (face) {
            image.src = face
            image.hidden = false
            button.classList.add('adj-sidenav-up-avatar-has-image')
        } else {
            image.hidden = true
            image.removeAttribute('src')
            button.classList.remove('adj-sidenav-up-avatar-has-image')
        }
    }
}
/**
 * 量出侧栏按钮的宽度，让头像与**当前那颗按钮**等宽
 *
 * 不写死数值：侧栏按钮的盒子由 B 站的样式决定（同一套类名 → 同一个盒子），
 * 量一次实际渲染宽度即可，改版后也不会跑偏。
 * 量之前按钮里只有那颗图标（与旧按钮的内容完全一致），量出来的就是旧按钮的宽度。
 */
const measureAvatarSize = (button: HTMLElement): number => {
    const width = button.getBoundingClientRect().width
    return resolveAvatarSize(width)
}
/**
 * 侧栏按钮插入的有界重试（2026-10-31）
 *
 * 触发场景：功能在 canplaythrough 就派发，而 B 站的 `.fixed-sidenav-storage` 往往要等
 * 播放器交互层渲染完才出现；一次性跳过会让侧栏功能整页缺失。这里每 700ms 重试一次，
 * 最多 12 次（约 8.4s），超过则放弃并只留一条 warn，避免无限轮询。
 */
let floatNavRetryTimer: ReturnType<typeof setTimeout> | null = null
let floatNavRetryCount = 0
const FLOAT_NAV_RETRY_INTERVAL_MS = 700
const FLOAT_NAV_RETRY_MAX = 12
const cancelFloatNavInsertRetry = (): void => {
    if (floatNavRetryTimer) {
        clearTimeout(floatNavRetryTimer)
        floatNavRetryTimer = null
    }
    floatNavRetryCount = 0
}
/**
 * 侧栏按钮「被 B 站重渲染抹掉」的看护（2026-10-31）
 *
 * 实测：`.fixed-sidenav-storage` 的 children 会被 React 整段替换（水合完成、宽屏切换各一次），
 * 我们插入的按钮随之消失，之后再也没人补回去 —— 用户看到的就是「侧边栏按钮没插入/功能不执行」。
 * 这里挂一个 childList 观察器：只要导航栏重新出现且里面没有我们的定位按钮，就补插一次。
 * 用计数上限自我限制，避免插入失败时无限重试。
 */
let floatNavObserver: MutationObserver | null = null
let floatNavReinsertCount = 0
let floatNavReinsertTimer: ReturnType<typeof setTimeout> | null = null
const FLOAT_NAV_REINSERT_MAX = 20
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stopFloatNavWatch = (): void => {
    floatNavObserver?.disconnect()
    floatNavObserver = null
    if (floatNavReinsertTimer) {
        clearTimeout(floatNavReinsertTimer)
        floatNavReinsertTimer = null
    }
}
const startFloatNavWatch = (ctx: UiButtonsContext): void => {
    if (floatNavObserver || typeof MutationObserver === 'undefined') return
    // 关键：B 站侧栏是 React 管理的列表，任何在其重渲染期间的子节点都会被整段替换掉
    // （实测：插进 `.fixed-sidenav-storage` 的节点 500ms 内消失）。所以不在变更当下硬插，
    // 而是等 DOM「安静」一段时间（连续 1200ms 没有 childList 变更）后再补插。
    const scheduleQuietInsert = (): void => {
        if (floatNavReinsertTimer || floatNavReinsertCount >= FLOAT_NAV_REINSERT_MAX) return
        if (floatNavReinsertTimer) clearTimeout(floatNavReinsertTimer)
        floatNavReinsertTimer = setTimeout(() => {
            floatNavReinsertTimer = null
            const nav = elementSelectors.get('videoFloatNav') as HTMLElement | null
            if (!nav || nav.querySelector('.bili-adjustment-icon.locate')) return
            floatNavReinsertCount += 1
            logger.debug(`侧边栏工具丨页面已稳定，补插第 ${floatNavReinsertCount} 次`)
            void ctx.insertSideFloatNavToolsButtons()
        }, 1200)
    }
    floatNavObserver = new MutationObserver(scheduleQuietInsert)
    if (document.body) floatNavObserver.observe(document.body, { childList: true, subtree: true })
    scheduleQuietInsert()
}
const scheduleFloatNavInsertRetry = (ctx: UiButtonsContext): void => {
    if (floatNavRetryTimer) return
    if (floatNavRetryCount >= FLOAT_NAV_RETRY_MAX) {
        logger.warn(`侧边栏工具丨重试 ${FLOAT_NAV_RETRY_MAX} 次仍未找到浮动导航栏，放弃插入`)
        return
    }
    floatNavRetryCount += 1
    floatNavRetryTimer = setTimeout(() => {
        floatNavRetryTimer = null
        void ctx.insertSideFloatNavToolsButtons()
    }, FLOAT_NAV_RETRY_INTERVAL_MS)
}
export const uiButtonsFeatures = {
    /**
     * 定位按钮点击：新页面迷你播放器按钮隐藏不可用，开启小窗会触发 B站 滚动推荐列表并搅动布局，
     * 干扰定位执行；仅旧页面（按钮可见）保留"临时开窗定位后再关闭"逻辑
     */
    async locateButtonClick (this: UiButtonsContext): Promise<void> {
        const miniOpenBtn = elementSelectors.get('miniPlayerOpen') as HTMLElement | null
        const miniCloseBtn = elementSelectors.get('miniPlayerClose')
        // 时序用 Promise 链表达（而非连续 await）：TS 6.0.3 在本文件里会把「await 相邻行」误判为不可调用
        const wait = (ms: number): Promise<void> => sleep(ms)
        const locate = (): Promise<void> => this.locateToPlayer()
        if (!miniOpenBtn || miniCloseBtn || getComputedStyle(miniOpenBtn).display === 'none') {
            return wait(100).then(locate)
        }
        // 小窗关闭时临时开启，定位后再关闭
        miniOpenBtn.click()
        return wait(50)
            .then(locate)
            .then(() => wait(50))
            // 使用固定选择器关闭小窗（不依赖 B 站的 title 状态切换）
            .then(() => {
                const closeBtn = elementSelectors.get('miniPlayer') as HTMLElement | null
                closeBtn?.click()
            })
    },
    async insertSideFloatNavToolsButtons (this: UiButtonsContext): Promise<void> {
        const floatNav = this.userConfigs.page_type === 'video' ? elementSelectors.get('videoFloatNav') : elementSelectors.get('bangumiFloatNav')
        if (!floatNav) {
            // 调度改成三车道后，本功能在 canplaythrough 就派发，此时 B 站侧栏常常还没渲染。
            // 旧实现直接 return，按钮就再也不出现（用户看到的"侧边栏按钮没插入"）。这里做有界重试。
            scheduleFloatNavInsertRetry(this)
            return
        }
        cancelFloatNavInsertRetry()
        startFloatNavWatch(this)
        const dataV = this.userConfigs.page_type === 'video' ? floatNav.lastElementChild?.attributes?.[1]?.name || '' : ''
        // 检查是否已经存在定位按钮和设置按钮
        const existingLocateButton = floatNav.querySelector('.bili-adjustment-icon.locate')
        const existingSettingsButton = floatNav.querySelector('.bili-adjustment-icon.settings')
        const existingUpButton = floatNav.querySelector('.bili-adjustment-icon.up')
        const existingSkipButton = floatNav.querySelector('.bili-adjustment-icon.skip')
        const existingFishPondButton = floatNav.querySelector('.bili-adjustment-icon.fishpond')
        // 「鱼塘」按钮是**按需出现**的：只有扫描真的命中大肥鱼评论才插入（见 syncFishPondButton），
        // 所以这里只在功能被关掉时清残留，且不把它当作「已插齐」的判据
        if (!this.userConfigs.catch_fish && existingFishPondButton) {
            existingFishPondButton.remove()
            logger.debug('侧边栏工具丨捞鱼已关闭，移除「鱼塘」按钮')
        }
        if (existingLocateButton && existingSettingsButton && existingUpButton && existingSkipButton) {
            logger.debug('侧边栏工具丨已存在，跳过插入')
            return
        }
        let locateButton: HTMLElement | null = null
        let videoSettingsOpenButton: HTMLElement | null = null
        let upButton: HTMLElement | null = null
        if (this.userConfigs.page_type === 'video') {
            if (!existingLocateButton) {
                locateButton = insertInjectedButton('locateButton', floatNav.lastElementChild as Node, 'prepend', {
                    className: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    dataV,
                    text: '定位'
                })
                addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = insertInjectedButton('videoSettingsOpenButton', floatNav.lastElementChild as Node, 'prepend', {
                    dataV,
                    text: '设置'
                })
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            // 插入跳过片段管理按钮（与开关解耦：用于维护手动/共享片段数据，随时可用）
            if (!existingSkipButton) {
                const skipButton = insertInjectedButton('skipSegmentManagerButton', floatNav.lastElementChild as Node, 'prepend', {
                    dataV,
                    text: '片段'
                })
                addEventListenerToElement(skipButton, 'click', async () => {
                    const bvid = biliApis.getCurrentVideoID(window.location.href)
                    if (bvid && bvid !== 'error') {
                        await this.showSkipSegmentManager(bvid)
                    }
                })
            }
            // 「鱼塘」按钮**不在这里插**：只有扫描命中大肥鱼评论时才出现（`syncFishPondButton`），
            // 平时不占位，避免侧栏常年挂一个空入口
            // ⚠️ 「UP主空间」（作者头像）按钮**最后插入**：
            //    侧栏是纵向排列、插入方式又是 prepend（插到最前面），于是**最后插入的反而排在最上面** ——
            //    这样它就是侧栏的第一项（在「片段」按钮上方）。
            if (!existingUpButton) {
                upButton = insertInjectedButton('upButton', floatNav.lastElementChild as Node, 'prepend', { dataV })
                addEventListenerToElement(upButton, 'click', () => { this.openUpSpaceByAvatar(upButton) })
            }
            const avatarButton = (existingUpButton ?? upButton) as HTMLElement | null
            if (avatarButton) {
                // 先量宽度：此刻按钮里只有那颗图标（与旧按钮内容完全一致），量到的就是**旧按钮的宽度**
                avatarButton.style.setProperty('--adj-up-avatar-size', `${measureAvatarSize(avatarButton)}px`)
                avatarButton.classList.add('adj-sidenav-up-avatar-ready')
                // 头像补全要走网络（视频信息接口），不能挡住后面按钮的插入：后台补即可
                void this.refreshUpAvatar()
            }
        }
        if (this.userConfigs.page_type === 'bangumi') {
            if (!existingLocateButton) { locateButton = insertInjectedButton('locateButton', floatNav, 'append', {
                className: 'bili-adjustment-icon locate',
                style: baseStyles.videoSettingsOpenButton,
                text: '定位'
            })
            addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = insertInjectedButton('videoSettingsOpenButton', floatNav, 'append', {
                    style: baseStyles.videoSettingsOpenButton,
                    text: '设置'
                })
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            // 插入跳过片段管理按钮（番剧页用于配置片头片尾跳过）
            if (!existingSkipButton) {
                const skipButton = insertInjectedButton('skipSegmentManagerButton', floatNav, 'append', {
                    style: baseStyles.videoSettingsOpenButton,
                    text: '片段'
                })
                addEventListenerToElement(skipButton, 'click', async () => {
                    const epId = biliApis.getCurrentVideoID(window.location.href)
                    if (epId && epId !== 'error') {
                        await this.showSkipSegmentManager(epId)
                    }
                })
            }
        }
        logger.debug('侧边栏工具丨插入成功')
    },
    /**
     * 「鱼塘」按钮按需出现：命中大肥鱼评论才插入，没有就移除
     *
     * 侧栏其它按钮是固定项，这一个只在「本页确实有鱼」时才有意义 —— 平时不显示，避免干扰。
     * 插入位置：紧跟「UP主空间」头像下方（侧栏是 prepend 语义，直接 prepend 会跑到头像上面）。
     * @param visible 当前是否命中至少 1 条大肥鱼评论
     */
    syncFishPondButton (this: UiButtonsContext, visible: boolean): void {
        const floatNav = this.userConfigs.page_type === 'video' ? elementSelectors.get('videoFloatNav') : null
        const existing = floatNav?.querySelector('.bili-adjustment-icon.fishpond') ?? null
        if (!visible) {
            if (existing) {
                existing.remove()
                logger.debug('侧边栏工具丨本页已无大肥鱼，移除「鱼塘」按钮')
            }
            return
        }
        if (!floatNav || existing) return
        const dataV = floatNav.lastElementChild?.attributes?.[1]?.name || ''
        const fishPondButton = insertInjectedButton('fishPondButton', floatNav.lastElementChild as Node, 'prepend', {
            dataV,
            text: '鱼塘'
        })
        if (!fishPondButton) return
        addEventListenerToElement(fishPondButton, 'click', () => { this.openFishPond() })
        const upButton = floatNav.querySelector(UP_AVATAR_SELECTOR)
        if (upButton) upButton.after(fishPondButton)
        logger.debug('侧边栏工具丨命中大肥鱼，插入「鱼塘」按钮')
    },
    /**
     * 点头像进 UP 主空间
     *
     * mid 的取值顺序：按钮上记录的（随视频切换刷新）→ 缓存 → sessionStorage。
     * 按钮上那个最准 —— 切视频后它会被刷新成新作者的 mid。
     */
    openUpSpaceByAvatar (this: UiButtonsContext, button: HTMLElement | null): void {
        const attr = button?.getAttribute('data-adj-up-mid')
        const mid = attr || this._cachedMid || readSessionOwner().mid
        if (mid) this.openUpSpace(mid)
        else logger.warn('侧边栏工具丨未取到 UP 主 mid，无法打开空间')
    },
    /**
     * 刷新侧栏头像（切视频后作者会变）
     *
     * 先用 sessionStorage（B 站播放器写好的当前视频信息）立刻换，再用接口核对 ——
     * sessionStorage 里可能还留着上一个视频的作者。
     */
    async refreshUpAvatar (this: UiButtonsContext): Promise<void> {
        const floatNav = elementSelectors.get('videoFloatNav')
        const button = floatNav?.querySelector(UP_AVATAR_SELECTOR) as HTMLElement | null
        if (!button) return
        const sessionOwner = readSessionOwner()
        if (sessionOwner.mid) {
            this._cachedMid = sessionOwner.mid
            applyUpOwner(button, sessionOwner)
        }
        const videoId = biliApis.getCurrentVideoID()
        if (!videoId || videoId === 'error') return
        try {
            const info = await biliApis.getVideoInformation('video', videoId) as { owner?: unknown } | null | undefined
            const owner = normalizeUpOwner(info?.owner)
            if (!owner.mid) return
            this._cachedMid = owner.mid
            // 与 sessionStorage 不一致才重刷（避免无谓的 DOM 改动）
            if (String(owner.mid) !== String(sessionOwner.mid ?? '')) applyUpOwner(button, owner)
        } catch {
            // 接口失败就沿用 sessionStorage 的结果
        }
    },
    async unlockEpisodeSelector (this: UiButtonsContext): Promise<void> {
        const videoInfo = await biliApis.getVideoInformation(String(this.userConfigs.page_type), biliApis.getCurrentVideoID(window.location.href))
        if (!videoInfo) return
        const { pages = false, ugc_season = false, episodes = false } = videoInfo as { pages?: unknown; ugc_season?: unknown; episodes?: unknown }
        if (pages || ugc_season || episodes) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': videoStyles.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    // 不能在这里立刻定位：此刻 B 站还没完成切换、布局是中间态，
                    // 立刻滚动会先滚到错位置再被纠正（来回滚一次）。交给它等切换+布局稳定后一次直达。
                    await this.locateToPlayerAfterEpisodeSwitch()
                })
            })
        }
    },
    async insertLocateToCommentButton (this: UiButtonsContext): Promise<void> {
        if (!this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        // 防止重复添加
        if (document.getElementById('goToComments')) return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        if (!playerControllerBottomRight || !videoComment) return
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo((await getElementOffsetToDocument(videoComment as HTMLElement)).top - 10)
        })
        // 插入前往UP主空间按钮
        const mid = this._cachedMid
        if (mid) {
            const upHtml = getTemplates.upSpaceButton
            const upBtn = createElementAndInsert(upHtml, playerControllerBottomRight)
            addEventListenerToElement(upBtn, 'click', e => {
                e.stopPropagation()
                this.openUpSpace(mid)
            })
        }
    }
}
