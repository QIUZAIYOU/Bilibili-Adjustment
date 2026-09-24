import { eventBus } from '@/core/event-bus'
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { styles } from '@/shared/styles'
import { EVENT_NAMES } from '@/shared/constants'
import { sleep, insertStyleToDocument, getBodyHeight, addEventListenerToElement } from '@/utils/common'
const logger = new LoggerService('VideoModule')
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface WebfullContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _webfullWheelAttached?: boolean
    _fullscreenHandler?: EventListener | null
    webfullPlayerModeUnlock: () => Promise<void>
    enableWheelScrollInWebfull: () => void
    resetPlayerLayout: () => Promise<void>
    locateToPlayer: () => Promise<void>
}
export const webfullFeatures = {
    // 解锁网页全屏模式
    async webfullPlayerModeUnlock (this: WebfullContext): Promise<void> {
        const container = elementSelectors.get('playerContainer')
        if (container?.getAttribute('data-screen') !== 'web') {
            logger.debug('网页全屏丨当前非网页全屏模式，跳过解锁')
            return
        }
        await sleep(100)
        const player = document.getElementById('bilibili-player')
        const app = document.getElementById('app')
        // 将播放器移出 playerWrap → 移到 #app 顶部
        if (player && app && player.parentElement?.id === 'playerWrap') {
            app.prepend(player)
        }
        // 确保 mode-webscreen class 存在（从全屏退出时 B 站可能未添加）
        if (player && !player.classList.contains('mode-webscreen')) {
            player.classList.add('mode-webscreen')
        }
        document.body.classList.add('webscreen-fix')
        // 注入解锁样式（移除时 B 站原生 CSS 自动恢复）
        insertStyleToDocument({ 'UnlockWebPlayerStyle': styles.UnlockWebPlayer.replace(/BODYHEIGHT/gi, `${getBodyHeight()}px`) })
        // 移除小窗模式按钮（解锁后小窗模式会破坏布局）
        elementSelectors.queryAll('miniPlayerWindows').forEach(el => el.remove())
        // 监听模式切换按钮（排除全屏按钮，避免干扰 B 站全屏操作）
        const [wideEnterButton, wideLeaveButton, webLeaveButton] = await elementSelectors.batch([
            'playerModeWideEnterButton',
            'playerModeWideLeaveButton',
            'playerModeWebLeaveButton'
        ])
        this._cleanup.push(addEventListenerToElement([wideEnterButton, wideLeaveButton, webLeaveButton], 'click', async () => {
            await sleep(100)
            await this.resetPlayerLayout()
        }))
        // 监听网页全屏进入按钮
        const webEnterBtn = elementSelectors.get('playerModeWebEnterButton')
        if (webEnterBtn) {
            this._cleanup.push(addEventListenerToElement(webEnterBtn, 'click', async () => {
                await this.webfullPlayerModeUnlock()
            }))
        }
        this.enableWheelScrollInWebfull()
        logger.info('网页全屏丨已解锁')
        eventBus.emit(EVENT_NAMES.VIDEO_WEBFULL_PLAYER_MODE_UNLOCK)
    },
    // 网页全屏解锁后播放器占满页面顶部，滚轮在播放器上滚动会被 B站 拦截为音量调节，
    // 改为捕获阶段拦截滚轮事件（不 preventDefault），保留默认的页面滚动
    enableWheelScrollInWebfull (this: WebfullContext): void {
        if (this._webfullWheelAttached) return
        this._webfullWheelAttached = true
        // 用 Event 形参以走 addEventListener 的通用重载（'wheel' 专用重载的 options 不含 passive）
        const onWheel = (e: Event) => {
            if (!this.userConfigs?.webfull_unlock || this.userConfigs?.selected_player_mode !== 'web') return
            const playerContainer = elementSelectors.get('playerContainer')
            if (playerContainer?.getAttribute('data-screen') !== 'web') return
            if (!(e.target instanceof Node) || !playerContainer.contains(e.target)) return
            e.stopPropagation()
        }
        // 提取为变量：TS 6 的 Document.addEventListener 重载用 EventListenerOptions，字面量会触发多余属性检查
        const wheelOptions: AddEventListenerOptions = { capture: true, passive: true }
        document.addEventListener('wheel', onWheel, wheelOptions)
        this._cleanup.push(() => document.removeEventListener('wheel', onWheel, wheelOptions))
        logger.debug('网页全屏丨播放器滚轮已改为页面滚动')
    },
    // 从全屏退出时强制恢复解锁状态
    async autoReapplyUnlockOnFullscreenExit (this: WebfullContext): Promise<void> {
        this._fullscreenHandler = async () => {
            if (!document.fullscreenElement && this.userConfigs?.webfull_unlock && this.userConfigs?.selected_player_mode === 'web') {
                // 先立即补上样式 class，防止过渡期间播放器错位闪烁
                const player = document.getElementById('bilibili-player')
                if (player) player.classList.add('mode-webscreen')
                document.body.classList.add('webscreen-fix')
                // 再触发 B 站自身的网页全屏进入流程
                const webBtn = elementSelectors.get('playerModeWebEnterButton') as HTMLElement | null
                if (webBtn) {
                    webBtn.click()
                    logger.debug('网页全屏丨退出全屏后重新进入网页全屏')
                }
            }
        }
        document.addEventListener('fullscreenchange', this._fullscreenHandler!)
    },
    // 重置播放器布局（移除解锁样式，由 B 站原生 CSS 接管）
    async resetPlayerLayout (this: WebfullContext): Promise<void> {
        const player = document.getElementById('bilibili-player')
        const playerWrap = document.getElementById('playerWrap')
        // 移回 playerWrap
        if (player && playerWrap && player.parentElement?.id !== 'playerWrap') {
            playerWrap.append(player)
        }
        // 删除解锁样式元素 → B 站原生 CSS 自动恢复
        insertStyleToDocument({ 'UnlockWebPlayerStyle': '' })
        await storageService.userSet('current_player_mode', 'wide')
        await this.locateToPlayer()
    }
}
