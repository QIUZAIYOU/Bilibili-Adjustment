import { LoggerService } from '@/services/logger.service'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { elementSelectors } from '@/shared/element-selectors'
import { EVENT_NAMES } from '@/shared/constants'
import { detectivePageType, createElementAndInsert, addEventListenerToElement, enablePopoverLightDismiss } from '@/utils/common'
import { SettingsShellRenderer } from '@/components/settings-shell-renderer'
import { BUILD_SHA } from '@/shared/build-info'
import { enhanceCustomSelects, refreshCustomSelects } from '@/components/custom-select'
import { updateService } from '@/services/update.service'
import { videoSettingsConfig, dynamicSettingsConfig } from '@/config/settings-config'
import { fetchModels, clearModelCache, validateApiKey } from '@/services/ai.service'
import { initTooltip, destroyTooltip, bindTooltipIcons } from '@/components/tooltip-component'
import { mountVueSettingsPanel } from '@/ui/settings'
import { pickActiveSection } from '@/ui/settings/nav-scroll-spy'
import type { NavSectionPosition } from '@/ui/settings/nav-scroll-spy'
import pkg from '../../package.json'
import type { SettingItemSchema } from '@/config/settings-config'
/** Vue 设置面板桥的返回形状（与 ui/settings/index.ts 的 VueSettingsPanelHandle 对应） */
interface VueSettingsPanelHandleLike {
    bridge: {
        schema?: unknown
        configs: Record<string, unknown>
        dynamicOptions: Record<string, unknown>
    }
    unmount: () => void
}
/** 设置弹窗根元素（带轻量关闭清理句柄） */
type SettingsPopover = HTMLElement & { __popoverDismissCleanup?: (() => void) | null }
/** 动态选项（如模型列表） */
type DynamicOptions = Record<string, Array<{ value: unknown; label: unknown }>>
/** 带反馈状态的按钮元素 */
type FeedbackButton = HTMLElement & {
    _feedbackOriginalText?: string
    _feedbackResetTimer?: ReturnType<typeof setTimeout> | null
}
const logger = new LoggerService('SettingsDialog')
/**
 * 设置面板显示的版本号：`v3.34.4+a1b2c3d`（构建期注入的 git 短 SHA）。
 * 取不到构建标识时只显示版本号，保持原样。
 */
const versionLabel = (): string => (BUILD_SHA ? `${pkg.version}+${BUILD_SHA}` : pkg.version)
/**
 * 设置弹窗宿主：负责弹窗壳渲染、与 Vue 设置面板的接线（挂载/卸载/配置与动态选项同步）、
 * 特殊联动（AI 凭证与模型、日志级别、字幕开关）、配置导入导出与版本检查。
 *
 * 表单本身由 Vue 面板（src/ui/settings/SettingsPanel.vue）按 settings-config 的 schema 渲染，本类不生成任何表单 DOM。
 */
export class SettingsDialogHost {
    userConfigs: Record<string, unknown>
    pageType: string | null
    /** Vue 设置面板应用实例（关闭/重建时 unmount） */
    _vuePanel: VueSettingsPanelHandleLike | null
    _vueBridge: VueSettingsPanelHandleLike['bridge'] | null
    /** Vue 响应式代理：宿主所有写入都必须经它们（写原始对象会绕过 set trap，面板不重渲染） */
    _vueConfigsProxy: Record<string, unknown> | null
    _vueDynamicOptionsProxy: DynamicOptions | null
    /** 当前面板使用的 schema（动态页为 dynamicSettingsConfig） */
    _activeSchema: SettingItemSchema[] | null
    _pendingModelOptions?: DynamicOptions
    _configSyncUnsubscribe?: (() => void) | null
    /** 「有新版本」事件的订阅清理句柄（弹窗重建时先解绑） */
    _updateAvailableUnsubscribe?: (() => void) | null
    /** 左侧分组导航的清理句柄（弹窗重建/卸载时解绑 observer 与滚动监听） */
    _settingsNavCleanup?: (() => void) | null
    constructor () {
        this.userConfigs = {}
        this.pageType = null
        // Vue 设置面板状态：
        // - _vuePanel：应用实例（关闭/重建时 unmount）
        // - _vueConfigsProxy / _vueDynamicOptionsProxy：**Vue 响应式代理**，宿主所有写入都必须经它们
        //   （写原始对象会绕过 Proxy 的 set trap，面板不会重渲染）
        this._vuePanel = null
        this._vueBridge = null
        this._vueConfigsProxy = null
        this._vueDynamicOptionsProxy = null
        this._activeSchema = null
    }
    /** 卸载 Vue 设置面板（幂等） */
    unmountVuePanel (): void {
        this._settingsNavCleanup?.()
        this._settingsNavCleanup = null
        if (this._vuePanel) {
            this._vuePanel.unmount()
            this._vuePanel = null
        }
        this._vueBridge = null
        this._vueConfigsProxy = null
        this._vueDynamicOptionsProxy = null
    }
    /**
     * 同步动态选项（模型列表等）到 Vue 面板
     *
     * 必须写**代理**（`bridge.dynamicOptions`）：写原始对象不会触发 Vue 的更新。
     * 代理与宿主对象共享同一 target，因此宿主侧读数也同步更新。
     */
    syncVueDynamicOptions (options: DynamicOptions): void {
        const target = this._vueDynamicOptionsProxy
        if (!target) return
        Object.assign(target, options)
    }
    /**
     * 挂载 Vue 设置面板
     * @param {HTMLElement} popover 设置弹窗根元素
     * @param {string} mountId 挂载点元素 id
     * @param {Array} schema 设置项 schema
     */
    async mountVuePanel (popover: SettingsPopover | null, mountId: string, schema: SettingItemSchema[]): Promise<VueSettingsPanelHandleLike | null> {
        this.unmountVuePanel()
        this._activeSchema = schema
        const mountEl = popover?.querySelector(`#${mountId}`) as HTMLElement | null
        if (!mountEl) return null
        // 动态选项对象必须与面板共享**同一引用**（面板对其做 reactive 代理，就地更新才触发重渲染）
        const dynamicOptions = this._pendingModelOptions || (this.userConfigs.ai_model
            ? { ai_model: [{ value: this.userConfigs.ai_model, label: this.userConfigs.ai_model }]}
            : { ai_model: []})
        this._pendingModelOptions = dynamicOptions
        try {
            const panel = await mountVueSettingsPanel(mountEl, {
                schema,
                // configs / dynamicOptions 传宿主自身持有的对象；面板据此建立**响应式代理**并回传，
                // 宿主后续所有写入必须走 these proxy（见 saveConfig / syncVueDynamicOptions）
                configs: this.userConfigs,
                dynamicOptions,
                onChange: (key, value) => this.handleVueConfigChange(key, value, popover),
                onValidate: key => this.handleValidateClick(key, popover),
                onRefresh: key => this.handleRefreshClick(key, popover),
                // 渲染期错误（如响应式/渲染函数异常）改为轻量提示，避免面板空白卡死
                onError: error => this.showPanelLoadFailure(error)
            })
            this._vuePanel = panel
            this._vueBridge = panel.bridge
            this._vueConfigsProxy = panel.bridge?.configs || null
            this._vueDynamicOptionsProxy = (panel.bridge?.dynamicOptions as DynamicOptions | undefined) || null
            return panel
        } catch (error) {
            this.showPanelLoadFailure(error)
            return null
        }
    }
    /**
     * Vue 面板不可用时的兜底提示（加载/渲染失败）
     *
     * 表单一律由 Vue 面板渲染（没有第二套实现可回退），故只在挂载点内显示轻量提示 + 重试按钮，
     * 保证用户能看见发生了什么并可自行重试；不会写库、不会改变任何配置。
     */
    showPanelLoadFailure (error: unknown): void {
        logger.error('Vue 设置面板不可用', error)
        // 先卸载可能已存在的 Vue 实例：若「挂载后才抛错」，实例仍在而容器会被清空，
        // 不卸载会导致实例残留与后续 patch 报错
        this.unmountVuePanel()
        const mountEl = document.querySelector('#VideoSettingsFormMount, #DynamicSettingsFormMount')
        if (!mountEl) return
        mountEl.textContent = ''
        const tip = document.createElement('div')
        tip.className = 'adjustment-panel-fallback'
        tip.textContent = '设置面板加载失败，请重试或刷新页面'
        const retry = document.createElement('div')
        retry.className = 'adjustment-button secondary'
        retry.textContent = '重试'
        retry.addEventListener('click', () => {
            // 重试再失败则再次走兜底提示；catch 避免 unhandled rejection
            Promise.resolve(this.render(this.pageType)).catch(err => this.showPanelLoadFailure(err))
        })
        mountEl.appendChild(tip)
        mountEl.appendChild(retry)
    }
    /**
     * Vue 面板配置变更统一处理：先归一（input 去空格 / checkbox 布尔化）再落库，最后跑特殊联动
     */
    async handleVueConfigChange (key: string, value: unknown, popover: SettingsPopover | null): Promise<void> {
        const item = this.findConfigItem(key)
        const oldValue = this.userConfigs[key]
        let next = value
        if (item?.type === 'input') next = String(value ?? '').trim()
        if (item?.type === 'checkbox') next = Boolean(value)
        await this.saveConfig(key, next)
        // 特殊联动逻辑（AI 凭证、日志级别、字幕开关、自定义模型等）
        if (item?.type === 'checkbox') {
            await this.handleSpecialCheckboxChange(key, next, popover)
        } else if (item?.type === 'input') {
            await this.handleSpecialInputChange(key, next, popover)
        } else if (item?.type === 'select') {
            await this.handleSpecialSelectChange(key, next, oldValue, popover)
        }
    }
    async init (userConfigs: Record<string, unknown>): Promise<void> {
        this.userConfigs = userConfigs
        // 弹窗重建时重新读取最新配置：Stylus「夜间哔哩」样式、其它标签页等**外部来源**
        // 会在设置弹窗关闭期间直接改存储，仅靠内存里的 userConfigs 会显示旧值
        //（主题二态自动切换依赖这里拿到 follow/night 的最新值）
        try {
            const latest = await storageService.getAll('user')
            if (latest && typeof latest === 'object') Object.assign(this.userConfigs, latest)
        } catch { /* 读取失败时沿用已有配置 */ }
        this.pageType = await detectivePageType()
        // 订阅其他标签页的配置变更，实时同步设置弹窗状态（只订阅一次，SPA 导航重复 init 不重复订阅）
        if (!this._configSyncUnsubscribe) {
            this._configSyncUnsubscribe = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, async (_ctx, ...args: unknown[]) => {
                const { key, value } = (args[0] ?? {}) as { key: string; value: unknown }
                // 写 Vue 响应式代理才会驱动面板刷新；但面板未挂载时（如设置弹窗关闭状态下
                // 由 Stylus 夜间样式、跨标签页等外部来源改配置）代理为 null，
                // 此时必须回退写宿主对象，否则既会抛错又丢失配置
                if (this._vueConfigsProxy) {
                    this._vueConfigsProxy[key] = value
                } else {
                    this.userConfigs[key] = value
                }
                // 自绘下拉替身需显式刷新：它包裹原生 select、不监听其 value 变化，
                // 外部来源改配置（如主题跟随 Stylus 夜间样式）时替身文本会停在旧值
                {
                    const popover = document.getElementById('VideoSettingsPopover') || document.getElementById('DynamicSettingsPopover')
                    if (popover) refreshCustomSelects(popover)
                }
                // 日志级别跨标签同步
                if (key.startsWith('log_level_')) {
                    await LoggerService.updateLogLevelsFromConfig(this.userConfigs)
                }
                // AI 凭证类配置变更时重新拉取模型列表，保持各标签页下拉选项一致
                if (key === 'ai_apikey' || key === 'ai_provider' || key === 'custom_base_url') {
                    const popover = document.getElementById('VideoSettingsPopover')
                    if (popover) {
                        await this.refreshModelList(popover)
                    }
                }
            })
        }
        await this.render(this.pageType)
    }
    /**
     * 打开设置弹窗：容器已在关闭时销毁，不存在则重新渲染再打开
     */
    async openSettings (): Promise<void> {
        const popoverId = this.pageType === 'dynamic' ? 'DynamicSettingsPopover' : 'VideoSettingsPopover'
        let popover = document.getElementById(popoverId)
        if (!popover) {
            await this.init(this.userConfigs)
            popover = document.getElementById(popoverId)
        }
        if (popover) popover.showPopover()
    }
    async render (pageType: string | null): Promise<void> {
        try {
            switch (pageType) {
                case 'video':
                    await this.renderVideoSettings()
                    await this.initVideoSettingsEventListeners()
                    break
                case 'dynamic':
                    await this.renderDynamicSettings()
                    await this.initDynamicSettingsEventListeners()
                    break
                default:
                    logger.debug(`不支持的页面类型: ${pageType}`)
                    break
            }
        } catch (error) {
            logger.error('设置面板渲染失败', error)
        }
    }
    // ==================== 视频页设置 ====================
    async renderVideoSettings (): Promise<void> {
        // 先检查是否已经存在设置面板，如果存在，就先移除它
        const existingSettings = document.getElementById('VideoSettingsPopover') as SettingsPopover | null
        if (existingSettings) {
            existingSettings.__popoverDismissCleanup?.()
            existingSettings.remove()
        }
        // 面板重建前先卸载旧的 Vue 实例（避免泄漏）
        this.unmountVuePanel()
        // 销毁旧的 tooltip
        destroyTooltip()
        // 弹窗壳由 SettingsShellRenderer 生成：表单挂载点本身即 .adjustment-form 容器，
        // 面板以多根 fragment 渲染，最终 DOM 为 .adjustment-popover > .adjustment-form > 各设置项
        const renderer = new SettingsShellRenderer()
        this._activeSchema = videoSettingsConfig
        const formContent = '<div class="adjustment-form" id="VideoSettingsFormMount"></div>'
        // 生成完整弹窗（版本号带上构建标识：同版本覆盖发布时便于确认用户装的是哪一份）
        const popoverHtml = renderer.renderPopover(
            '哔哩哔哩播放页设置',
            versionLabel(),
            formContent
        )
        createElementAndInsert(popoverHtml, document.body)
        // 获取 popover DOM 元素（需要等 DOM 插入后才能获取）
        const popover = document.getElementById('VideoSettingsPopover') as SettingsPopover | null
        // Vue 面板挂载（懒加载 Vue 运行时 + SFC）；不 await fetchDynamicOptions（fetchModels 有 10s 超时）：
        // 动态选项由 mountVuePanel 内部从 _pendingModelOptions / 当前 ai_model 推导，面板挂载后再异步更新。
        // 挂载完成后再做自绘下拉与 tooltip 增强，因为对应 DOM（select/输入框）由组件渲染
        await this.mountVuePanel(popover, 'VideoSettingsFormMount', videoSettingsConfig)
        this.setupSettingsNav(popover, videoSettingsConfig)
        // 原生 select 视觉替身：套自绘下拉（trigger+菜单），数据/事件仍走原生 select
        enhanceCustomSelects(popover)
        // 初始化 tooltip 并将 tooltip 元素插入 popover 内，避免被 popover 的顶层(top layer)遮挡
        // 说明：TooltipComponent 只消费 delay / container（hideDelay 从未被读取），故不再传入
        initTooltip({ delay: 300, container: popover as HTMLElement })
        requestAnimationFrame(() => {
            bindTooltipIcons()
        })
        // 异步获取完整模型列表并更新（不阻塞初始化流程）
        this.fetchDynamicOptions().then(options => {
            if (!options?.ai_model) return
            // 就地合并到挂载时赋值的共享动态选项对象（面板已代理该对象；替换引用不会触发重渲染）
            Object.assign(this._pendingModelOptions!, options)
            refreshCustomSelects(popover)
        }).catch(() => {})
    }
    /**
     * 获取动态选项（如模型列表）
     */
    async fetchDynamicOptions (): Promise<DynamicOptions> {
        const options: DynamicOptions = {}
        // 「AI 自动识别广告」未开启时不拉取模型列表：无意义的网络请求且未配置 API Key 时会告警（手动/共享片段跳过不依赖 AI）
        if (!this.userConfigs.ai_auto_identify) return options
        const useCustomModel = this.userConfigs.use_custom_model || false
        if (!useCustomModel) {
            try {
                const models = await fetchModels(
                    this.userConfigs.ai_apikey as string,
                    this.userConfigs.ai_provider as string,
                    this.userConfigs.custom_base_url as string
                )
                options.ai_model = models.map(model => ({
                    value: model.id,
                    label: model.label
                }))
            } catch (error) {
                logger.error('获取模型列表失败', error)
                // 使用当前模型作为备选
                options.ai_model = [{
                    value: this.userConfigs.ai_model,
                    label: this.userConfigs.ai_model
                }]
            }
        }
        return options
    }
    async initVideoSettingsEventListeners (): Promise<void> {
        const popover = document.getElementById('VideoSettingsPopover') as SettingsPopover | null
        if (!popover) {
            logger.warn('设置弹窗未找到')
            return
        }
        // 绑定弹窗开关事件；关闭后移除容器（统一关闭逻辑），重开时经 openSettings 重建
        const app = (elementSelectors.get('app') || elementSelectors.get('bangumiApp') || document.body) as HTMLElement
        addEventListenerToElement(popover, 'toggle', (e: Event) => {
            const isOpen = (e as ToggleEvent).newState === 'open'
            const isClosed = (e as ToggleEvent).newState === 'closed'
            if (isOpen) app.style.pointerEvents = 'none'
            if (isClosed) {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                destroyTooltip()
                // 关闭即卸载 Vue 面板（容器随后被移除，不卸载会残留实例与响应式副作用）
                this.unmountVuePanel()
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
        // 表单交互（change/validate/refresh）全部由 Vue 面板的组件事件回调处理，
        // 无需绑定 DOM 事件；自绘下拉/tooltip 的增强仍走公共逻辑
        // 绑定导入导出事件
        this.bindImportExportEvents(popover)
        this.bindVersionUpdateCheck(popover)
    }
    /**
     * 设置弹窗左侧的分组导航：列出 schema 里的 section，点击平滑跳转。
     *
     * 为什么放在 popover 外面：`.adjustment-popover` 自身既是滚动容器又有 `overflow-x: hidden`，
     * 放在它内部再向左定位会被裁掉；因此作为它的兄弟节点插入 body，
     * 用 position: fixed 对齐到弹窗左外侧（弹窗固定 550px 宽且水平居中）。
     */
    setupSettingsNav (popover: SettingsPopover | null, schema: SettingItemSchema[]): void {
        this._settingsNavCleanup?.()
        this._settingsNavCleanup = null
        if (!popover) return
        const sections = schema.filter(item => item.type === 'section' && item.id)
        if (!sections.length) return
        // 导航顶部与弹窗头部的下边框对齐；滚动定位同样以头部下缘为基准
        // （头部高度由内容撑出，不能写死，必须实测）
        const header = popover.querySelector('.adjustment-popover-header')
        const headerBottom = (): number => header instanceof HTMLElement
            ? header.getBoundingClientRect().bottom
            : popover.getBoundingClientRect().top
        const nav = document.createElement('nav')
        nav.className = 'adjustment-settings-nav'
        nav.setAttribute('aria-label', '设置分组导航')
        const buttons = new Map<string, HTMLButtonElement>()
        for (const item of sections) {
            const id = String(item.id)
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'adjustment-settings-nav-item'
            btn.textContent = String(item.label ?? id)
            btn.addEventListener('click', () => {
                const target = popover.querySelector(`.adjustment-section.${id}`)
                if (!(target instanceof HTMLElement)) return
                // 不用 scrollIntoView：它无法补偿高度不定的 sticky 头部（会盖住分类标题一半），
                // 这里按「标题正好落在头部下边框下方 12px」计算实际滚动量
                const delta = target.getBoundingClientRect().top - headerBottom() - 12
                popover.scrollTo({ top: popover.scrollTop + delta, behavior: 'smooth' })
            })
            nav.appendChild(btn)
            buttons.set(id, btn)
        }
        document.body.appendChild(nav)
        // 与弹窗同开同关：设置弹窗会被缓存复用，所以监听 toggle 而不是只绑一次
        const onToggle = (event: Event): void => {
            nav.classList.toggle('is-closed', (event as ToggleEvent).newState !== 'open')
        }
        popover.addEventListener('toggle', onToggle)
        onToggle({ newState: popover.matches(':popover-open') ? 'open' : 'closed' } as ToggleEvent)
        // 刷新导航：分组可见性随开关联动（如「AI 识别」随「跳过片段」整块隐藏）+ 当前分组高亮
        const refresh = (): void => {
            // popover 未显示时其内部元素无法布局（rect 全为 0），此时不要覆盖 CSS 兜底值。
            // 弹窗打开（toggle → open）后 refresh 会被再次调用，届时才是真实位置。
            const bottom = headerBottom()
            if (bottom > 0) nav.style.top = `${Math.round(bottom)}px`
            // 当前分组判定必须与点击跳转（见上方 click 处理）同基准——都用头部下边框：
            // 跳转补偿掉了 sticky 头部高度，若这里改用弹窗顶边加固定阈值，
            // 头部高度会把判定整体下压一格，导致点了分组 N 却高亮 N-1。
            // 判定规则与回归用例见 src/ui/settings/nav-scroll-spy.ts
            const positions: NavSectionPosition[] = []
            for (const item of sections) {
                const id = String(item.id)
                const el = popover.querySelector(`.adjustment-section.${id}`)
                const hidden = !(el instanceof HTMLElement) || window.getComputedStyle(el).display === 'none'
                buttons.get(id)?.classList.toggle('is-hidden', hidden)
                positions.push({ id, top: hidden ? 0 : (el as HTMLElement).getBoundingClientRect().top, hidden })
            }
            const scrollable = popover.scrollHeight - popover.clientHeight > 2
            const atBottom = scrollable && popover.scrollTop + popover.clientHeight >= popover.scrollHeight - 2
            const current = pickActiveSection(positions, bottom, atBottom)
            for (const [id, btn] of buttons) btn.classList.toggle('is-active', id === current)
        }
        // 分组显隐由配置开关驱动（Vue 改的是内联 display），用 observer 跟随
        const observer = new MutationObserver(refresh)
        observer.observe(popover, { subtree: true, attributes: true, attributeFilter: ['style', 'class']})
        let raf = 0
        const onScroll = (): void => {
            if (raf) return
            raf = window.requestAnimationFrame(() => {
                raf = 0
                refresh()
            })
        }
        popover.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        // 弹窗开/关都会触发 toggle：打开时此刻才完成布局，需重算顶部与当前分组
        popover.addEventListener('toggle', refresh)
        refresh()
        this._settingsNavCleanup = (): void => {
            observer.disconnect()
            popover.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            popover.removeEventListener('toggle', refresh)
            popover.removeEventListener('toggle', onToggle)
            if (raf) window.cancelAnimationFrame(raf)
            nav.remove()
        }
    }
    /**
     * 绑定版本号点击检查更新：结果小字展示在版本号下方
     */
    bindVersionUpdateCheck (popover: SettingsPopover): void {
        const versionEl = popover.querySelector('.adjustment-popover-version')
        const statusEl = popover.querySelector('.adjustment-popover-version-status')
        if (!versionEl || !statusEl) return
        this._updateAvailableUnsubscribe?.()
        this._updateAvailableUnsubscribe = null
        let checking = false
        let hideTimer: ReturnType<typeof setTimeout> | null = null
        const showStatus = (text: string, className = ''): void => {
            clearTimeout(hideTimer ?? undefined)
            statusEl.className = 'adjustment-popover-version-status'
            if (className) statusEl.classList.add(className)
            statusEl.textContent = text
            hideTimer = setTimeout(() => {
                statusEl.classList.add('hidden')
            }, 3000)
        }
        // 版本号处的常驻提示（不自动隐藏）：
        // ① 有新版本 → 「有新版本 vX，点击查看」（手动模式唯一的提示途径，自动模式下补丁级也只走这里）
        // ② 同版本覆盖发布 → 「内容已更新，点击重新安装」（版本号未变，只能提示重新安装）
        const showPendingUpdate = (): void => {
            const pending = updateService.getPendingUpdateVersion()
            const rebuild = updateService.getPendingRebuild()
            if (!pending && !rebuild) return
            clearTimeout(hideTimer ?? undefined)
            statusEl.className = 'adjustment-popover-version-status has-update'
            statusEl.textContent = pending
                ? `有新版本 v${pending}，点击查看`
                : '内容已更新，点击重新安装'
        }
        showPendingUpdate()
        this._updateAvailableUnsubscribe = eventBus.on(EVENT_NAMES.UPDATE_AVAILABLE, () => showPendingUpdate())
        addEventListenerToElement(versionEl, 'click', async () => {
            // 同版本覆盖发布：没有更新日志可看，直接打开安装页让用户重装
            if (!updateService.getPendingUpdateVersion() && updateService.getPendingRebuild()) {
                window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js', '_blank')
                return
            }
            if (checking) return
            checking = true
            statusEl.classList.remove('hidden')
            statusEl.className = 'adjustment-popover-version-status'
            statusEl.textContent = '检查更新中…'
            clearTimeout(hideTimer ?? undefined)
            try {
                const result = await updateService.checkForUpdatesManually(pkg.version, pkg.updates)
                if (result.type === 'latest') {
                    showStatus(`已是最新版本 v${pkg.version}`)
                } else if (result.type === 'update') {
                    showStatus(`发现新版本 v${result.latestVersion}`, 'update')
                } else if (result.type === 'rebuilt') {
                    showStatus('内容已更新，点击重新安装', 'update')
                } else {
                    showStatus('检查更新失败，请稍后重试', 'error')
                }
            } finally {
                checking = false
            }
        })
    }
    /**
     * 处理 API Key 验证按钮点击（由 Vue 面板的 onValidate 回调调用）
     * @param {string} targetId 目标输入框 id（ai_apikey / custom_model_api_key）
     * @param {HTMLElement} popover 设置弹窗
     * @param {HTMLElement} [buttonEl] 按钮元素（缺省时按 targetId 查找，兼容 Vue 面板）
     */
    async handleValidateClick (targetId: string, popover: SettingsPopover | null, buttonEl: HTMLElement | null = null): Promise<void> {
        const button = (buttonEl || popover?.querySelector(`[data-validate-for="${targetId}"]`)) as FeedbackButton | null
        if (!button) return
        const input = popover?.querySelector(`#${targetId}`) as HTMLInputElement | null
        const apiKey = input?.value?.trim()
        // 反馈期内重复点击时保留更早记录的原始文字
        if (button._feedbackOriginalText === undefined) {
            button._feedbackOriginalText = button.textContent
        }
        if (!apiKey) {
            this.setButtonFeedback(button, false, '', '验证失败')
            return
        }
        button.textContent = '验证中...'
        button.style.opacity = '0.7'
        button.style.borderColor = ''
        button.style.color = ''
        try {
            let result: { valid?: boolean } | undefined
            if (targetId === 'ai_apikey') {
                result = await validateApiKey(apiKey, this.userConfigs.ai_provider as string | undefined, this.userConfigs.custom_base_url as string | undefined)
            } else if (targetId === 'custom_model_api_key') {
                const apiUrl = (popover?.querySelector('#custom_model_api_url') as HTMLInputElement | null)?.value?.trim()
                if (!apiUrl) {
                    this.setButtonFeedback(button, false, '', '验证失败')
                    return
                }
                result = await validateApiKey(apiKey, 'custom', apiUrl)
            }
            this.setButtonFeedback(button, result?.valid, '验证成功', '验证失败')
        } catch (error) {
            logger.error('API Key 验证失败', error)
            this.setButtonFeedback(button, false, '', '验证失败')
        } finally {
            button.style.opacity = '1'
        }
    }
    /**
     * 处理模型列表刷新按钮点击（由 Vue 面板的 onRefresh 回调调用）
     * @param {string} targetId 目标下拉 id（当前仅支持 ai_model）
     * @param {HTMLElement} popover 设置弹窗
     * @param {HTMLElement} [buttonEl] 按钮元素（缺省时按 targetId 查找，兼容 Vue 面板）
     */
    async handleRefreshClick (targetId: string, popover: SettingsPopover | null, buttonEl: HTMLElement | null = null): Promise<void> {
        if (targetId !== 'ai_model') return
        const button = (buttonEl || popover?.querySelector(`[data-refresh-for="${targetId}"]`)) as FeedbackButton | null
        if (!button) return
        if (button._feedbackOriginalText === undefined) {
            button._feedbackOriginalText = button.textContent
        }
        button.textContent = '刷新中...'
        button.style.opacity = '0.7'
        button.style.borderColor = ''
        button.style.color = ''
        try {
            const success = await this.refreshModelList(popover)
            this.setButtonFeedback(button, success, '刷新成功', '刷新失败')
        } catch (error) {
            logger.error('刷新模型列表失败', error)
            this.setButtonFeedback(button, false, '', '刷新失败')
        } finally {
            button.style.opacity = '1'
        }
    }
    /**
     * 设置按钮结果反馈：成功绿色/失败红色边框与文字，3 秒后恢复默认样式
     * @param {HTMLElement} button - 按钮元素
     * @param {boolean} success - 是否成功
     * @param {string} successText - 成功时按钮文字（空则不改变文字）
     * @param {string} failureText - 失败时按钮文字（空则不改变文字）
     */
    setButtonFeedback (button: FeedbackButton | null, success: unknown, successText = '', failureText = ''): void {
        if (!button) return
        const isSuccess = Boolean(success)
        button.style.borderColor = isSuccess ? 'var(--adj-success)' : 'var(--adj-danger)'
        if (successText || failureText) {
            button.textContent = isSuccess ? successText : failureText
            button.style.color = isSuccess ? 'var(--adj-success)' : 'var(--adj-danger)'
        }
        clearTimeout(button._feedbackResetTimer ?? undefined)
        button._feedbackResetTimer = setTimeout(() => {
            button.style.borderColor = ''
            button.style.color = ''
            if (button._feedbackOriginalText !== undefined) {
                button.textContent = button._feedbackOriginalText
                button._feedbackOriginalText = undefined
            }
        }, 3000)
    }
    /**
     * 绑定导入导出事件
     */
    bindImportExportEvents (popover: SettingsPopover): void {
        const exportBtn = popover.querySelector('#ExportUserConfigs')
        const importBtn = popover.querySelector('#ImportUserConfigs')
        const fileInput = popover.querySelector('#ImportUserConfigsFileInput') as HTMLInputElement | null
        if (exportBtn) {
            addEventListenerToElement(exportBtn, 'click', () => this.exportUserConfigs())
        }
        if (importBtn && fileInput) {
            addEventListenerToElement(importBtn, 'click', () => fileInput.click())
            addEventListenerToElement(fileInput, 'change', e => this.importUserConfigs(e))
        }
    }
    // ==================== 特殊处理逻辑 ====================
    /**
     * 处理特殊复选框变更
     */
    async handleSpecialCheckboxChange (configId: string, value: unknown, popover: SettingsPopover | null): Promise<void> {
        // 使用自定义模型开关
        if (configId === 'use_custom_model') {
            if (value) {
                // 开启自定义模型：同步 ai_model
                const customModelId = this.userConfigs.custom_model_id
                if (customModelId) {
                    await this.saveConfig('ai_model', customModelId)
                }
            } else {
                // 关闭自定义模型：先刷新可见性，再刷新模型列表
                await this.refreshModelList(popover)
            }
            // 刷新可见性以显示/隐藏相关配置项
        }
        // 「AI 自动识别广告」开启时：拉取模型列表填充下拉（默认关闭状态下打开设置不会预取）
        if (configId === 'ai_auto_identify' && value && !this.userConfigs.use_custom_model) {
            await this.refreshModelList(popover)
        }
        // 日志级别变更
        if (configId.startsWith('log_level_')) {
            await LoggerService.updateLogLevelsFromConfig(this.userConfigs)
        }
        // 自动开启字幕同步到播放器开关
        if (configId === 'auto_subtitle') {
            const switchInput = elementSelectors.get('AutoEnableSubtitleSwitchInput') as HTMLInputElement | null
            if (switchInput) {
                const checked = Boolean(value)
                requestAnimationFrame(() => {
                    switchInput.checked = checked
                    switchInput.toggleAttribute('checked', checked)
                })
            }
            const autoSubtitleEl = document.getElementById('AutoSubtitle') as HTMLInputElement | null
            if (autoSubtitleEl) {
                const checked = Boolean(value)
                requestAnimationFrame(() => {
                    autoSubtitleEl.checked = checked
                    autoSubtitleEl.toggleAttribute('checked', checked)
                })
            }
        }
    }
    /**
     * 处理特殊输入框变更
     */
    async handleSpecialInputChange (configId: string, value: unknown, popover: SettingsPopover | null): Promise<void> {
        // API Key 变更时刷新模型列表
        if (configId === 'ai_apikey') {
            clearModelCache()
            await this.refreshModelList(popover)
        }
        // 自定义 API 地址变更时刷新模型列表
        if (configId === 'custom_base_url') {
            clearModelCache()
            await this.refreshModelList(popover)
        }
        // 自定义模型 ID 变更时同步 ai_model
        if (configId === 'custom_model_id' && this.userConfigs.use_custom_model) {
            await this.saveConfig('ai_model', value)
        }
    }
    /**
     * 处理特殊下拉框变更
     */
    async handleSpecialSelectChange (configId: string, value: unknown, oldValue: unknown, popover: SettingsPopover | null): Promise<void> {
        // AI 提供商切换时刷新模型列表
        if (configId === 'ai_provider') {
            await this.switchAIProvider(value as string, oldValue as string, popover)
        }
    }
    /**
     * 切换 AI 提供商：按供应商隔离保存/恢复 API Key 与模型
     */
    async switchAIProvider (newProvider: string, oldProvider: string, popover: SettingsPopover | null): Promise<void> {
        // 将当前供应商的 API Key 与模型存入对应槽位
        if (oldProvider && oldProvider !== newProvider) {
            await this.saveConfig(`ai_apikey_${oldProvider}`, this.userConfigs.ai_apikey || '')
            await this.saveConfig(`ai_model_${oldProvider}`, this.userConfigs.ai_model || '')
        }
        // 恢复目标供应商的历史记录（未填过则为空）
        const savedKey = await ConfigService.getValue(`ai_apikey_${newProvider}`)
        const savedModel = await ConfigService.getValue(`ai_model_${newProvider}`)
        await this.saveConfig('ai_apikey', savedKey || '')
        // API Key 输入框由面板按 props.configs 自动重渲染（saveConfig 已写入同一对象），无需操作 DOM
        clearModelCache()
        await this.refreshModelList(popover, String(savedModel || ''))
    }
    /**
     * 刷新模型列表
     * @param {HTMLElement} popover - 设置弹窗
     * @param {string} preferredModel - 优先选中的模型（供应商切换时传入，空则保留当前选中）
     */
    async refreshModelList (popover: SettingsPopover | null, preferredModel = ''): Promise<boolean> {
        clearModelCache()
        try {
            const models = await fetchModels(
                this.userConfigs.ai_apikey as string,
                this.userConfigs.ai_provider as string,
                this.userConfigs.custom_base_url as string
            )
            // 更新响应式桥的模型选项与选中值（面板据此重渲染下拉）
            const optionList = models.map(model => ({ value: model.id, label: model.label }))
            this.syncVueDynamicOptions({ ai_model: optionList })
            const currentModel = (preferredModel || this.userConfigs.ai_model) as string
            if (models.length > 0) {
                const keepCurrent = currentModel && optionList.some(option => option.value === currentModel)
                const nextModel = keepCurrent ? currentModel : models[0].id
                if (nextModel !== this.userConfigs.ai_model) {
                    await this.saveConfig('ai_model', nextModel)
                }
            } else if (this.userConfigs.ai_model) {
                // 无可用模型：清空选中值（组件渲染「暂无可用选项」占位）
                await this.saveConfig('ai_model', '')
            }
            refreshCustomSelects(popover)
            logger.info('模型列表已刷新')
            return true
        } catch (error) {
            logger.error('刷新模型列表失败', error)
            return false
        }
    }
    /**
     * 在配置中查找设置项
     */
    findConfigItem (id: string): SettingItemSchema | null {
        const findInItems = (items: SettingItemSchema[]): SettingItemSchema | null => {
            for (const item of items) {
                if (item.id === id) return item
                if (item.children) {
                    const found = findInItems(item.children)
                    if (found) return found
                }
                if (item.items) {
                    const found = findInItems(item.items)
                    if (found) return found
                }
            }
            return null
        }
        // 优先在「当前面板使用的 schema」中查找（动态页为 dynamicSettingsConfig），
        // 再回退 videoSettingsConfig，保证两类页面的事件归一逻辑都能拿到设置项定义
        const primary = this._activeSchema || videoSettingsConfig
        const found = findInItems(primary)
        if (found) return found
        return primary === videoSettingsConfig ? null : findInItems(videoSettingsConfig)
    }
    // ==================== 动态页设置 ====================
    async renderDynamicSettings (): Promise<void> {
        const existingSettings = document.getElementById('DynamicSettingsPopover') as SettingsPopover | null
        if (existingSettings) {
            existingSettings.__popoverDismissCleanup?.()
            existingSettings.remove()
        }
        // 面板重建前先卸载旧的 Vue 实例（避免泄漏）
        this.unmountVuePanel()
        const renderer = new SettingsShellRenderer()
        // 表单区由 Vue 面板按 dynamicSettingsConfig 渲染；挂载点本身即 .adjustment-form 容器
        const formContent = '<div class="adjustment-form" id="DynamicSettingsFormMount"></div>'
        const popoverHtml = renderer.renderDynamicPopover(
            '哔哩哔哩动态页设置',
            versionLabel(),
            formContent
        )
        createElementAndInsert(popoverHtml, document.body)
        const popover = document.getElementById('DynamicSettingsPopover') as SettingsPopover | null
        const panel = await this.mountVuePanel(popover, 'DynamicSettingsFormMount', dynamicSettingsConfig)
        this.setupSettingsNav(popover, dynamicSettingsConfig)
        if (panel) {
            // 表单 DOM 就绪后应用自绘下拉与 tooltip 增强
            enhanceCustomSelects(popover)
            initTooltip({ delay: 300, container: popover as HTMLElement })
            requestAnimationFrame(() => {
                bindTooltipIcons()
            })
        }
    }
    async initDynamicSettingsEventListeners (): Promise<void> {
        const popover = document.getElementById('DynamicSettingsPopover') as SettingsPopover | null
        if (!popover) return
        this.bindVersionUpdateCheck(popover)
        const app = (elementSelectors.get('app') || elementSelectors.get('bangumiApp') || document.body) as HTMLElement
        addEventListenerToElement(popover, 'toggle', (e: Event) => {
            const isOpen = (e as ToggleEvent).newState === 'open'
            const isClosed = (e as ToggleEvent).newState === 'closed'
            if (isOpen) app.style.pointerEvents = 'none'
            if (isClosed) {
                app.style.pointerEvents = 'auto'
                popover.__popoverDismissCleanup?.()
                popover.__popoverDismissCleanup = null
                destroyTooltip()
                // 关闭即卸载 Vue 面板（容器随后被移除）
                this.unmountVuePanel()
                popover.remove()
            }
        })
        // 自定义外部点击关闭：原生 light dismiss 在弹窗内按下、弹窗外松开（拖选文字）时也会误关
        popover.__popoverDismissCleanup?.()
        popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)
        // 绑定保存按钮点击事件 — 配置已即时保存，点击仅关闭弹窗
        const saveBtn = document.getElementById('DynamicSettingsSaveButton')
        if (saveBtn) {
            addEventListenerToElement(saveBtn, 'click', () => {
                popover.hidePopover()
            })
        }
    }
    // ==================== 通用方法 ====================
    /**
     * 保存配置
     */
    async saveConfig (key: string, value: unknown): Promise<void> {
        await ConfigService.setValue(key, value)
        // 写 Vue 响应式代理（触发面板重渲染）；代理与 this.userConfigs 共享同一 target，读数同步。
        // 面板未挂载时代理为 null，必须回退写宿主对象，否则会抛错且配置丢失
        if (this._vueConfigsProxy) {
            this._vueConfigsProxy[key] = value
        } else {
            this.userConfigs[key] = value
        }
        logger.debug(`配置已更新: ${key} = ${value}`)
    }
    /**
     * 导出用户配置
     * 合并已存储的配置与默认值，确保所有已知配置项都被导出
     */
    async exportUserConfigs (): Promise<void> {
        try {
            // 获取所有已存储的配置
            const storedSettings = await storageService.getAll('user')
            const storedMap = new Map(Object.entries(storedSettings || {}))
            // 合并默认值与已存值，确保每项都被导出
            const mergedConfigs: Record<string, unknown> = {}
            for (const [key, defaultValue] of ConfigService.DEFAULT_VALUES.entries()) {
                mergedConfigs[key] = storedMap.has(key) ? storedMap.get(key) : defaultValue
            }
            const configCount = Object.keys(mergedConfigs).length
            const blob = new Blob([JSON.stringify(mergedConfigs, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `bilibili_adjustment_settings_${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            logger.info(`配置已导出，共 ${configCount} 项`)
        } catch (error) {
            logger.error('导出设置失败:', error)
        }
    }
    /**
     * 导入用户配置
     * 兼容新版 {key: value} 和旧版 [{key, value, timestamp}] 两种格式
     * 只导入已知的有效配置项，忽略未知键
     */
    async importUserConfigs (event: Event): Promise<void> {
        const file = (event?.target as HTMLInputElement | null)?.files?.[0]
        if (!file) return
        try {
            const reader = new FileReader()
            reader.onload = async (e: ProgressEvent<FileReader>) => {
                try {
                    const data = JSON.parse(String(e.target?.result ?? ''))
                    let configEntries: Array<{ key: string; value: unknown }> = []
                    if (Array.isArray(data)) {
                        // 兼容旧版导出格式: [{key, value, timestamp}]
                        configEntries = data
                            .filter(item => item && item.key)
                            .map(item => ({ key: item.key, value: item.value }))
                    } else if (typeof data === 'object' && data !== null) {
                        // 新版格式: {key: value}
                        configEntries = Object.entries(data).map(([key, value]) => ({ key, value }))
                    } else {
                        alert('导入失败：文件格式不正确')
                        return
                    }
                    // 只导入已知的配置项，过滤掉未知的键
                    const validKeys = new Set(ConfigService.DEFAULT_VALUES.keys())
                    const validEntries = configEntries.filter(entry => validKeys.has(entry.key))
                    const skippedCount = configEntries.length - validEntries.length
                    if (validEntries.length === 0) {
                        alert('导入失败：文件中没有有效的配置项')
                        return
                    }
                    await storageService.batchSet('user', validEntries)
                    let message = `成功导入 ${validEntries.length} 项配置`
                    if (skippedCount > 0) {
                        message += `，已忽略 ${skippedCount} 项未知配置`
                    }
                    alert(message)
                    location.reload()
                } catch (parseError) {
                    logger.error('解析设置文件失败:', parseError)
                    alert('导入失败：文件格式不正确')
                }
            }
            reader.onerror = () => {
                logger.error('读取文件失败')
                alert('读取文件失败，请重试')
            }
            reader.readAsText(file)
        } catch (error) {
            logger.error('导入设置失败:', error)
            alert('导入设置失败: ' + (error instanceof Error ? error.message : String(error)))
        }
    }
}
