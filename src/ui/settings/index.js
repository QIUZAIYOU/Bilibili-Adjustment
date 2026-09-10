/**
 * Vue 设置面板懒加载入口
 *
 * 遵守「Vue 入口必须懒加载」红线：设置弹窗打开前不加载 Vue 运行时与 SFC。
 * 宿主（settings-component-v2）在渲染弹窗壳后调用 mountVueSettingsPanel 挂载面板，
 * 并在弹窗关闭时调用返回的 unmount（否则 Vue 实例与响应式副作用会泄漏）。
 *
 * ⚠️ 数据代理约定（务必遵守，历史上踩过 Maximum call stack size exceeded）：
 * - `schema` 是静态配置（含函数与嵌套数组），一律 `markRaw`，**不做深度代理**；
 * - `configs` / `dynamicOptions` 以「普通对象快照 + 整体替换」方式传递，
 *   绝不让 Vue 深度代理面板内部的数组/嵌套对象（代理数组上迭代会形成代理递归）。
 *   宿主更新方式：`bridge.configs = { ...bridge.configs, [key]: value }`、
 *   `bridge.dynamicOptions = { ...bridge.dynamicOptions, ai_model: list }`。
 */
/**
 * 判断动态导入结果是否可作为 Vue 组件使用
 * 兼容：函数式组件、带 setup/render/template 的选项对象
 */
const isComponent = value => {
    if (typeof value === 'function') return true
    if (!value || typeof value !== 'object') return false
    return Boolean(value.render || value.setup || value.template || value.props)
}
/**
 * 挂载 Vue 设置面板
 * @param {HTMLElement} mountEl 挂载点元素
 * @param {object} options
 * @param {Array} options.schema 设置项 schema（videoSettingsConfig / dynamicSettingsConfig）
 * @param {object} options.configs 配置值快照（扁平标量 map）
 * @param {object} [options.dynamicOptions] 动态选项快照（模型列表等）
 * @param {(key:string, value:any)=>void} [options.onChange] 配置变更回调
 * @param {(key:string)=>void} [options.onValidate] 校验按钮回调
 * @param {(key:string)=>void} [options.onRefresh] 刷新按钮回调
 * @param {(error:Error)=>void} [options.onError] 渲染期错误回调（宿主据此回退经典渲染器）
 * @returns {Promise<{bridge: object, unmount: Function}>}
 */
export const mountVueSettingsPanel = async (mountEl, options = {}) => {
    const { schema, configs, dynamicOptions = {}, onChange, onValidate, onRefresh, onError } = options
    // 注意：动态导入的是 lazy-panel.js（内部静态 import SFC 并做命名导出），
    // 而不是直接 import('./SettingsPanelV3.vue')：产物以 SystemJS 承载模块，
    // 动态导入 .vue 得到的命名空间在运行时取不到 default（会导致 Vue mount 报 reading 'render'）。
    const [{ createApp, shallowReactive, markRaw }, panelModule] = await Promise.all([
        import('vue'),
        import('./lazy-panel.js')
    ])
    const PanelComponent = panelModule?.SettingsPanelV3Component || panelModule?.default
    if (!isComponent(PanelComponent)) {
        const keys = panelModule ? Object.keys(panelModule).join(',') : '模块为空'
        throw new Error(`设置面板组件解析失败（模块导出：${keys}）`)
    }
    // bridge：宿主 ↔ 组件 的浅层响应式桥。只有顶层属性（configs / dynamicOptions 的引用）
    // 变化才触发面板重渲染；面板内部始终是普通数组/对象，从根本上避免代理递归爆栈。
    const bridge = shallowReactive({
        schema: markRaw(schema),
        configs: { ...configs },
        dynamicOptions: { ...dynamicOptions }
    })
    if (!mountEl) return { bridge, unmount: () => {} }
    const app = createApp(PanelComponent, {
        schema: bridge.schema,
        configs: bridge.configs,
        dynamicOptions: bridge.dynamicOptions,
        onChange: (key, value) => onChange?.(key, value),
        onValidate: key => onValidate?.(key),
        onRefresh: key => onRefresh?.(key)
    })
    // 渲染期错误（含渲染函数/响应式异常）交回宿主，避免静默失败留下空白面板
    app.config.errorHandler = error => {
        onError?.(error)
    }
    app.mount(mountEl)
    let unmounted = false
    return {
        bridge,
        unmount: () => {
            if (unmounted) return
            unmounted = true
            try {
                app.unmount()
            } catch { /* 忽略卸载异常 */ }
        }
    }
}
