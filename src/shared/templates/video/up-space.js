/**
 * UP 主空间相关模板
 *
 * - `upSpaceUrl`：空间页地址（`[[MID]]` 由调用点替换）。放在注册表里而不是写死在模块中：
 *   `space.bilibili.com` 是 B 站结构，改版时改服务器上的 hot-config/templates.js 即可生效。
 *   弹窗模式会在该地址后追加 `UP_SPACE_POPUP_FLAG` 参数，供 iframe 内的脚本应用弹窗专用样式。
 */
import { UP_SPACE_POPUP_FLAG } from '@/shared/constants'
export const upSpaceTemplates = {
    upSpaceUrl: '//space.bilibili.com/[[MID]]'
}
/** 空间页地址模板里的 mid 占位符 */
const UP_SPACE_URL_MID = '[[MID]]'
/**
 * 拼空间页地址（模板来自注册表，可热更）
 *
 * 放在这里而不是各调用点各写一份：预览弹窗与播放页侧栏都要用同一个地址，
 * 而它们分属不同的产物 chunk —— 各自实现会让这段逻辑在产物里出现两份。
 * @param {string | number} mid UP 主 mid
 * @param {boolean} [forPopup] 弹窗模式：追加识别参数，供 iframe 内的脚本应用弹窗样式
 * @returns {string} 空间页地址
 */
export const buildUpSpaceUrl = (mid, forPopup = false) => {
    const base = String(upSpaceTemplates.upSpaceUrl).replaceAll(UP_SPACE_URL_MID, encodeURIComponent(String(mid)))
    return forPopup ? `${base}?${UP_SPACE_POPUP_FLAG}=1` : base
}
