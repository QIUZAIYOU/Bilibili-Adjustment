/**
 * UP 主空间相关模板
 *
 * - `upSpaceUrl`：空间页地址（`[[MID]]` 由调用点替换）。放在注册表里而不是写死在模块中：
 *   `space.bilibili.com` 是 B 站结构，改版时改服务器上的 hot-config/templates.js 即可生效。
 *   弹窗模式会在该地址后追加 `UP_SPACE_POPUP_FLAG` 参数，供 iframe 内的脚本应用弹窗专用样式。
 */
export const upSpaceTemplates = {
    upSpaceUrl: '//space.bilibili.com/[[MID]]'
}
