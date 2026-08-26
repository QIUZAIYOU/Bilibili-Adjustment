import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { getElementComputedStyle } from '@/utils/common'
const logger = new LoggerService('VideoModule')
export const qualityFeatures = {
    async autoSelectVideoHighestQuality () {
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
        const qualityList = Array.from(await elementSelectors.queryAll('qualitySwitchButtons'))
            .map(btn => ({
                value: +btn.dataset.value,
                element: btn,
                isVIP: btn.children.length < 2
            }))
            .sort((a, b) => b.value - a.value)
        const availableQualities = qualityList.filter(q =>
            this.userConfigs.is_vip ? true : q.isVIP)
        const targetQuality = availableQualities.find(q => {
            if (!this.userConfigs.is_vip) return true
            if (this.userConfigs.contain_quality8k && q.value === 127) return true
            if (this.userConfigs.contain_quality4k && q.value === 120) return true
            return q.value < 120
        })
        // logger.debug(qualityList, availableQualities, targetQuality)
        if (targetQuality) {
            targetQuality.element.click()
            logger.info(`最高画质｜${this.userConfigs.is_vip ? 'VIP' : '非VIP'}｜${qualityMap[targetQuality.value] || targetQuality.value
            }｜切换成功`)
        }
    },
    async autoCancelMute () {
        const batchSelectors = ['mutedButton', 'volumeButton']
        const [mutedButton, volumeButton] = await elementSelectors.batch(batchSelectors)
        if (!mutedButton || !volumeButton) return
        const styles = {
            muted: getElementComputedStyle(mutedButton),
            volume: getElementComputedStyle(volumeButton)
        }
        if (styles.muted.display === 'block' || styles.volume.display === 'none') {
            mutedButton.click()
            logger.info('静音丨已关闭')
        }
    },
    async autoEnableHiResMode (){
        // const highResButton = await elementSelectors.highResButton
        const highResButton = await elementSelectors.query('highResButton')
        if (highResButton && !highResButton.className.includes('bpx-state-active')){
            highResButton.click()
            logger.info('Hi-Res无损音质丨已启用')
        }
    }
}
