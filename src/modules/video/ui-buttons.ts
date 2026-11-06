import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { baseStyles } from '@/shared/styles/base'
import { videoStyles } from '@/shared/styles/video-page'
import { biliApis } from '@/shared/bili-apis'
import { SubtitleAvailabilityCache } from '@/shared/subtitle-availability'
import { STORAGE_KEYS } from '@/shared/constants'
import { getTemplates } from '@/shared/templates'
import { queryTemplateTextField } from '@/shared/templates/buttons'
import { sleep, createElementAndInsert, addEventListenerToElement, insertStyleToDocument, documentScrollTo, getElementOffsetToDocument, sanitizeHttpUrl } from '@/utils/common'
import type { InsertionMethod } from '@/utils/common'
import { normalizeUpOwner, resolveAvatarSize, resolveAvatarTip } from './up-avatar-pure'
import type { UpOwnerInfo } from './up-avatar-pure'
import { SIDENAV_KEYS, SIDENAV_KEY_SELECTORS, SIDENAV_MIRROR_SELECTOR, planSidenavDedupe } from './sidenav-dedupe'
import type { SidenavButtonKey } from './sidenav-dedupe'
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
    locateToPlayer: (options?: { duration?: number, force?: boolean }) => Promise<void>
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
    /** 「片段」按钮按需显示（仅在本视频有字幕时出现） */
    syncSkipSegmentButton: () => Promise<void>
}
/**
 * 「片段」按钮只在**有字幕**的视频上出现：字幕是片段识别与自动跳过的前提，
 * 没字幕的视频点进管理面板什么也做不了，白占侧栏一格。
 *
 * probe 走 biliApis（视频信息拿 cid + 字幕轨道列表），结果按 bvid 缓存在会话内；
 * 判定与缓存逻辑在 `src/shared/subtitle-availability.ts`（纯类，可单测）。
 */
const subtitleAvailability = new SubtitleAvailabilityCache(async (bvid: string): Promise<boolean> => {
    const info = await biliApis.getVideoInformation('video', bvid) as { cid?: string | number } | null | undefined
    const cid = info?.cid
    if (!cid) return false
    const tracks = await biliApis.getVideoSubtitles(bvid, cid)
    return Array.isArray(tracks) && tracks.length > 0
})
/**
 * 播放器上有没有字幕入口（B 站自己的字幕按钮 / 控制条字幕项）。
 *
 * 选它当首选判据的原因：B 站只在视频确实有字幕（含 AI 字幕）时才渲染这个控件，
 * 是**页面自己给出的结论**，比我们再打一次接口更准、也不花请求。
 */
const playerShowsSubtitleControl = (): boolean => Boolean(
    elementSelectors.get('switchSubtitleButton') || elementSelectors.get('playerSubtitleCtrl')
)
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
            // 先做全文档去重：按钮若只是被 B 站搬出了容器，这一步就能把它找回来（并清掉多余副本），
            // 不需要再插一组。只有真的一个都不剩才补插。
            const snapshot = dedupeSidenavButtons(ctx.userConfigs.page_type)
            const nav = snapshot.primary
            if (!nav) return
            if (snapshot.present.locate) {
                // 按钮还在但 scope 可能丢了（旧版本插入的）：顺手校正，别让错误的扁平样式一直留着
                if (ctx.userConfigs.page_type === 'video') {
                    applySidenavDataV(resolveSidenavDataV(nav), Object.values(snapshot.present))
                }
                return
            }
            if (!nav.isConnected || nav.getClientRects().length === 0) return
            floatNavReinsertCount += 1
            logger.debug('侧边栏工具丨页面已稳定，补插第 ' + floatNavReinsertCount + ' 次')
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
/**
 * 当前页对应的侧栏容器选择器键：视频页与番剧页是两个不同的容器
 */
const resolveFloatNavKey = (pageType: unknown): string => pageType === 'video' ? 'videoFloatNav' : 'bangumiFloatNav'
/** 网页全屏镜像容器里的按钮是播放器复制的，不算重复 */
const isInSidenavMirror = (element: Element): boolean => Boolean(element.closest(SIDENAV_MIRROR_SELECTOR))
const collectSidenavCandidates = (): Partial<Record<SidenavButtonKey, Element[]>> => {
    const candidates: Partial<Record<SidenavButtonKey, Element[]>> = {}
    for (const key of SIDENAV_KEYS) candidates[key] = Array.from(document.querySelectorAll(SIDENAV_KEY_SELECTORS[key]))
    return candidates
}
interface SidenavSnapshot {
    primary: Element | null
    present: Partial<Record<SidenavButtonKey, Element>>
}
/**
 * 全文档去重：留下主容器内那一组，删掉被 B 站搬到别处的副本
 *
 * 必须在**插入之前**跑：原先的判据只看当前容器，副本被搬走后容器里查不到按钮，
 * 看护定时器就当成「还没插」再插一组 —— 重复堆叠正是这么来的。
 */
const dedupeSidenavButtons = (pageType: unknown): SidenavSnapshot => {
    const plan = planSidenavDedupe({
        navs: elementSelectors.queryAll(resolveFloatNavKey(pageType)),
        candidates: collectSidenavCandidates(),
        isInMirror: isInSidenavMirror
    })
    if (plan.staleCopies.length > 0) {
        for (const copy of plan.staleCopies) copy.remove()
        logger.warn('侧边栏工具丨清理 ' + plan.staleCopies.length + ' 个脱离容器的副本（疑似 B 站重渲染搬移）')
    }
    return { primary: plan.primary, present: plan.present }
}
/** 读元素上所有 data-v-* 作用域属性名（CSS 的 `[data-v-]` 不是前缀通配，取不到这些属性） */
const readDataVAttributes = (element: Element): string[] => element.getAttributeNames().filter(name => name.startsWith('data-v-'))
/**
 * 从侧栏里抄 B 站作用域属性（data-v-xxxx）
 *
 * 只抄「容器与真实按钮共有」的那一个：侧栏容器的 data-v 不止一个（组件自身 scope + 页面布局 scope），
 * 而影响卡片样式的规则绑定的是**按钮所在组件**的 scope。容器与真实按钮的交集正好就是它；
 * 后代子组件自己的 data-v 不能抄，抄错了 B 站规则同样不命中。
 */
const resolveSidenavDataV = (nav: Element): string => {
    const navScopes = readDataVAttributes(nav)
    const sample = Array.from(nav.querySelectorAll('.fixed-sidenav-storage-item')).find(element => !element.classList.contains('bili-adjustment-icon'))
    const sampleScopes = sample ? readDataVAttributes(sample) : []
    const shared = navScopes.filter(scope => sampleScopes.includes(scope))
    return shared[0] ?? navScopes[0] ?? ''
}
/**
 * 把作用域属性校正到注入按钮上（自愈）
 *
 * 历史版本可能已经插过没有 scope（或 scope 抄错）的按钮；「已存在就跳过插入」的分支如果不补这一下，
 * 用户刷新多少次都恢复不了样式。这里统一：先摘掉其它 data-v-*，缺目标 scope 就补上。
 */
const applySidenavDataV = (dataV: string, buttons: Array<Element | null | undefined>): void => {
    if (!dataV) return
    for (const button of buttons) {
        if (!button) continue
        for (const name of readDataVAttributes(button)) {
            if (name !== dataV) button.removeAttribute(name)
        }
        if (!button.hasAttribute(dataV)) button.setAttribute(dataV, '')
    }
}
/**
 * 插入目标必须真的在容器内
 *
 * lastElementChild 有时会是我们自己的按钮（插入过的），此时再 prepend 就成了嵌套按钮；
 * 也可能被 B 站换成别的节点。这类情况下退回容器本身（prepend 到容器顶部，与原来的视觉位置一致）。
 */
const resolveSidenavInsertionTarget = (nav: Element): Node => {
    const last = nav.lastElementChild
    if (!last) return nav
    if (last.classList.contains('bili-adjustment-icon')) return nav
    return last.querySelector('.fixed-sidenav-storage-item') ? last : nav
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
        // 用户点的按钮 = 显式要定位：force 掉「刚滚过就让位」的判断
        const locate = (): Promise<void> => this.locateToPlayer({ force: true })
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
        // 先做全文档去重：按钮被 B 站搬到容器外时，这里会清掉副本，避免看护再插一组
        const snapshot = dedupeSidenavButtons(this.userConfigs.page_type)
        const floatNav = snapshot.primary
        if (!floatNav) {
            // 调度改成三车道后，本功能在 canplaythrough 就派发，此时 B 站侧栏常常还没渲染。
            // 旧实现直接 return，按钮就再也不出现（用户看到的"侧边栏按钮没插入"）。这里做有界重试。
            scheduleFloatNavInsertRetry(this)
            return
        }
        cancelFloatNavInsertRetry()
        startFloatNavWatch(this)
        const isVideoPage = this.userConfigs.page_type === 'video'
        const dataV = isVideoPage ? resolveSidenavDataV(floatNav) : ''
        const insertTarget: Node = isVideoPage ? resolveSidenavInsertionTarget(floatNav) : floatNav
        const {
            locate: existingLocateButton,
            settings: existingSettingsButton,
            up: existingUpButton,
            skip: existingSkipButton,
            fishpond: existingFishPondButton
        } = snapshot.present
        // 自愈：旧版本（或首次插入时侧栏还没渲染出真实按钮）插的按钮可能没带 scope，
        // 走「已存在就跳过」分支时补一次，用户刷新/看护触发即可恢复卡片样式
        if (isVideoPage) {
            applySidenavDataV(dataV, [existingLocateButton, existingSettingsButton, existingUpButton, existingSkipButton, existingFishPondButton])
        }
        // 「鱼塘」按钮是**按需出现**的：只有扫描真的命中大肥鱼评论才插入（见 syncFishPondButton），
        // 所以这里只在功能被关掉时清残留，且不把它当作「已插齐」的判据
        if (!this.userConfigs.catch_fish && existingFishPondButton) {
            existingFishPondButton.remove()
            logger.debug('侧边栏工具丨捞鱼已关闭，移除「鱼塘」按钮')
        }
        if (existingLocateButton && existingSettingsButton && existingUpButton) {
            logger.debug('侧边栏工具丨已存在，跳过插入')
            // 「片段」按钮是随视频变的（换集/换视频后字幕情况不同）：上面三个都在也要重新核对一次
            if (isVideoPage) void this.syncSkipSegmentButton()
            return
        }
        let locateButton: HTMLElement | null = null
        let videoSettingsOpenButton: HTMLElement | null = null
        let upButton: HTMLElement | null = null
        if (isVideoPage) {
            if (!existingLocateButton) {
                locateButton = insertInjectedButton('locateButton', insertTarget, 'prepend', {
                    className: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    dataV,
                    text: '定位'
                })
                addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = insertInjectedButton('videoSettingsOpenButton', insertTarget, 'prepend', {
                    dataV,
                    text: '设置'
                })
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            // 「片段」按钮按需出现：先问字幕（异步、按 bvid 缓存），确认有字幕才插；没字幕就把残留移除。
            // 不 await：它要发网络请求，不能挡住定位/设置/头像三个按钮的插入。
            void this.syncSkipSegmentButton()
            // 「鱼塘」按钮**不在这里插**：只有扫描命中大肥鱼评论时才出现（`syncFishPondButton`），
            // 平时不占位，避免侧栏常年挂一个空入口
            // ⚠️ 「UP主空间」（作者头像）按钮**最后插入**：
            //    侧栏是纵向排列、插入方式又是 prepend（插到最前面），于是**最后插入的反而排在最上面** ——
            //    这样它就是侧栏的第一项（在「片段」按钮上方）。
            if (!existingUpButton) {
                upButton = insertInjectedButton('upButton', insertTarget, 'prepend', { dataV })
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
            if (!existingLocateButton) {
                locateButton = insertInjectedButton('locateButton', floatNav, 'append', {
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
        // 自检：不假设插入一定落在预期位置，直接数一遍文档 —— 还有重复就再清一轮，
        // 绝不让副本留到下一轮看护被当成「没有按钮」而重复插入
        if (document.querySelectorAll(SIDENAV_KEY_SELECTORS.locate).length > 1) {
            logger.warn('侧边栏工具丨检测到重复的定位按钮，执行去重')
            dedupeSidenavButtons(this.userConfigs.page_type)
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
    /**
     * 「片段」按钮的按需插入 / 移除。
     *
     * 判定：当前视频是否有字幕（biliApis 视频信息 + 字幕轨道）。判不出来（请求失败）时**不插**——
     * 宁可这次没有入口，也不要在没字幕的视频上放一个点了没用、还容易让人以为是坏了的按钮。
     */
    async syncSkipSegmentButton (this: UiButtonsContext): Promise<void> {
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        if (!bvid || bvid === 'error') return
        // B 站自己的字幕控件是**最可信**的信号：它只在视频真有字幕（含 AI 字幕）时才出现，
        // 且不用发请求。控件还没渲染出来时再退回接口探测（接口按 bvid 缓存）。
        let hasSubtitles = playerShowsSubtitleControl()
        if (!hasSubtitles) {
            try {
                hasSubtitles = await subtitleAvailability.resolve(bvid)
            } catch (error) {
                // 探测失败说明「没问出来」，不是「没有字幕」—— 失败放行，别把用户本来能用的入口藏掉
                logger.debug('侧边栏工具丨字幕探测失败，保留「片段」按钮', error)
                hasSubtitles = true
            }
        }
        // 等结果的这几百毫秒里可能换了视频、侧栏被 B 站重建、甚至按钮被搬到容器外：
        // 重新做一次去重再取主容器与按钮，别对着已经失效的节点操作
        if (biliApis.getCurrentVideoID(window.location.href) !== bvid) return
        const snapshot = dedupeSidenavButtons(this.userConfigs.page_type)
        const floatNav = snapshot.primary
        if (!floatNav || !floatNav.isConnected) return
        const existing = (snapshot.present.skip ?? null) as HTMLElement | null
        if (existing && hasSubtitles) applySidenavDataV(resolveSidenavDataV(floatNav), [existing])
        if (!hasSubtitles) {
            if (existing) {
                existing.remove()
                logger.debug(`侧边栏工具丨当前视频没有字幕，隐藏「片段」按钮（${bvid}）`)
            }
            return
        }
        if (existing) return
        const skipButton = insertInjectedButton('skipSegmentManagerButton', resolveSidenavInsertionTarget(floatNav), 'prepend', {
            dataV: resolveSidenavDataV(floatNav),
            text: '片段'
        })
        addEventListenerToElement(skipButton, 'click', async () => {
            const current = biliApis.getCurrentVideoID(window.location.href)
            if (current && current !== 'error') {
                await this.showSkipSegmentManager(current)
            }
        })
    },
    syncFishPondButton (this: UiButtonsContext, visible: boolean): void {
        if (this.userConfigs.page_type !== 'video') return
        // 和其它侧栏按钮一样先全文档去重：B 站把按钮搬出容器后，这里会清掉副本而不是再插一个
        const snapshot = dedupeSidenavButtons(this.userConfigs.page_type)
        const floatNav = snapshot.primary
        const existing = snapshot.present.fishpond ?? null
        if (!visible) {
            if (existing) {
                existing.remove()
                logger.debug('侧边栏工具丨本页已无大肥鱼，移除「鱼塘」按钮')
            }
            return
        }
        if (!floatNav) return
        if (existing) {
            applySidenavDataV(resolveSidenavDataV(floatNav), [existing])
            return
        }
        const fishPondButton = insertInjectedButton('fishPondButton', resolveSidenavInsertionTarget(floatNav), 'prepend', {
            dataV: resolveSidenavDataV(floatNav),
            text: '鱼塘'
        })
        if (!fishPondButton) return
        addEventListenerToElement(fishPondButton, 'click', () => { this.openFishPond() })
        const upButton = snapshot.present.up ?? null
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
        // 用去重后的「主容器里的那颗」：容器可能被重建、按钮可能被搬到别处，直接 querySelector
        // 会刷到已经不在侧栏上的副本
        const snapshot = dedupeSidenavButtons(this.userConfigs.page_type)
        const button = (snapshot.present.up ?? null) as HTMLElement | null
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
            // 用户点「前往评论」= 显式要跳到评论区：不设 yieldToUser（他要的就是滚过去）
            documentScrollTo((await getElementOffsetToDocument(videoComment as HTMLElement)).top - 10, { label: '前往评论区' })
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
