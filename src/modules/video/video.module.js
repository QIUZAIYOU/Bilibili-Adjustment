import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { sleep, isElementSizeChange, documentScrollTo, getElementOffsetToDocumentTop, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially } from '@/utils/common'

const logger = new LoggerService('VideoModule')

export default {
    name: 'video',
    dependencies: [],
    version: '1.7.0',
    async install() {
        eventBus.on('app:ready', () => {
            logger.info('视频模块｜已加载')
            this.preFunctions()
        })
    },
    async preFunctions() {
        this.userConfigs = await storageService.getAll()
        this.initEventListeners()
        this.checkVideoCanplaythrough(await elementSelectors.video)
    },
    async initEventListeners() {
        eventBus.on('logger:show', (_, message) => {
            logger.info(message)
        })
        eventBus.on('video:canplaythrough', this.autoSelectPlayerMode)
        eventBus.on('video:playerModeSelected', this.autoLocateToPlayer)
        eventBus.on('video:startOtherFunctions', this.handleExecuteFunctionsSequentially)
    },
    isVideoCanplaythrough(videoElement) {
        return new Promise(resolve => {
            if (videoElement?.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                return resolve(true)
            }

            const ac = new AbortController()

            const handler = () => {
                if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    ac.abort()
                    resolve(true)
                }
            }

            const events = ['canplaythrough',
                            'loadeddata']
            events.forEach(event =>
                videoElement.addEventListener(event, handler, { signal: ac.signal })
            )

            const TIMEOUT = 5_000
            setTimeout(() => {
                ac.abort()
                resolve(false)
            }, TIMEOUT)
        })
    },
    async checkVideoCanplaythrough(videoElement) {
        const canplaythrough = await this.isVideoCanplaythrough(videoElement)
        if (canplaythrough) {
            eventBus.emit('video:canplaythrough')
            logger.info('视频资源｜可以播放')
        }
    },
    async autoSelectPlayerMode() {
        const selectPlayerModeStrategies = [
            {
                type: 'wide',
                action: async () => {
                    const playerModeWideEnterButton = await elementSelectors.playerModeWideEnterButton
                    playerModeWideEnterButton.click()
                }
            },
            {
                type: 'web',
                action: async () => {
                    const playerModeWebEnterButton = await elementSelectors.playerModeWebEnterButton
                    playerModeWebEnterButton.click()
                }
            },
            {
                type: 'normal',
                action: async () => {
                    logger.info('屏幕模式丨功能已关闭')
                    eventBus.emit('video:playerModeSelected')
                }
            }
        ]

        selectPlayerModeStrategies.find(strategy => strategy.type === this.userConfigs.selected_player_mode).action()
        await sleep(300)
        if (this.userConfigs.selected_player_mode !== 'normal') {
            if (await this.isPlayerModeSwitchSuccess(this.userConfigs.selected_player_mode, await elementSelectors.video)) {
                logger.info(`屏幕模式丨${this.userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
                eventBus.emit('video:playerModeSelected')
            }
        }
    },
    async isPlayerModeSwitchSuccess(selectedPlayerMode, videoElement) {
        const playerContainer = await elementSelectors.playerContainer
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        const observer = isElementSizeChange(videoElement, async (changed, _) => {
            if (changed) {
                const currentPlayerMode = playerContainer.getAttribute('data-screen')
                if (currentPlayerMode === selectedPlayerMode) {
                    observer.disconnect()
                    return true
                }
            }
        })
        this.autoSelectPlayerMode()
    },
    async autoLocateToPlayer() {
        if (!this.userConfigs.auto_locate) {
            logger.info('自动定位丨功能已关闭')
            eventBus.emit('video:locateToPlayer')
        }
        await sleep(300)
        this.locateToPlayer()
        logger.info('自动定位丨成功')
        eventBus.emit('video:locateToPlayer')
    },
    async locateToPlayer() {
        const playerContainerOffsetTop = await getElementOffsetToDocumentTop(await elementSelectors.playerContainer)
        const headerComputedStyle = getElementComputedStyle(await elementSelectors.headerMini, ['position',
                                                                                                'height'])
        // logger.debug(headerComputedStyle.position, headerComputedStyle.height)
        const playerOffsetTop = headerComputedStyle.position === 'fixed' ? playerContainerOffsetTop - parseInt(headerComputedStyle.height) : playerContainerOffsetTop
        documentScrollTo(playerOffsetTop - this.userConfigs.offset_top)
        eventBus.emit('video:startOtherFunctions')
    },
    async clickPlayerAutoLocate() {
        if (!this.userConfigs.click_player_auto_locate) return
        addEventListenerToElement(await elementSelectors.video, 'click', () => {
            this.locateToPlayer()
            eventBus.emit('logger:show', '点击播放器自动定位丨成功')
        })
    },
    handleExecuteFunctionsSequentially() {
        const functions = [
            this.clickPlayerAutoLocate
        ]
        executeFunctionsSequentially(functions)
    }
}
