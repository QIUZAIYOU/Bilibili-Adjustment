import _ from 'lodash'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
import { insertStyleToDocument, detectivePageType, monitorHrefChange } from '@/utils/common'
import { initScrollbarHoverWidening } from '@/utils/scrollbar-hover'
import { updateService } from '@/services/update.service'
import { stylesV2 } from '@/shared/styles'
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
insertStyleToDocument({ 'BilibiliAdjustmentStyle': stylesV2.BilibiliAdjustment })
initScrollbarHoverWidening()
initializeApp()
