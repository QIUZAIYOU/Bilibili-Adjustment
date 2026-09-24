import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { styles } from '@/shared/styles'
import { EVENT_NAMES, STORAGE_KEYS } from '@/shared/constants'
import { sleep, isElementSizeChange, documentScrollTo, getElementOffsetToDocument, getElementComputedStyle, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
import { isHeaderOverlaying } from '@/utils/header-offset'
const logger = new LoggerService('VideoModule', { notify: false })
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface PlayerModeContext {
    userConfigs: Record<string, unknown>
    _lastPlayerMode?: string
    _modeSwitchCooldown?: number
    _autoLocating?: boolean
    _retryQueue?: { register: (id: string, fn: () => Promise<void> | void, options?: { budgetMs?: number }) => void } | null
    hasPlayerTitle: () => Promise<boolean>
    isPlayerModeSwitchSuccess: (mode: string, video: HTMLVideoElement | null) => Promise<boolean>
    locateToPlayer: (options?: { duration?: number }) => Promise<void>
    _retryPlayerMode: () => Promise<void>
}
/** 读播放器容器的文档流偏移（读不到返回 -1） */
const readPlayerOffset = (): number => {
    const container = elementSelectors.get('playerContainer')
    if (!container) return -1
    return Math.round(getElementOffsetToDocument(container as HTMLElement).top)
}
/**
 * 等「播放器文档偏移」稳定：连续两次采样一致才算稳定，最多等 maxWait（默认 800ms）
 *
 * 为什么需要：选集/SPA 切换期间页面结构处于中间态，此时读到的偏移不是最终值，
 * 立刻按它滚动就会滚到错位置，之后再被纠正 → 用户看到"先滚过去、又滚回来"。
 */
const waitForStablePlayerOffset = async (interval = 100, maxWait = 800): Promise<void> => {
    let previous = readPlayerOffset()
    const deadline = Date.now() + maxWait
    while (Date.now() < deadline) {
        await sleep(interval)
        const current = readPlayerOffset()
        if (current !== -1 && current === previous) return
        previous = current
    }
}
/** 等「切换真的发生」（URL 或视频 src 变化），返回是否检测到变化；最多等 maxWait（默认 2.5s） */
const waitForEpisodeChange = async (beforeHref: string, beforeSrc: string, maxWait = 2500): Promise<boolean> => {
    const deadline = Date.now() + maxWait
    while (Date.now() < deadline) {
        await sleep(100)
        const src = elementSelectors.get('video')?.getAttribute('src') || ''
        if (window.location.href !== beforeHref || (src !== '' && src !== beforeSrc)) return true
    }
    return false
}
export const playerModeFeatures = {
    async autoSelectPlayerMode (this: PlayerModeContext): Promise<void> {
        // 电影播放页若默认宽屏则跳过（电影页本身已宽屏，重复执行会退出宽屏）
        if (await this.hasPlayerTitle() && this.userConfigs.selected_player_mode === 'wide') {
            logger.debug('屏幕模式丨电影播放页且默认宽屏，跳过切换')
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
            return
        }
        // 若用户手动切换过播放器模式且开启了保持功能，跳过切换
        if (this.userConfigs.preserve_player_mode && this._lastPlayerMode && this._lastPlayerMode !== this.userConfigs.selected_player_mode) {
            const enabledModes: string[] = []
            if (this.userConfigs.preserve_mode_wide) enabledModes.push('wide')
            if (this.userConfigs.preserve_mode_web) enabledModes.push('web')
            if (this.userConfigs.preserve_mode_full) enabledModes.push('full')
            if (enabledModes.includes(this._lastPlayerMode)) {
                logger.debug(`屏幕模式丨${this._lastPlayerMode}模式已保持`)
                eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
                return
            }
        }
        // 切换冷却期：3秒内不重复切换，防止 B 站 player 重初始化重复触发
        if (this._modeSwitchCooldown && Date.now() - this._modeSwitchCooldown < 3000) {
            logger.debug('屏幕模式丨切换冷却中，跳过')
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
            return
        }
        // 先判断当前播放器模式是否已经是用户设置的模式
        const playerContainer = elementSelectors.get('playerContainer')
        if (!playerContainer) {
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
            return
        }
        const currentPlayerMode = playerContainer.getAttribute('data-screen')
        if (currentPlayerMode === this.userConfigs.selected_player_mode) {
            logger.debug(`屏幕模式丨当前已是${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : this.userConfigs.selected_player_mode === 'web' ? '网页全屏' : '正常'}模式，跳过切换`)
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
            return
        }
        const selectPlayerModeStrategies = [
            {
                type: 'wide',
                action: async () => {
                    // 宽屏按钮可能晚于视频可播放事件渲染：同步取不到时等待其出现，避免点击落空后走失败重试
                    const playerModeWideEnterButton = await elementSelectors.wait('playerModeWideEnterButton', 2000) as HTMLElement | null
                    playerModeWideEnterButton?.click()
                }
            },
            {
                type: 'web',
                action: async () => {
                    const playerModeWebEnterButton = await elementSelectors.wait('playerModeWebEnterButton', 2000) as HTMLElement | null
                    playerModeWebEnterButton?.click()
                }
            },
            {
                type: 'normal',
                action: async () => {
                    logger.info('屏幕模式丨功能已关闭')
                    eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
                }
            }
        ]
        // 等待切换动作完成（按钮出现并点击）后再校验结果，避免校验先于点击导致误报失败
        await selectPlayerModeStrategies.find(strategy => strategy.type === this.userConfigs.selected_player_mode)?.action()
        await sleep(350)
        if (this.userConfigs.selected_player_mode !== 'normal') {
            const video = elementSelectors.get('video') as HTMLVideoElement | null
            const success = await this.isPlayerModeSwitchSuccess(String(this.userConfigs.selected_player_mode), video)
            if (success) {
                this._modeSwitchCooldown = Date.now()
                sessionStorage.setItem(STORAGE_KEYS.SESSION_MODE_COOLDOWN, String(this._modeSwitchCooldown))
                sessionStorage.setItem(STORAGE_KEYS.SESSION_LAST_PLAYER_MODE, String(this.userConfigs.selected_player_mode))
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
            } else {
                logger.warn('屏幕模式丨切换失败，已加入重试队列（3 分钟内持续重试）')
                this._retryQueue?.register('playerMode', () => this._retryPlayerMode())
            }
            // 无论切换成败都继续后续流程：页面初始滚动锁定依赖该事件解除，失败时不发会导致页面永远无法滚动
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
        }
    },
    /**
     * 重试切换播放器模式（由重试队列调用）
     *
     * ⚠️ **任何"没切成"的情况都必须抛错**：队列把"正常返回"当作成功并出队，
     * 旧实现在找不到按钮/容器时直接 `return`，于是重试一次就被静默丢弃（2026-09-21 修的第二个坑）。
     */
    async _retryPlayerMode (this: PlayerModeContext): Promise<void> {
        const playerContainer = elementSelectors.get('playerContainer')
        if (!playerContainer) throw new Error('未找到播放器容器')
        const targetMode = String(this.userConfigs.selected_player_mode)
        // 已经是目标模式：视为重试成功（可能上一次其实生效了，只是校验时机太早）
        if (playerContainer.getAttribute('data-screen') === targetMode) return
        const strategy: Record<string, string> = { wide: 'playerModeWideEnterButton', web: 'playerModeWebEnterButton' }
        const buttonKey = strategy[targetMode]
        if (!buttonKey) throw new Error(`未知的目标模式：${targetMode}`)
        const btn = await elementSelectors.wait(buttonKey, 2000) as HTMLElement | null
        if (!btn) throw new Error('未找到模式切换按钮（可能尚未渲染）')
        btn.click()
        await sleep(350)
        const success = await this.isPlayerModeSwitchSuccess(targetMode, elementSelectors.get('video') as HTMLVideoElement | null)
        if (!success) throw new Error('点击后校验仍未切换到目标模式')
        this._modeSwitchCooldown = Date.now()
        logger.info(`屏幕模式丨${targetMode === 'wide' ? '宽屏' : '网页全屏'}丨重试切换成功`)
    },
    async isPlayerModeSwitchSuccess (this: PlayerModeContext, selectedPlayerMode: string, videoElement: HTMLVideoElement | null): Promise<boolean> {
        const playerContainer = elementSelectors.get('playerContainer')
        if (!playerContainer) return false
        await storageService.userSet('player_offset_top', await getElementOffsetToDocument(playerContainer as HTMLElement).top)
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        return new Promise<boolean>(resolve => {
            let settled = false
            const finish = (success: boolean): void => {
                if (settled) return
                settled = true
                observer?.disconnect()
                clearTimeout(timeoutId)
                resolve(success)
            }
            const observer = videoElement ? isElementSizeChange(videoElement, () => {
                if (playerContainer.getAttribute('data-screen') === selectedPlayerMode) finish(true)
            }) : null
            const timeoutId = setTimeout(() => finish(false), 3000)
            if (playerContainer.getAttribute('data-screen') === selectedPlayerMode) finish(true)
        })
    },
    async autoLocateToPlayer (this: PlayerModeContext): Promise<void> {
        // 重复触发（播放器模式选定事件与 SPA 可播放校验可能重叠）时合并为一次定位
        if (this._autoLocating) return
        this._autoLocating = true
        try {
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
            // 「网页全屏解锁」或「默认播放器模式＝网页全屏」时不执行定位：
            // 播放器占满视口，定位锁定无意义且会阻止解锁所需的页面滚动。
            // 注意：这里此前误写为 page_type === 'web'（page_type 只可能是 video/bangumi/dynamic），恒不成立。
            if (this.userConfigs.webfull_unlock || this.userConfigs.selected_player_mode === 'web') {
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            if (!this.userConfigs.auto_locate) {
                logger.info('自动定位丨功能已关闭（设置项「自动定位至播放器」为关，可在播放页设置中开启）')
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            // 按页面类型检查子开关：两者全选或全不选时在所有页面执行，否则按勾选类型执行
            if (this.userConfigs.auto_locate_video !== this.userConfigs.auto_locate_bangumi) {
                const isBangumi = this.userConfigs.page_type === 'bangumi'
                if (isBangumi && !this.userConfigs.auto_locate_bangumi) {
                    logger.info('自动定位丨当前为番剧页且番剧自动定位已关闭，跳过')
                    eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                    return
                }
                if (!isBangumi && !this.userConfigs.auto_locate_video) {
                    logger.info('自动定位丨当前为普通视频页且普通视频自动定位已关闭，跳过')
                    eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                    return
                }
            }
            // 先判断当前页面是否已经定位到了播放器位置
            const playerContainer = elementSelectors.get('playerContainer')
            if (!playerContainer) {
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            const playerMode = playerContainer.getAttribute('data-screen')
            // 网页全屏模式不执行定位锁定：播放器占满视口，定位无意义，且锁定会阻止解锁功能所需的页面滚动
            if (playerMode === 'web') {
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            // 先等布局稳定再测量目标：选集/SPA 切换期间读到的是中间态偏移，按它滚动会滚错位置
            await waitForStablePlayerOffset()
            const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocument(playerContainer as HTMLElement).top : (this.userConfigs.player_offset_top as number)
            const header = elementSelectors.get('headerMini')
            const headerComputedStyle: { position?: string; height?: string } = header
                ? getElementComputedStyle(header, ['position', 'height']) as { position?: string; height?: string }
                : {}
            const headerHeight = parseInt(headerComputedStyle.height ?? '', 10) || 0
            const playerOffsetTop = isHeaderOverlaying(headerComputedStyle.position) ? playerContainerOffsetTop - headerHeight : playerContainerOffsetTop
            const targetOffset = playerOffsetTop - (Number(this.userConfigs.offset_top) || 0)
            const currentScrollTop = window.scrollY
            // 允许一定的误差范围（50px）
            if (Math.abs(currentScrollTop - targetOffset) < 50) {
                logger.debug('自动定位丨当前已在播放器位置附近，跳过定位')
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            // 定位期间锁定页面滚动（overflow hidden 不影响程序化 scrollTo），避免用户滚动干扰定位；
            // 结束后无论成败都恢复
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': styles.BodyOverflowHidden })
            try {
                await sleep(300)
                await this.locateToPlayer()
                // 定位后验证是否到达目标位置，未到达则重试（番剧页布局延迟较大）
                const maxRetry = this.userConfigs.page_type === 'bangumi' ? 3 : 2
                for (let retry = 0; retry < maxRetry; retry++) {
                    const freshContainer = elementSelectors.get('playerContainer')
                    if (!freshContainer) break
                    const freshMode = freshContainer.getAttribute('data-screen')
                    if (freshMode === 'web' || freshMode === 'full') break
                    const freshOffsetTop = freshMode !== 'mini' ? await getElementOffsetToDocument(freshContainer as HTMLElement).top : (this.userConfigs.player_offset_top as number)
                    const freshHeader = elementSelectors.get('headerMini')
                    const freshHeaderStyle: { position?: string; height?: string } = freshHeader
                        ? getElementComputedStyle(freshHeader, ['position', 'height']) as { position?: string; height?: string }
                        : {}
                    const freshHeaderHeight = parseInt(freshHeaderStyle.height ?? '', 10) || 0
                    const freshTargetViewportTop = isHeaderOverlaying(freshHeaderStyle.position) ? freshHeaderHeight + Number(this.userConfigs.offset_top || 0) : Number(this.userConfigs.offset_top || 0)
                    const scroller = document.scrollingElement || document.documentElement
                    const atBottom = window.scrollY >= scroller.scrollHeight - scroller.clientHeight - 1
                    if (Math.abs(window.scrollY - (freshOffsetTop - freshTargetViewportTop)) < 50 || atBottom) {
                        logger.debug(`自动定位丨第 ${retry + 1} 次验证已到位`)
                        break
                    }
                    logger.debug(`自动定位丨第 ${retry + 1} 次验证未到位（当前 ${window.scrollY}，目标 ${freshOffsetTop - freshTargetViewportTop}），重试`)
                    await sleep(500 * (retry + 1))
                    await this.locateToPlayer()
                }
            } finally {
                insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
            }
            logger.info('自动定位丨成功')
            eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
        } finally {
            this._autoLocating = false
        }
    },
    async locateToPlayer (this: PlayerModeContext, options: { duration?: number } = {}): Promise<void> {
        // duration 缺省 300ms（平滑动画，适合用户主动触发的定位）；
        // 选集切换后的纠正传 0：直接到位，避免"先滚到顶部再滚回来"这种可见的二次滚动
        const duration = options.duration ?? 300
        const playerContainer = elementSelectors.get('playerContainer')
        if (!playerContainer) return
        const playerMode = playerContainer.getAttribute('data-screen')
        // 全屏模式与网页全屏模式下播放器占满视口，滚动无效，直接跳过
        if (playerMode === 'full' || playerMode === 'web') return
        const header = elementSelectors.get('headerMini')
        const headerComputedStyle: { position?: string; height?: string } = header
            ? getElementComputedStyle(header, ['position', 'height']) as { position?: string; height?: string }
            : {}
        const headerHeight = parseInt(headerComputedStyle.height ?? '', 10) || 0
        const headerFixed = isHeaderOverlaying(headerComputedStyle.position)
        const offsetTop = Number(this.userConfigs.offset_top) || 0
        // mini 模式播放器 transform 悬浮，无文档流位置可用，滚动到记忆位置即可
        if (playerMode === 'mini') {
            await documentScrollTo(this.userConfigs.player_offset_top as number, { duration, behavior: 'instant' }).catch(error => {
                logger.warn('自动定位丨滚动失败:', error instanceof Error ? error.message : String(error))
            })
            return
        }
        // 播放器容器顶部在视口中的期望位置（滚动到位后播放器顶部应对齐到此）
        const targetViewportTop = headerFixed ? headerHeight + offsetTop : offsetTop
        const getMaxScroll = (): number => {
            const scroller = document.scrollingElement || document.documentElement
            return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        }
        // 文档流位置（getElementOffsetToDocument 已排除吸顶干扰）减去期望视口位置；
        // 无评论等文档高度不足时目标超出可滚动范围，clamp 到最大滚动位置
        const computeTarget = (container: Element): number => {
            const target = getElementOffsetToDocument(container as HTMLElement).top - targetViewportTop
            return Math.max(0, Math.min(target, getMaxScroll()))
        }
        const isPositioned = (container: Element): boolean => {
            const rect = container.getBoundingClientRect()
            // 吸顶（scroll-sticky）时播放器固定在视口目标位置同样视为定位成功
            if (Math.abs(rect.top - targetViewportTop) <= 8) return true
            // 文档高度不足（如无评论的视频页）：滚动到底部即为当前最优位置
            const scroller = document.scrollingElement || document.documentElement
            return window.scrollY >= scroller.scrollHeight - scroller.clientHeight - 1
        }
        let targetOffset = computeTarget(playerContainer)
        await documentScrollTo(targetOffset, { duration, behavior: 'instant' }).catch(error => {
            logger.warn('自动定位丨滚动失败:', error instanceof Error ? error.message : String(error))
        })
        // 吸顶（scroll-sticky）解除与布局稳定存在延迟，滚动后按视口位置校验，最多尝试 5 次
        for (let attempt = 0; attempt < 5; attempt++) {
            await sleep(300)
            const freshContainer = elementSelectors.get('playerContainer')
            if (!freshContainer || freshContainer.getAttribute('data-screen') === 'full' || freshContainer.getAttribute('data-screen') === 'web') return
            if (isPositioned(freshContainer)) return
            const freshTarget = computeTarget(freshContainer)
            if (Math.abs(freshTarget - targetOffset) <= 5) {
                // 目标未变化但仍未到位：B站 吸顶状态未解除，重复滚动触发其监听器后继续等待
                logger.debug('自动定位丨目标未变化，等待播放器吸顶状态解除')
            } else {
                logger.debug(`自动定位丨重新定位: ${freshTarget}（当前位置 ${window.scrollY}）`)
            }
            targetOffset = freshTarget
            await documentScrollTo(targetOffset, { duration, behavior: 'instant' }).catch(error => {
                logger.warn('自动定位丨重新定位失败:', error instanceof Error ? error.message : String(error))
            })
        }
        logger.debug('自动定位丨多次尝试后仍未到位')
    },
    /**
     * 选集切换后的定位（由选集菜单点击触发）
     *
     * 旧实现是在点击回调里**立刻** `locateToPlayer()`：那一刻 B 站尚未完成切换、页面结构处于中间态，
     * 按中间态偏移滚动会先滚到错位置（用户看到"先滚到顶部"），随后视频可播放再触发一次 autoLocateToPlayer
     * 才滚到正确位置 —— 来回滚动一次。现改为：等「切换真的发生」→ 等「布局稳定」→ **一次性直达**（无动画）。
     */
    async locateToPlayerAfterEpisodeSwitch (this: PlayerModeContext): Promise<void> {
        const beforeHref = window.location.href
        const beforeSrc = elementSelectors.get('video')?.getAttribute('src') || ''
        const switched = await waitForEpisodeChange(beforeHref, beforeSrc)
        if (!switched) {
            logger.debug('选集定位丨未检测到切换（可能点的是当前集），直接定位一次')
        }
        await waitForStablePlayerOffset()
        await this.locateToPlayer({ duration: 0 })
        logger.debug('选集定位丨已直接定位到播放器')
    },
    async clickPlayerAutoLocate (this: PlayerModeContext): Promise<void> {
        addEventListenerToElement(elementSelectors.get('playerContainer'), 'click', async (e: Event) => {
            const target = e.target as Element | null
            if (target?.closest('.bpx-player-ctrl-bottom') || target?.closest('.bpx-player-ctrl-top')) {
                return
            }
            await this.locateToPlayer()
        })
    }
}
