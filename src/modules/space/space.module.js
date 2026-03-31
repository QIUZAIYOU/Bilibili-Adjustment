import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('SpaceModule')
export default {
    name: 'space',
    version: '1.0.0',
    async install () {
        logger.info('用户空间模块｜已加载')
        // 这里可以添加用户空间页面的特定功能
    }
}