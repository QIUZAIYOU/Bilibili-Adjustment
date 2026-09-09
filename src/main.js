import _ from 'lodash'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
import { insertStyleToDocument, detectivePageType, monitorHrefChange } from '@/utils/common'
import { initScrollbarHoverWidening } from '@/utils/scrollbar-hover'
import { updateService } from '@/services/update.service'
import { stylesV2 } from '@/shared/styles'
import { ThemeManager } from '@/shared/theme'
import { initStylusNightFollowing } from '@/shared/theme/stylus-night'
import { openVueSampleDialog } from '@/ui/vue-sample'
import { EVENT_NAMES } from '@/shared/constants'
import pkg from '../package.json' with { type: 'json' }
const logger = new LoggerService('Main')
window._ = _
const moduleCache = new Map()
let currentModuleType = null
const moduleMap = {
    'video': () => import('@/modules/video/video.module.js'),
    'home': () => import('@/modules/home/home.module.js'),
    'dynamic': () => import('@/modules/dynamic/dynamic.module.js')
}
const detectAndLoadModule = async () => {
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
        moduleSystem.register(moduleCache.get(newModuleType))
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
const initializeApp = async () => {
    try {
        await ConfigService.initialize()
        // config 就绪后按持久化主题切换（默认 night 已顶部注入，无闪烁）
        ThemeManager.setTheme(await ConfigService.getValue('theme'))
        logger.debug('ConfigService 初始化完成')
        await LoggerService.updateLogLevelsFromConfig({
            log_level_info: await ConfigService.getValue('log_level_info'),
            log_level_error: await ConfigService.getValue('log_level_error'),
            log_level_warn: await ConfigService.getValue('log_level_warn'),
            log_level_debug: await ConfigService.getValue('log_level_debug')
        })
        await detectAndLoadModule()
        if (currentModuleType === 'other') return
        await moduleSystem.init()
        logger.info('应用初始化完成')
        await eventBus.emit(EVENT_NAMES.APP_READY)
        let isProcessingUrlChange = false
        let lastUrl = location.href
        const handleUrlChange = _.debounce(async () => {
            if (isProcessingUrlChange) {
                logger.debug('URL变化处理中，跳过重复触发')
                return
            }
            const currentUrl = location.href
            if (currentUrl === lastUrl) {
                logger.debug('URL未变化，跳过处理')
                return
            }
            lastUrl = currentUrl
            isProcessingUrlChange = true
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
                await eventBus.emit(EVENT_NAMES.APP_READY)
            } catch (error) {
                logger.error('URL变化处理失败', error)
            } finally {
                isProcessingUrlChange = false
            }
        }, 500, { 'leading': true, 'trailing': false })
        monitorHrefChange(handleUrlChange)
        try {
            const autoCheckUpdate = await ConfigService.getValue('auto_check_update')
            if (autoCheckUpdate) {
                await updateService.checkForUpdates(pkg.version, pkg.updates)
            } else {
                logger.info('自动检查更新已被用户禁用')
            }
        } catch (error) {
            logger.error('检查更新失败', error)
        }
    } catch (error) {
        logger.error('应用初始化失败', error)
    }
}
// 弹窗内嵌空间主页（跨域 iframe）：检测到脚本标记参数时隐藏站点头部，只保留内容区
if (window.self !== window.top && location.search.includes('bili-adjustment-popup')) {
    insertStyleToDocument({
        'UpSpacePopupHeaderHiddenStyle': `
            #biliMainHeader { display: none !important; }
            html, body { overflow-x: hidden !important; }
        `
    })
}
// 主题变量先于一切样式注入（样式字符串引用 var(--adj-*)），默认 night 兜底
ThemeManager.init()
// Stylus 夜间哔哩样式检测：开启时强制界面主题 night 并锁定内容文字色（实时跟随增删）
initStylusNightFollowing()
insertStyleToDocument({ 'BilibiliAdjustmentStyle': stylesV2.BilibiliAdjustment })
// Vue 全链路探针（P2-a）：DEV 构建自动打开一次；任意构建按 Ctrl+Shift+Alt+V 打开，
// 验证 SFC 挂载/主题/配置响应式。用快捷键而非页面全局变量，规避脚本管理器沙盒隔离
// （如 ScriptCat/Tampermonkey 下 window 赋值不落页面全局）。
if (import.meta.env.DEV) {
    setTimeout(openVueSampleDialog, 2500)
}
try {
    // 在共享 window 环境（部分管理器/无沙盒）下保留控制台入口
    window.BAOpenVueProbe = openVueSampleDialog
} catch {
    // 沙盒受限时跳过全局暴露，快捷键仍可用
}
window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        if (document.readyState === 'complete') openVueSampleDialog()
        else window.addEventListener('DOMContentLoaded', () => openVueSampleDialog(), { once: true })
    }
})
initScrollbarHoverWidening()
initializeApp()
