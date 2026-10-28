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
    const element = createElementAndInsert(template, target, method) as HTMLElement | null
    if (!element) return null
    if (options.className) element.classList.add(...options.className.split(/\s+/).filter(Boolean))
    if (options.style) element.setAttribute('style', options.style)
    if (options.dataV) element.setAttribute(options.dataV, '')
    if (options.text) element.insertAdjacentText('beforeend', options.text)
    return element
}
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UiButtonsContext {
    userConfigs: Record<string, unknown>
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
            logger.warn('侧边栏工具丨未找到浮动导航栏，跳过插入')
            return
        }
        const dataV = this.userConfigs.page_type === 'video' ? floatNav.lastElementChild?.attributes?.[1]?.name || '' : ''
        // 检查是否已经存在定位按钮和设置按钮
        const existingLocateButton = floatNav.querySelector('.bili-adjustment-icon.locate')
        const existingSettingsButton = floatNav.querySelector('.bili-adjustment-icon.settings')
        const existingUpButton = floatNav.querySelector('.bili-adjustment-icon.up')
        const existingSkipButton = floatNav.querySelector('.bili-adjustment-icon.skip')
        const existingFishPondButton = floatNav.querySelector('.bili-adjustment-icon.fishpond')
        const catchFishEnabled = Boolean(this.userConfigs.catch_fish)
        if (!catchFishEnabled && existingFishPondButton) {
            existingFishPondButton.remove()
            logger.debug('侧边栏工具丨捞鱼已关闭，移除「鱼塘」按钮')
        }
        const fishPondButtonReady = Boolean(existingFishPondButton) === catchFishEnabled
        if (existingLocateButton && existingSettingsButton && existingUpButton && existingSkipButton && fishPondButtonReady) {
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
            // 「鱼塘」按钮：「捞鱼」开着才有意义（关着时按钮都不插，避免留一个永远空的入口）；已插入但配置被关掉时顺手移除
            if (catchFishEnabled && !existingFishPondButton) {
                const fishPondButton = insertInjectedButton('fishPondButton', floatNav.lastElementChild as Node, 'prepend', {
                    dataV,
                    text: '鱼塘'
                })
                addEventListenerToElement(fishPondButton, 'click', () => { this.openFishPond() })
            }
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
                await this.refreshUpAvatar()
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
