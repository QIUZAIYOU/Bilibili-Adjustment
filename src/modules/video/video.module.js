import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { sleep, debounce, isElementSizeChange, documentScrollTo, getElementOffsetToDocumentTop, getElementComputedStyle, addEventListenerToElement, executeFunctionsSequentially, isTabActive, monitorHrefChange } from '@/utils/common'

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
        this.initMonitors()
        if (isTabActive()) {
            logger.info('标签页｜已激活')
            this.checkVideoCanplaythrough(await elementSelectors.video)
        }
    },
    async initEventListeners() {
        eventBus.on('logger:show', (_, { type, message }) => {
            logger[type](message)
        })
        eventBus.on('video:canplaythrough', debounce(this.autoSelectPlayerMode, 500, true))
        eventBus.on('video:playerModeSelected', debounce(this.autoLocateToPlayer, 500, true))
        eventBus.on('video:startOtherFunctions', debounce(this.handleExecuteFunctionsSequentially, 500, true))
    },
    initMonitors() {
        monitorHrefChange(() => {
            this.locateToPlayer()
        })
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

            // const TIMEOUT = 1e4
            // setTimeout(() => {
            //     ac.abort()
            //     logger.debug('视频资源丨加载超时')
            //     resolve(false)
            // }, TIMEOUT)
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
        storageService.set('player_offset_top', await getElementOffsetToDocumentTop(playerContainer))
        const playerMode = playerContainer.getAttribute('data-screen')
        logger.debug(`屏幕模式丨当前模式：${playerMode}，目标模式：${selectedPlayerMode}`)
        if (playerMode === selectedPlayerMode) return true
        // eslint-disable-next-line no-unused-vars
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
        const playerContainer = await elementSelectors.playerContainer
        const playerMode = playerContainer.getAttribute('data-screen')
        const playerContainerOffsetTop = playerMode !== 'mini' ? await getElementOffsetToDocumentTop(playerContainer) : this.userConfigs.player_offset_top
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
        })
    },
    async autoSelectVideoHighestQuality() {
        if (!this.userConfigs.auto_select_video_highest_quality) return
        const qualityList = Array.from(await elementSelectors.all('qualitySwitchButtons'))
            .map(btn => ({
                value: +btn.dataset.value,
                element: btn,
                isVIP: btn.children.length < 2
            }))
            .sort((a, b) => b.value - a.value)
        const availableQualities = qualityList.filter(q =>
            this.userConfigs.is_vip ? true : q.isVIP
        )
        const targetQuality = availableQualities.find(q => {
            if (!this.userConfigs.is_vip) return true
            if (this.userConfigs.contain_quality_8k && q.value === 127) return true
            if (this.userConfigs.contain_quality_4k && q.value === 120) return true
            return q.value < 120
        })
        if (targetQuality) {
            targetQuality.element.click()
            const qualityMap = {
                127: '8K超清',
                120: '4K超清',
                116: '1080P60',
                112: '1080P高码率',
                80: '1080P高清',
                64: '720P高清',
                32: '480P清晰',
                16: '360P流畅'
            }
            logger.info(`最高画质｜${this.userConfigs.is_vip ? 'VIP' : '非VIP'}｜${qualityMap[targetQuality.value] || targetQuality.value
            }｜切换成功`)
        }
    },
    async autoCancelMute() {
        if (!this.userConfigs.auto_cancel_mute) return
        const [mutedButton,
               volumeButton] = await elementSelectors.batch([
            'mutedButton',
            'volumeButton'
        ])

        if (!mutedButton || !volumeButton) return

        const styles = {
            muted: getComputedStyle(mutedButton),
            volume: getComputedStyle(volumeButton)
        }

        if (styles.muted.display === 'block' || styles.volume.display === 'none') {
            mutedButton.click()
            logger.info('静音丨已关闭')
        }
    },
    async autoEnableSubtitle() {
        if (!this.userConfigs.auto_subtitle) return
        const switchSubtitleButton = await elementSelectors.switchSubtitleButton
        const enableStatus = switchSubtitleButton.children[0].children[0].children[0].children[1].childElementCount === 1
        if (!enableStatus) {
            switchSubtitleButton.children[0].children[0].click()
            logger.info('视频字幕丨已开启')
        }
    },
    handleExecuteFunctionsSequentially() {
        const functions = [
            this.clickPlayerAutoLocate,
            this.autoSelectVideoHighestQuality,
            this.autoCancelMute,
            this.autoEnableSubtitle
        ]
        executeFunctionsSequentially(functions)
    }
}
