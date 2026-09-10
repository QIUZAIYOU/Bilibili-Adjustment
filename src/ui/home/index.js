/**
 * 首页推荐历史「列表区」面板懒加载入口
 *
 * 遵守「Vue 入口必须懒加载」红线：弹窗打开前不加载 Vue 运行时与 SFC。
 * 组件与 Vue API 都从桥模块 ./lazy-panel.js 取（同源，避免双运行时实例）。
 */
const isComponent = value => {
    if (typeof value === 'function') return true
    if (!value || typeof value !== 'object') return false
    return Boolean(value.render || value.setup || value.template || value.props)
}
/**
 * 挂载历史列表面板
 * @param {HTMLElement} mountEl 挂载点（宿主弹窗内）
 * @param {object} options
 * @param {Array} options.records 已排序的记录数组
 * @param {HTMLElement|null} [options.searchInput] 宿主模板内的搜索输入框
 * @returns {Promise<{unmount: Function}>}
 */
export const mountHomeHistoryPanel = async (mountEl, options = {}) => {
    const { records = [], searchInput = null } = options
    const panelModule = await import('./lazy-panel.js')
    const { HomeHistoryPanelComponent, createApp } = panelModule || {}
    if (!isComponent(HomeHistoryPanelComponent)) {
        const keys = panelModule ? Object.keys(panelModule).join(',') : '模块为空'
        throw new Error(`历史面板组件解析失败（模块导出：${keys}）`)
    }
    if (typeof createApp !== 'function') {
        throw new Error('历史面板运行时异常（桥模块未导出同源的 Vue API）')
    }
    if (!mountEl) return { unmount: () => {} }
    // records 为一次性快照（弹窗「关闭即销毁、重开重建」），无需响应式代理
    const app = createApp(HomeHistoryPanelComponent, {
        records: Array.isArray(records) ? records : [],
        searchInput: searchInput || null
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
