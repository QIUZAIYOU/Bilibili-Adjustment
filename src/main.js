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
import { debounce } from '@/utils/lodash-lite'
import { perfStart, perfEnd, perfMark } from '@/shared/perf'
import { EVENT_NAMES } from '@/shared/constants'
import pkg from '../package.json' with { type: 'json' }
const logger = new LoggerService('Main')
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
/**
 * P0-5：更新检查不再阻塞 APP_READY
 * 1) 空闲（或 3s 后）执行，避免与首屏渲染/模块初始化抢主线程与网络；
 * 2) 跨会话门控由 update.service 依据 update_check_frequency + 上次检查时间决定；
 * 3) 失败只 warn，不进入初始化 error 链路（用户可在设置里手动检查）。
 */
const scheduleUpdateCheck = () => {
    const run = () => {
        ConfigService.getValue('auto_check_update').then(async autoCheckUpdate => {
            if (!autoCheckUpdate) {
                logger.info('自动检查更新已被用户禁用')
                return
            }
            perfStart('update:check')
            try {
                await updateService.checkForUpdates(pkg.version, pkg.updates)
            } catch (error) {
                logger.warn('检查更新失败（已忽略，不影响使用）', error?.message || error)
            } finally {
                perfEnd('update:check')
            }
        }).catch(error => logger.warn('读取自动检查更新配置失败', error?.message || error))
    }
    const idleCallback = window.requestIdleCallback
    if (typeof idleCallback === 'function') {
        idleCallback(run, { timeout: 8000 })
    } else {
        setTimeout(run, 3000)
    }
}
const initializeApp = async () => {
    perfStart('app:init')
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
        perfEnd('app:ready')
        await eventBus.emitMeasured(EVENT_NAMES.APP_READY)
        scheduleUpdateCheck()
        let isProcessingUrlChange = false
        let lastUrl = location.href
        const handleUrlChange = debounce(async () => {
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
            }
        }, 500, { 'leading': true, 'trailing': false })
        monitorHrefChange(handleUrlChange)
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
initScrollbarHoverWidening()
initializeApp()
