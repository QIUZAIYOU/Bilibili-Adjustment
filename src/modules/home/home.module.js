import { eventBus } from '@/core/event-bus'
import { storageService } from '@/services/storage.service'
import { LoggerService } from '@/services/logger.service'
import { isTabActive } from '@/utils/common'
const logger = new LoggerService('VideoModule')
export default {
    name: 'home',
    dependencies: [],
    version: '1.0.0',
    async install() {
        eventBus.on('app:ready', () => {
            logger.info('首页模块｜已加载')
            this.preFunctions()
        })
    },
    async preFunctions() {
        this.userConfigs = await storageService.getAll()
        if (isTabActive()) {
            logger.info('标签页｜已激活')
        }
    }
}
