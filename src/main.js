import { eventBus } from '@/core/event-bus'
import { ConfigService } from '@/services/config.service'
import { moduleSystem } from '@/core/module-system'
import { LoggerService } from '@/services/logger.service'

const logger = new LoggerService('EntryPoint')
await ConfigService.initialize()

const moduleContext = require.context('./modules', true, /\.module\.js$/ )

moduleContext.keys().forEach(key => {
    const module = moduleContext(key).default
    const deps = module.dependencies || []
    moduleSystem.register(module, deps)
})

moduleSystem.init().then(() => {
    eventBus.emit('app:ready')
    logger.info('所有模块已加载')
})
