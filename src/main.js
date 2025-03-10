// src/main.js
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('Main')
import { detectivePageType } from '@/utils/common'
ConfigService.initialize().then(() => {
    logger.debug('ConfigService 初始化完成')
    return detectivePageType()
}).then(currentModuleType => {
    logger.debug(`页面类型: ${currentModuleType}`)
    // 手动定义模块路径映射表
    const moduleMap = {
        'video': () => import('@/modules/video/video.module.js'),
        'home': () => import('@/modules/home/home.module.js'),
        'dynamic': () => import('@/modules/dynamic/dynamic.module.js')
        // 添加其他模块类型...
    }
    if (moduleMap[currentModuleType]) {
        return moduleMap[currentModuleType]().then(module => {
            const moduleConfig = module.default
            logger.debug(`注册模块: ${moduleConfig.name}`)
            moduleSystem.register(moduleConfig)
        })
    } else {
        logger.error(`No module found for type: ${currentModuleType}`)
    }
}).then(() => moduleSystem.init()).then(() => {
    logger.info('应用初始化完成')
    eventBus.emit('app:ready')
}).catch(error => {
    logger.error('应用初始化失败', error)
})
