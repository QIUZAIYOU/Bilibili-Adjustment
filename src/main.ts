import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
import { insertStyleToDocument, detectivePageType, monitorHrefChange } from '@/utils/common'
import { elementSelectors } from '@/shared/element-selectors'
import { initScrollbarHoverWidening } from '@/utils/scrollbar-hover'
import { updateService } from '@/services/update.service'
import { applyCachedHotConfig, refreshHotConfig } from '@/services/hot-config.service'
import { baseStyles } from '@/shared/styles/base'
import { ThemeManager } from '@/shared/theme'
import { initStylusNightFollowing } from '@/shared/theme/stylus-night'
import { debounce } from '@/utils/lodash-lite'
import { perfStart, perfEnd, perfMark } from '@/shared/perf'
import { EVENT_NAMES, UP_SPACE_POPUP_FLAG } from '@/shared/constants'
import type { ModuleDefinition } from '@/core/module-system'
import pkg from '../package.json' with { type: 'json' }
const logger = new LoggerService('Main')
const moduleCache = new Map<string, ModuleDefinition>()
let currentModuleType: string | null = null
// 注意：显式 .js 扩展名不会回退到 .ts（vite 与 Node 行为一致），故这里省略扩展名
const moduleMap: Record<string, () => Promise<{ default: ModuleDefinition }>> = {
    'video': () => import('@/modules/video/video.module'),
    'home': () => import('@/modules/home/home.module'),
    'dynamic': () => import('@/modules/dynamic/dynamic.module')
}
/**
 * 视频卡片预览（**跨页特性**：所有页型的视频卡片都能预览）
 *
 * 按开关**懒加载**：默认关闭 → 这段代码根本不进浏览器；开启时动态 import 出一个独立 chunk，
 * 既不占首屏，也不拖慢任何页型。因为它与页面模块无关（页面模块会随 SPA 路由反复装卸），
 * 所以挂在 main 上、由开关驱动，而不是塞进某个页面模块里。
 */
let videoPreviewModule: typeof import('@/features/video-preview') | null = null
const enableVideoPreview = async (): Promise<void> => {
    try {
        if (!videoPreviewModule) videoPreviewModule = await import('@/features/video-preview')
        videoPreviewModule.initVideoPreviewFeature()
    } catch (error) {
        logger.warn('视频预览丨加载失败（已忽略）', error instanceof Error ? error.message : error)
    }
}
const disableVideoPreview = (): void => {
    videoPreviewModule?.destroyVideoPreviewFeature()
}
const detectAndLoadModule = async (): Promise<string | null> => {
    const newModuleType = await detectivePageType()
    logger.debug(`页面类型: ${newModuleType}`)
    // 同类 SPA 路由由当前模块处理，不重复销毁和初始化模块
    if (newModuleType === currentModuleType && moduleSystem.getModule(newModuleType)) {
        logger.debug(`页面类型未变化，跳过模块加载: ${newModuleType}`)
        return newModuleType
    }
    currentModuleType = newModuleType
    if (!moduleMap[newModuleType]) {
        logger.debug(`当前页面类型 ${newModuleType} 不支持模块加载`)
        return newModuleType
    }
    if (moduleCache.has(newModuleType)) {
        moduleSystem.register(moduleCache.get(newModuleType)!)
        return newModuleType
    }
    const module = await moduleMap[newModuleType]()
    const moduleConfig = module.default
    logger.debug(`注册模块: ${moduleConfig.name}`)
    moduleSystem.register(moduleConfig)
    moduleCache.set(newModuleType, moduleConfig)
    logger.debug(`缓存模块: ${newModuleType}`)
    return newModuleType
}
/**
 * P0-5：更新检查不再阻塞 APP_READY
 * 1) 空闲（或 3s 后）执行，避免与首屏渲染/模块初始化抢主线程与网络；
 * 2) 跨会话门控由 update.service 依据 update_check_frequency + 上次检查时间决定；
 * 3) 失败只 warn，不进入初始化 error 链路（用户可在设置里手动检查）。
 */
const scheduleUpdateCheck = (): void => {
    const run = () => {
        // 更新方式（自动 / 手动）由 updateService 内部按 update_mode 决定：
        // 两种方式都会检查更新，区别只在「是否弹窗」（手动模式改为在设置面板版本号处提示）
        perfStart('update:check')
        updateService.checkForUpdates(pkg.version, pkg.updates)
            .catch(error => logger.warn('检查更新失败（已忽略，不影响使用）', error instanceof Error ? error.message : error))
            .finally(() => perfEnd('update:check'))
    }
    const idleCallback = window.requestIdleCallback
    if (typeof idleCallback === 'function') {
        idleCallback(run, { timeout: 8000 })
    } else {
        setTimeout(run, 3000)
    }
}
const initializeApp = async (): Promise<void> => {
    perfStart('app:init')
    try {
        await ConfigService.initialize()
        // config 就绪后按持久化主题切换（默认 night 已顶部注入，无闪烁）
        ThemeManager.setTheme((await ConfigService.getValue('theme')) as string)
        logger.debug('ConfigService 初始化完成')
        await LoggerService.updateLogLevelsFromConfig({
            log_level_info: (await ConfigService.getValue('log_level_info')) as boolean | undefined,
            log_level_error: (await ConfigService.getValue('log_level_error')) as boolean | undefined,
            log_level_warn: (await ConfigService.getValue('log_level_warn')) as boolean | undefined,
            log_level_debug: (await ConfigService.getValue('log_level_debug')) as boolean | undefined
        })
        // 热更配置：先用本地缓存**同步**覆盖（零延迟，必须早于功能模块查询选择器），再后台刷新供后续查询使用
        applyCachedHotConfig()
        refreshHotConfig().catch(error => logger.debug('热更配置刷新失败（已忽略）', error instanceof Error ? error.message : error))
        // 视频卡片预览：跨页特性，按开关懒加载；开关变更即时生效（设置面板里勾上立刻就有按钮）
        // ⚠️ 必须放在热更覆盖**之后**：卡片选择器可能被热更改写，扫描要用覆盖后的值
        eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, ...args: unknown[]) => {
            const { key, value } = (args[0] ?? {}) as { key?: string, value?: unknown }
            if (key !== 'home_video_preview') return
            if (value) void enableVideoPreview()
            else disableVideoPreview()
        })
        if (await ConfigService.getValue('home_video_preview')) void enableVideoPreview()
        await detectAndLoadModule()
        if (currentModuleType === 'other') return
        await moduleSystem.init()
        logger.info('应用初始化完成')
        perfEnd('app:ready')
        await eventBus.emitMeasured(EVENT_NAMES.APP_READY)
        scheduleUpdateCheck()
        let isProcessingUrlChange = false
        let lastUrl = location.href
        // 处理中发生的路由变化挂在这里，本轮结束后补跑（而不是丢弃）
        let pendingUrl: string | null = null
        const applyUrlChange = async (): Promise<void> => {
            if (isProcessingUrlChange) {
                // 上一轮还在切换模块：记下最新 URL，等它结束后再跑一轮
                // （2026-10-23 审查发现：旧实现直接丢弃，快速切页会装错模块并残留旧模块 DOM）
                pendingUrl = location.href
                logger.debug('URL变化处理中，记下最新地址待补跑')
                return
            }
            const currentUrl = location.href
            if (currentUrl === lastUrl) {
                logger.debug('URL未变化，跳过处理')
                return
            }
            lastUrl = currentUrl
            // 页型缓存是模块级长生命周期变量（不清空就永不过期），换页后必须立刻作废，
            // 否则选择器的页型门控会继续按上一个页型放行/拦截
            elementSelectors.resetPageType()
            isProcessingUrlChange = true
            perfMark('spa:navigate')
            try {
                const nextModuleType = await detectivePageType()
                if (nextModuleType === currentModuleType) {
                    logger.debug(`同类页面路由变化，由当前模块处理: ${nextModuleType}`)
                    return
                }
                logger.debug('页面类型发生变化，重新加载模块')
                await moduleSystem.clearModules()
                currentModuleType = null
                await detectAndLoadModule()
                if (currentModuleType === 'other') return
                await moduleSystem.init()
                logger.info('模块系统重新初始化完成')
                perfEnd('app:ready')
                await eventBus.emitMeasured(EVENT_NAMES.APP_READY)
            } catch (error) {
                logger.error('URL变化处理失败', error)
            } finally {
                isProcessingUrlChange = false
                // 补跑处理期间挂起的那一次路由变化（保证不丢更新）
                if (pendingUrl && pendingUrl !== lastUrl) {
                    pendingUrl = null
                    await applyUrlChange()
                }
            }
        }
        // leading + trailing：窗口内的重复变化会合并成一次「尾部补发」，
        // 配合上面的 pendingUrl 机制，连续快速切页不会再丢事件
        const handleUrlChange = debounce(() => {
            void applyUrlChange()
        }, 500, { 'leading': true, 'trailing': true })
        monitorHrefChange(handleUrlChange)
    } catch (error) {
        logger.error('应用初始化失败', error)
    }
}
// UP 主空间弹窗内嵌空间主页：**跨源 iframe**（space.bilibili.com ≠ 承载页），父页面拿不到它的 document、
// 注入不了样式，所以靠地址上的标记参数"自己给自己打标记"——脚本在 iframe 内（油猴默认注入子框架）读到它就应用：
// 1. 隐藏站点头部（弹窗里不需要）；
// 2. 顶掉头部让出的高度、并让内容区铺满弹窗宽度。
//    ⚠️ 这两条都必须 !important：B 站自己写着 `#app { margin-top: -64px; min-width: 1100px }`，
//    不吃掉它的话既顶不上去、也不会铺满（2026-09-25 实测）。
// 选择器走注册表（可热更），改服务器上的 hot-config/selectors.js 即可生效。
if (window.self !== window.top && location.search.includes(UP_SPACE_POPUP_FLAG)) {
    const headerSelector = elementSelectors.CSS('biliMainHeader')
    const appSelector = elementSelectors.CSS('spaceApp')
    insertStyleToDocument({
        'UpSpacePopupStyle': `
            ${headerSelector} { display: none !important; }
            ${appSelector} { margin-top: -107px !important; min-width: 100% !important; }
            html, body { overflow-x: hidden !important; }
        `
    })
}
// 主题变量先于一切样式注入（样式字符串引用 var(--adj-*)），默认 night 兜底
ThemeManager.init()
// Stylus 夜间哔哩样式检测：开启时强制界面主题 night 并锁定内容文字色（实时跟随增删）
initStylusNightFollowing()
insertStyleToDocument({ 'BilibiliAdjustmentStyle': baseStyles.BilibiliAdjustment })
initScrollbarHoverWidening()
initializeApp()
