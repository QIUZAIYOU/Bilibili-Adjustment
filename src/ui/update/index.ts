/**
 * 更新通知面板懒加载入口
 *
 * 遵守「Vue 入口必须懒加载」红线：弹窗内容挂载前不加载 Vue 运行时与 SFC。
 * 组件与 Vue API 都从桥模块 ./lazy-panel.js 取（同源，避免双运行时实例）。
 */
const isComponent = (value: unknown): boolean => {
    if (typeof value === 'function') return true
    if (!value || typeof value !== 'object') return false
    // 兼容选项对象形态的组件（render/setup/template/props 任一存在即视为组件）
    const component = value as { render?: unknown; setup?: unknown; template?: unknown; props?: unknown }
    return Boolean(component.render || component.setup || component.template || component.props)
}
/**
 * 挂载更新通知面板（openAdjustmentDialog 的 content 回调里调用）
 * @param {HTMLElement} mountEl 内容区挂载点
 * @param {object} options
 * @param {string} [options.currentVersion]
 * @param {string} [options.latestVersion]
 * @param {Array<{version: string, desc: string}>} [options.items]
 * @param {boolean} [options.isLatest] 已是最新版本（不展示更新列表，只提示已是最新）
 * @returns {Promise<{unmount: Function}>}
 */
/** 挂载选项 */
export interface MountUpdateNoticeOptions {
    currentVersion?: string
    latestVersion?: string
    items?: Array<{ version: string; desc: string }>
    /** 已是最新版本（不展示更新列表，只提示已是最新） */
    isLatest?: boolean
}
/** 挂载结果（弹窗关闭即调用 unmount） */
export interface PanelHandle {
    unmount: () => void
}
export const mountUpdateNoticePanel = async (mountEl: HTMLElement, options: MountUpdateNoticeOptions = {}): Promise<PanelHandle> => {
    const currentVersion = options.currentVersion || ''
    const latestVersion = options.latestVersion || ''
    const items = Array.isArray(options.items) ? options.items : []
    const isLatest = options.isLatest === true
    const panelModule = await import('./lazy-panel')
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
