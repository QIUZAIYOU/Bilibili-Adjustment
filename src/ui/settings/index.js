/**
 * Vue 设置面板懒加载入口
 *
 * 遵守「Vue 入口必须懒加载」红线：设置弹窗打开前不加载 Vue 运行时与 SFC。
 * 宿主（settings-component-v2）在渲染弹窗壳后调用 mountVueSettingsPanel 挂载面板，
 * 并在弹窗关闭时调用返回的 unmount（否则 Vue 实例与响应式副作用会泄漏）。
 *
 * ⚠️ 两条务必遵守的约束：
 * 1) **Vue API 与组件同源**：产物按 chunk 分别压缩，`import('vue')` 得到的是一份独立的
 *    `vue.runtime.esm-bundler` chunk，与 SFC 依赖的 `runtime-core`/`runtime-dom` 是
 *    **两个 Vue 运行时实例** → 响应式与事件系统不互通（面板不刷新、change 不触发）。
 *    因此这里不再 `import('vue')`，而是从桥模块 `./lazy-panel.js` 取同一份 createApp/reactive/markRaw。
 * 2) **数据源是宿主自身持有的对象**：`configs` / `dynamicOptions` 直接对它做 `reactive` 代理，
 *    宿主就地写属性即触发面板重渲染；**不要拷贝对象**（拷贝后代理的目标与宿主写入目标不一致，
 *    面板不会更新）。`schema` 静态，`markRaw` 不代理。
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
 * @param {object} options.configs 配置值 map（**宿主自身持有的对象**，扁平标量）
 * @param {object} [options.dynamicOptions] 动态选项 map（**宿主自身持有的对象**，如模型列表）
 * @param {(key:string, value:any)=>void} [options.onChange] 配置变更回调
 * @param {(key:string)=>void} [options.onValidate] 校验按钮回调
 * @param {(key:string)=>void} [options.onRefresh] 刷新按钮回调
 * @param {(error:Error)=>void} [options.onError] 渲染期错误回调（宿主据此回退经典渲染器）
 * @returns {Promise<{bridge: object, unmount: Function}>}
 */
export const mountVueSettingsPanel = async (mountEl, options = {}) => {
    const { schema, configs, dynamicOptions = {}, onChange, onValidate, onRefresh, onError } = options
    // 桥模块只被动态 import（懒加载红线）；它同时导出组件与**同源**的 Vue API
    const panelModule = await import('./lazy-panel.js')
    const { SettingsPanelV3Component, createApp, reactive, markRaw } = panelModule || {}
    const PanelComponent = SettingsPanelV3Component || panelModule?.default
    if (!isComponent(PanelComponent)) {
        const keys = panelModule ? Object.keys(panelModule).join(',') : '模块为空'
        throw new Error(`设置面板组件解析失败（模块导出：${keys}）`)
    }
    if (typeof createApp !== 'function' || typeof reactive !== 'function' || typeof markRaw !== 'function') {
        throw new Error('设置面板运行时异常（桥模块未导出同源的 Vue API）')
    }
    // bridge：对宿主持有的同一批对象做代理（就地写入即触发面板更新）
    const bridge = {
        schema: markRaw(schema),
        configs: reactive(configs || {}),
        dynamicOptions: reactive(dynamicOptions)
    }
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
