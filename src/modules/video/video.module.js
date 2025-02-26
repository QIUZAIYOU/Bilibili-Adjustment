import { eventBus } from '@/core/event-bus'
import { StorageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { sleep, isElementSizeChange, isVideoCanplaythrough, isPlayerModeSwitchSuccess } from '@/utils/common'

const logger = new LoggerService('VideoModule')
const storage = new StorageService()
let userConfigs = []

export default {
    name: 'video',
    dependencies: [],
    version: '1.0.0',

    async install() {
        storage.getAll().then(data => {userConfigs = data.results})
        this.initEventListeners()
        this.checkVideoCanplaythrough(await elementSelectors.video)
    },
    initEventListeners() {
        eventBus.on('video:canplaythrough', this.autoSelectPlayerMode)
        eventBus.on('video:playerModeSelected', this.autoScrollToVideo)
    },
    async checkVideoCanplaythrough(videoElement) {
        const canplaythrough = await isVideoCanplaythrough(videoElement)
        if (canplaythrough) eventBus.emit('video:canplaythrough')
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
                }
            }
        ]
        selectPlayerModeStrategies.find(strategy => strategy.type === userConfigs.selected_player_mode).action()
        if (userConfigs.selected_player_mode !== 'normal' && isPlayerModeSwitchSuccess(userConfigs.selected_player_mode, await elementSelectors.video)) {
            logger.info(`屏幕模式丨${userConfigs.selected_player_mode === 'wide' ? '宽屏' : '网页全屏'}丨切换成功`)
            eventBus.emit('video:playerModeSelected')
        }
    },
    autoScrollToVideo() {
        logger.info('autoScrollToVideo')
    }
}
