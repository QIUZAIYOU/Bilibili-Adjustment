/**
 * 首页「脚本设置」入口按钮
 *
 * 首页没有自己的设置 schema（设置面板只认播放页/动态页），但用户是在首页使用首页功能，
 * 不该为了开一个首页开关先点进某个视频。这里把入口插进首页右下角的悬浮按钮组
 * `.palette-button-wrap`（稍后再看/刷新/客服/顶部都在那里），**只要图标不要文字**，
 * 图标与番剧页侧栏的设置按钮同一颗齿轮；点击开的仍是同一套设置弹窗。
 *
 * 选择器与模板都取自注册表（可热更），模块里不写死 B 站类名。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { getTemplates } from '@/shared/templates'
import { addEventListenerToElement, createElementAndInsert } from '@/utils/common'
/** 按钮类名（样式在 shared/styles/home-page.js，幂等复用也按它判断） */
export const HOME_SETTINGS_BUTTON_CLASS = 'adj-palette-settings-btn'
/**
 * 把设置按钮插进首页悬浮按钮组；已存在则直接复用（幂等）
 * @param onClick 点击回调（由调用方接上设置弹窗宿主）
 * @returns 按钮元素；页面没有该按钮组（非首页/版式变化）时返回 null
 */
export const insertHomeSettingsButton = (onClick: () => void): HTMLElement | null => {
    const wrap = elementSelectors.get('homePaletteButtonWrap')
    if (!wrap) return null
    const existing = wrap.querySelector(`.${HOME_SETTINGS_BUTTON_CLASS}`)
    if (existing) return existing as HTMLElement
    const button = createElementAndInsert(getTemplates.homeSettingsButton, wrap) as HTMLElement | null
    if (!button) return null
    // 悬浮按钮组自身及其它子项都有 click 行为（换一换等）：这里必须拦住冒泡，避免顺带触发它们
    addEventListenerToElement(button, 'click', (event: Event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
    })
    return button
}
/** 移除已插入的设置按钮（关闭/卸载时清理） */
export const removeHomeSettingsButton = (): void => {
    document.querySelectorAll(`.${HOME_SETTINGS_BUTTON_CLASS}`).forEach(el => el.remove())
}
