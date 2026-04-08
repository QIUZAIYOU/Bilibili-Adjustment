import _ from 'lodash'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('Main')
import { insertStyleToDocument, detectivePageType, monitorHrefChange } from '@/utils/common'
import { updateService } from '@/services/update.service'
import { styles } from '@/shared/styles'
import pkg from '../package.json' with { type: 'json' }
window._ = _

// 模块缓存，避免重复加载
const moduleCache = new Map()
// 跟踪当前页面类型
let currentModuleType = null

// 防抖函数，避免频繁的页面类型检测
const debouncedDetectPageType = _.debounce(async () => {
    try {
        const newModuleType = await detectivePageType()
        logger.debug(`页面类型: ${newModuleType}`)
        
        // 只有当页面类型发生变化时才重新加载模块
        if (newModuleType === currentModuleType) {
            logger.debug(`页面类型未变化，跳过模块加载: ${newModuleType}`)
            return
        }
        
        currentModuleType = newModuleType
        const moduleMap = {
            'video': () => import('@/modules/video/video.module.js'),
            'home': () => import('@/modules/home/home.module.js'),
            'dynamic': () => import('@/modules/dynamic/dynamic.module.js'),
            // 预留新页面类型的模块加载路径
            'space': () => import('@/modules/space/space.module.js'),
            'search': () => import('@/modules/search/search.module.js'),
            'anime': () => import('@/modules/anime/anime.module.js'),
            'gamecenter': () => import('@/modules/gamecenter/gamecenter.module.js')
        }
        if (moduleMap[newModuleType]) {
            // 检查缓存中是否已有该模块
            if (moduleCache.has(newModuleType)) {
                logger.debug(`从缓存加载模块: ${newModuleType}`)
                const moduleConfig = moduleCache.get(newModuleType)
                moduleSystem.register(moduleConfig)
            } else {
                // 加载新模块并缓存
                return moduleMap[newModuleType]().then(module => {
                    const moduleConfig = module.default
                    logger.debug(`注册模块: ${moduleConfig.name}`)
                    moduleSystem.register(moduleConfig)
                    // 缓存模块
                    moduleCache.set(newModuleType, moduleConfig)
                    logger.debug(`缓存模块: ${newModuleType}`)
                })
            }
        } else if (newModuleType === 'other') {
            // 当页面类型为other时不做任何动作
            logger.debug(`当前页面类型 ${newModuleType}，不做任何动作`)
        } else {
            logger.debug(`当前页面类型 ${newModuleType} 不支持，跳过模块注册`)
        }
    } catch (error) {
        logger.error('页面类型检测失败', error)
    }
}, 300, { 'leading': true, 'trailing': false })

const initializeApp = () => {
    ConfigService.initialize().then(() => {
        logger.debug('ConfigService 初始化完成')
        // 根据用户配置更新日志级别，动态导入 LoggerService 避免循环依赖
        return import('@/services/logger.service').then(({ LoggerService }) => {
            return LoggerService.updateLogLevelsFromConfig()
        })
    }).then(() => {
        return debouncedDetectPageType()
    }).then(() => moduleSystem.init()).then(() => {
        logger.info('应用初始化完成')
        eventBus.emit('app:ready')
        // 监听URL变化，当URL变化时重新检测页面类型并加载对应模块
        let isProcessingUrlChange = false
        let lastUrl = location.href
        const handleUrlChange = _.debounce(async () => {
            if (isProcessingUrlChange) {
                logger.debug('URL变化处理中，跳过重复触发')
                return
            }
            try {
                const currentUrl = location.href
                if (currentUrl === lastUrl) {
                    logger.debug('URL未变化，跳过处理')
                    return
                }
                lastUrl = currentUrl
                
                isProcessingUrlChange = true
                logger.debug('URL发生变化，重新检测页面类型并加载对应模块')
                // 清空旧模块
                moduleSystem.clearModules()
                // 重新检测页面类型并加载新模块
                await debouncedDetectPageType()
                // 重新初始化模块系统
                await moduleSystem.init()
                logger.info('模块系统重新初始化完成')
                eventBus.emit('app:ready')
            } catch (error) {
                logger.error('URL变化处理失败', error)
            } finally {
                isProcessingUrlChange = false
            }
        }, 500, { 'leading': true, 'trailing': false })
        
        monitorHrefChange(handleUrlChange)
    }).catch(error => {
        logger.error('应用初始化失败', error)
    })
}
insertStyleToDocument({ 'BilibiliAdjustmentStyle': styles.BilibiliAdjustment })
initializeApp()

// 检查更新
setTimeout(async () => {
    try {
        // 检查用户是否启用了自动检查更新
        const autoCheckUpdate = await ConfigService.getValue('auto_check_update')
        if (autoCheckUpdate) {
            await updateService.checkForUpdates(pkg.version, pkg.updates)
        } else {
            logger.info('自动检查更新已被用户禁用')
        }
    } catch (error) {
        logger.error('检查更新配置失败', error)
    }
}, 0)
