/**
 * 更新通知面板懒加载入口
 *
 * 遵守「Vue 入口必须懒加载」红线：弹窗内容挂载前不加载 Vue 运行时与 SFC。
 * 组件与 Vue API 都从桥模块 ./lazy-panel.js 取（同源，避免双运行时实例）。
 */
const isComponent = value => {
    if (typeof value === 'function') return true
    if (!value || typeof value !== 'object') return false
    return Boolean(value.render || value.setup || value.template || value.props)
}
/**
 * 挂载更新通知面板（openAdjustmentDialog 的 content 回调里调用）
 * @param {HTMLElement} mountEl 内容区挂载点
 * @param {object} options
 * @param {string} [options.currentVersion]
 * @param {string} [options.latestVersion]
 * @param {Array<{version: string, desc: string}>} [options.items]
 * @returns {Promise<{unmount: Function}>}
 */
export const mountUpdateNoticePanel = async (mountEl, options = {}) => {
    const currentVersion = options.currentVersion || ''
    const latestVersion = options.latestVersion || ''
    const items = Array.isArray(options.items) ? options.items : []
    const isLatest = options.isLatest === true
    const panelModule = await import('./lazy-panel.js')
    const { UpdateNoticePanelComponent, createApp } = panelModule || {}
    if (!isComponent(UpdateNoticePanelComponent)) {
        const keys = panelModule ? Object.keys(panelModule).join(',') : '模块为空'
        throw new Error(`更新面板组件解析失败（模块导出：${keys}）`)
    }
    if (typeof createApp !== 'function') {
        throw new Error('更新面板运行时异常（桥模块未导出同源的 Vue API）')
    }
    if (!mountEl) return { unmount: () => {} }
    // 弹窗「关闭即销毁、重开重建」，props 为一次性快照，无需响应式代理
    const app = createApp(UpdateNoticePanelComponent, {
        currentVersion: String(currentVersion ?? ''),
        latestVersion: String(latestVersion ?? ''),
        items: Array.isArray(items) ? items : [],
        isLatest
    })
    app.mount(mountEl)
    let unmounted = false
    return {
        unmount: () => {
            if (unmounted) return
            unmounted = true
            try {
                app.unmount()
            } catch { /* 忽略卸载异常 */ }
        }
    }
}
