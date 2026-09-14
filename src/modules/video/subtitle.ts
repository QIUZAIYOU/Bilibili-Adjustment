import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { STORAGE_KEYS } from '@/shared/constants'
import { renderSubtitleButton } from '@/shared/templates/subtitle/subtitle-switch'
import { createElementAndInsert, addEventListenerToElement, initializeCheckbox, showPlayerTooltip, hidePlayerTooltip } from '@/utils/common'
const logger = new LoggerService('VideoModule')
/** 视频模块特性上下文（由 video.module 的模块实例混入，特性方法以 this 访问） */
interface SubtitleFeatureContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _lastSubtitleState: string | null
    _subtitleUserClickHandler?: ((event: MouseEvent) => void) | null
}
export const subtitleFeatures = {
    initSubtitleStateMemory (this: SubtitleFeatureContext): void {
        // tab 会话级记忆：用户手动操作字幕菜单时记录开关状态，切换选集/视频时据此决定是否跳过自动开启
        this._lastSubtitleState = sessionStorage.getItem(STORAGE_KEYS.SESSION_LAST_SUBTITLE_STATE) || null
        this._subtitleUserClickHandler = (event: MouseEvent) => {
            const target = event.target as Element | null
            if (!target?.closest?.('[data-lan], [data-action="close"], [aria-label="字幕"]')) return
            setTimeout(() => {
                elementSelectors.wait('subtitleLanguageChineseAI').then(el => {
                    if (!el) return
                    this._lastSubtitleState = el.classList.contains('bpx-state-active') ? 'on' : 'off'
                    sessionStorage.setItem(STORAGE_KEYS.SESSION_LAST_SUBTITLE_STATE, this._lastSubtitleState)
                    logger.debug(`视频字幕丨已记忆字幕开关状态: ${this._lastSubtitleState === 'on' ? '开启' : '关闭'}`)
                })
            }, 250)
        }
        // 捕获阶段监听：B站 字幕菜单项可能在播放器内部多层嵌套，捕获阶段确保命中任意字幕语言项
        document.addEventListener('click', this._subtitleUserClickHandler as EventListener, true)
        this._cleanup.push(() => document.removeEventListener('click', this._subtitleUserClickHandler as EventListener, true))
    },
    async autoEnableSubtitle (this: SubtitleFeatureContext): Promise<void> {
        if (this.userConfigs.auto_subtitle) {
            const switchSubtitleButton = elementSelectors.get('switchSubtitleButton')
            if (!switchSubtitleButton) return
            const subtitleButton = await elementSelectors.wait('subtitleLanguageChineseAI') as HTMLElement | null
            if (!subtitleButton) {
                logger.warn('视频字幕（中文AI）丨未找到字幕按钮，可能页面结构已变更')
                return
            }
            // 记忆保持：用户手动关闭过字幕时，切换选集/视频不再自动重新开启
            if (this.userConfigs.preserve_subtitle_state && this._lastSubtitleState === 'off') {
                logger.debug('视频字幕（中文AI）丨用户已手动关闭，保持关闭状态，跳过自动开启')
                return
            }
            subtitleButton.click()
            if (subtitleButton.classList.contains('bpx-state-active')) {
                logger.info('视频字幕（中文AI）丨已开启')
            }
        }
    },
    async insertAutoEnableSubtitleSwitchButton (this: SubtitleFeatureContext): Promise<void> {
        const [playerDanmuSetting, playerTooltipArea, AutoSubtitle] = await elementSelectors.batch(['playerDanmuSetting', 'playerTooltipArea', 'AutoSubtitle'])
        // 检查是否已经存在自动开启字幕的开关按钮
        const existingSwitchButton = document.getElementById('autoEnableSubtitleSwitchButton')
        const existingTip = document.getElementById('autoEnableSubtitleTip')
        if (existingSwitchButton && existingTip) {
            logger.debug('自动开启字幕开关丨已存在，跳过插入')
            return
        }
        const autoEnableSubtitleSwitchButton = createElementAndInsert(renderSubtitleButton('autoEnableSubtitleSwitchButton', {
            autoSubtitle: this.userConfigs.auto_subtitle
        }), playerDanmuSetting as Node, 'after') as HTMLElement
        const autoEnableSubtitleTip = createElementAndInsert(renderSubtitleButton('autoEnableSubtitleSwitchButtonTip', {
            autoEnableSubtitleSwitchButtonTipText: this.userConfigs.auto_subtitle ? '关闭自动开启字幕' : '开启自动开启字幕'
        }), playerTooltipArea as Node, 'append') as HTMLElement
        const [AutoEnableSubtitleSwitchInput, AutoEnableSubtitleTooltipTitle] = await elementSelectors.batch(['AutoEnableSubtitleSwitchInput', 'AutoEnableSubtitleTooltipTitle'])
        // batch 返回 Element|null：按各控件的真实类型收窄（缺失时与原实现一样在访问处抛出）
        const switchInput = AutoEnableSubtitleSwitchInput as HTMLInputElement | null
        const tooltipTitle = AutoEnableSubtitleTooltipTitle as HTMLElement | null
        const autoSubtitleInput = AutoSubtitle as HTMLInputElement | null
        initializeCheckbox(switchInput, this.userConfigs, 'auto_subtitle')
        addEventListenerToElement(switchInput, 'change', async e => {
            const isChecked = (e.target as HTMLInputElement).checked
            await storageService.userSet('auto_subtitle', Boolean(isChecked))
            requestAnimationFrame(() => {
                switchInput!.checked = isChecked
                switchInput!.toggleAttribute('checked', isChecked)
                tooltipTitle!.innerText = isChecked ? '关闭自动开启字幕' : '开启自动开启字幕'
                if (autoSubtitleInput) {
                    autoSubtitleInput.checked = isChecked
                    autoSubtitleInput.toggleAttribute('checked', isChecked)
                }
            })
        })
        addEventListenerToElement(autoEnableSubtitleSwitchButton, 'mouseover', () => {
            showPlayerTooltip(autoEnableSubtitleSwitchButton, autoEnableSubtitleTip)
        })
        addEventListenerToElement(autoEnableSubtitleSwitchButton, 'mouseout', () => {
            hidePlayerTooltip(autoEnableSubtitleTip)
        })
    }
}
