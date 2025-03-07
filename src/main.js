import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('main')
import { detectivePageType } from '@/utils/common'
await ConfigService.initialize()
const moduleFiles = import.meta.glob('./modules/**/*.module.js', { eager: true })
const currentModuleType = detectivePageType()
Object.values(moduleFiles).forEach(module => {
    const moduleConfig = module.default
    const deps = moduleConfig.dependencies || []
    if (moduleConfig.name === currentModuleType) {
        moduleSystem.register(moduleConfig, deps)
    }
})
moduleSystem.init().then(() => {
    logger.info('应用初始化完成')
    eventBus.emit('app:ready')
})
