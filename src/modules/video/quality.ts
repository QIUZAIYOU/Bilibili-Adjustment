import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { getElementComputedStyle } from '@/utils/common'
const logger = new LoggerService('VideoModule')
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface QualityFeatureContext {
    userConfigs: Record<string, unknown>
}
export const qualityFeatures = {
    async autoSelectVideoHighestQuality (this: QualityFeatureContext): Promise<void> {
        const qualityMap: Record<number, string> = {
            127: '8K超清',
            120: '4K超清',
            116: '1080P60',
            112: '1080P高码率',
            80: '1080P高清',
            64: '720P高清',
            32: '480P清晰',
            16: '360P流畅'
        }
        const qualityList = Array.from(elementSelectors.queryAll('qualitySwitchButtons'))
            .map(btn => {
                const el = btn as HTMLElement
                return {
                    value: Number(el.dataset.value),
                    element: el,
                    isVIP: el.children.length < 2
                }
            })
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
    async autoCancelMute (): Promise<void> {
        const batchSelectors = ['mutedButton', 'volumeButton']
        const [mutedButtonEl, volumeButtonEl] = await elementSelectors.batch(batchSelectors)
        const mutedButton = mutedButtonEl as HTMLElement | null
        const volumeButton = volumeButtonEl as HTMLElement | null
        if (!mutedButton || !volumeButton) return
        const styles = {
            muted: getElementComputedStyle(mutedButton) as { display?: string },
            volume: getElementComputedStyle(volumeButton) as { display?: string }
        }
        if (styles.muted.display === 'block' || styles.volume.display === 'none') {
            mutedButton.click()
            logger.info('静音丨已关闭')
        }
    },
    async autoEnableHiResMode (): Promise<void> {
        // const highResButton = await elementSelectors.highResButton
        const highResButton = elementSelectors.get('highResButton') as HTMLElement | null
        if (highResButton && !highResButton.className.includes('bpx-state-active')){
            highResButton.click()
            logger.info('Hi-Res无损音质丨已启用')
        }
    }
}
