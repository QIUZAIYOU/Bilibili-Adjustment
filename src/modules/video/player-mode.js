import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { stylesV2 } from '@/shared/styles'
import { EVENT_NAMES, STORAGE_KEYS } from '@/shared/constants'
import { sleep, isElementSizeChange, documentScrollTo, getElementOffsetToDocument, getElementComputedStyle, insertStyleToDocument, addEventListenerToElement } from '@/utils/common'
const logger = new LoggerService('VideoModule')
export const playerModeFeatures = {
    async autoSelectPlayerMode () {
        // 电影播放页若默认宽屏则跳过（电影页本身已宽屏，重复执行会退出宽屏）
        if (await this.hasPlayerTitle() && this.userConfigs.selected_player_mode === 'wide') {
            logger.debug('屏幕模式丨电影播放页且默认宽屏，跳过切换')
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
            return
        }
        // 若用户手动切换过播放器模式且开启了保持功能，跳过切换
        if (this.userConfigs.preserve_player_mode && this._lastPlayerMode && this._lastPlayerMode !== this.userConfigs.selected_player_mode) {
            const enabledModes = []
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
        const playerContainer = await elementSelectors.playerContainer
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
                    const playerModeWideEnterButton = await elementSelectors.playerModeWideEnterButton
                    playerModeWideEnterButton?.click()
                }
            },
            {
                type: 'web',
                action: async () => {
                    const playerModeWebEnterButton = await elementSelectors.playerModeWebEnterButton
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
        selectPlayerModeStrategies.find(strategy => strategy.type === this.userConfigs.selected_player_mode)?.action()
        await sleep(350)
        if (this.userConfigs.selected_player_mode !== 'normal') {
            const video = await elementSelectors.video
            const success = await this.isPlayerModeSwitchSuccess(this.userConfigs.selected_player_mode, video)
            if (success) {
                this._modeSwitchCooldown = Date.now()
                sessionStorage.setItem(STORAGE_KEYS.SESSION_MODE_COOLDOWN, String(this._modeSwitchCooldown))
                sessionStorage.setItem(STORAGE_KEYS.SESSION_LAST_PLAYER_MODE, this.userConfigs.selected_player_mode)
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
            } else {
                logger.warn('屏幕模式丨切换失败，继续执行其余功能')
            }
            // 无论切换成败都继续后续流程：页面初始滚动锁定依赖该事件解除，失败时不发会导致页面永远无法滚动
            eventBus.emit(EVENT_NAMES.VIDEO_PLAYER_MODE_SELECTED)
        }
    },
    async isPlayerModeSwitchSuccess (selectedPlayerMode, videoElement) {
        const playerContainer = await elementSelectors.playerContainer
        if (!playerContainer) return false
        await storageService.userSet('player_offset_top', await getElementOffsetToDocument(playerContainer).top)
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        return new Promise(resolve => {
            let settled = false
            const finish = success => {
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
    async autoLocateToPlayer () {
        // 重复触发（播放器模式选定事件与 SPA 可播放校验可能重叠）时合并为一次定位
        if (this._autoLocating) return
        this._autoLocating = true
        try {
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
            if (this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'web') {
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            if (!this.userConfigs.auto_locate) {
                logger.info('自动定位丨功能已关闭')
                eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
                return
            }
            // 先判断当前页面是否已经定位到了播放器位置
            const playerContainer = await elementSelectors.playerContainer
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
            const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocument(playerContainer).top : this.userConfigs.player_offset_top
            const header = await elementSelectors.headerMini
            const headerComputedStyle = header ? getElementComputedStyle(header, ['position', 'height']) : {}
            const headerHeight = parseInt(headerComputedStyle.height, 10) || 0
            const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - headerHeight : playerContainerOffsetTop
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
            insertStyleToDocument({ 'BodyOverflowHiddenStyle': stylesV2.BodyOverflowHidden })
            try {
                await sleep(300)
                await this.locateToPlayer()
            } finally {
                insertStyleToDocument({ 'BodyOverflowHiddenStyle': '' })
            }
            logger.info('自动定位丨成功')
            eventBus.emit(EVENT_NAMES.VIDEO_START_OTHER_FUNCTIONS)
        } finally {
            this._autoLocating = false
        }
    },
    async locateToPlayer () {
        const playerContainer = await elementSelectors.query('playerContainer')
        if (!playerContainer) return
        const playerMode = playerContainer.getAttribute('data-screen')
        // 全屏模式与网页全屏模式下播放器占满视口，滚动无效，直接跳过
        if (playerMode === 'full' || playerMode === 'web') return
        const header = await elementSelectors.headerMini
        const headerComputedStyle = header ? getElementComputedStyle(header, ['position', 'height']) : {}
        const headerHeight = parseInt(headerComputedStyle.height, 10) || 0
        const headerFixed = headerComputedStyle.position === 'fixed'
        const offsetTop = Number(this.userConfigs.offset_top) || 0
        // mini 模式播放器 transform 悬浮，无文档流位置可用，滚动到记忆位置即可
        if (playerMode === 'mini') {
            await documentScrollTo(this.userConfigs.player_offset_top, { duration: 300 }).catch(error => {
                logger.warn('自动定位丨滚动失败:', error.message)
            })
            return
        }
        // 播放器容器顶部在视口中的期望位置（滚动到位后播放器顶部应对齐到此）
        const targetViewportTop = headerFixed ? headerHeight + offsetTop : offsetTop
        const getMaxScroll = () => {
            const scroller = document.scrollingElement || document.documentElement
            return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        }
        // 文档流位置（getElementOffsetToDocument 已排除吸顶干扰）减去期望视口位置；
        // 无评论等文档高度不足时目标超出可滚动范围，clamp 到最大滚动位置
        const computeTarget = container => {
            const target = getElementOffsetToDocument(container).top - targetViewportTop
            return Math.max(0, Math.min(target, getMaxScroll()))
        }
        const isPositioned = container => {
            const rect = container.getBoundingClientRect()
            // 吸顶（scroll-sticky）时播放器固定在视口目标位置同样视为定位成功
            if (Math.abs(rect.top - targetViewportTop) <= 8) return true
            // 文档高度不足（如无评论的视频页）：滚动到底部即为当前最优位置
            const scroller = document.scrollingElement || document.documentElement
            return window.scrollY >= scroller.scrollHeight - scroller.clientHeight - 1
        }
        let targetOffset = computeTarget(playerContainer)
        await documentScrollTo(targetOffset, { duration: 300 }).catch(error => {
            logger.warn('自动定位丨滚动失败:', error.message)
        })
        // 吸顶（scroll-sticky）解除与布局稳定存在延迟，滚动后按视口位置校验，最多尝试 5 次
        for (let attempt = 0; attempt < 5; attempt++) {
            await sleep(300)
            const freshContainer = await elementSelectors.query('playerContainer')
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
            await documentScrollTo(targetOffset, { duration: 300 }).catch(error => {
                logger.warn('自动定位丨重新定位失败:', error.message)
            })
        }
        logger.debug('自动定位丨多次尝试后仍未到位')
    },
    async clickPlayerAutoLocate () {
        addEventListenerToElement(await elementSelectors.playerContainer, 'click', async e => {
            if (e.target.closest('.bpx-player-ctrl-bottom') || e.target.closest('.bpx-player-ctrl-top')) {
                return
            }
            await this.locateToPlayer()
        })
    }
}
