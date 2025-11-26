import _ from 'lodash'
import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('Main')
import { insertStyleToDocument, detectivePageType, promptForUpdate } from '@/utils/common'
import { styles } from '@/shared/styles'
import pkg from '../package.json' with { type: 'json' }
window._ = _
const initializeApp = () => {
    ConfigService.initialize().then(() => {
        logger.debug('ConfigService 初始化完成')
        return detectivePageType()
    }).then(currentModuleType => {
        logger.debug(`页面类型: ${currentModuleType}`)
        const moduleMap = {
            'video': () => import('@/modules/video/video.module.js'),
            'home': () => import('@/modules/home/home.module.js'),
            'dynamic': () => import('@/modules/dynamic/dynamic.module.js')
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
}
insertStyleToDocument({ 'BilibiliAdjustmentStyle': styles.BilibiliAdjustment })
initializeApp()
setTimeout(async () => {
    try {
        // 检查用户是否启用了自动检查更新
        const autoCheckUpdate = await ConfigService.getValue('auto_check_update')
        if (autoCheckUpdate) {
            await promptForUpdate(pkg.version, pkg.updates)
        } else {
            logger.info('自动检查更新已被用户禁用')
        }
    } catch (error) {
        logger.error('检查更新配置失败', error)
    }
}, 0)
