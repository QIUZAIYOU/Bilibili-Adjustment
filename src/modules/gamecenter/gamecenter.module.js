import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('GameCenterModule')
export default {
    name: 'gamecenter',
    version: '1.0.0',
    async install () {
        logger.info('游戏中心模块｜已加载')
        // 这里可以添加游戏中心的特定功能
    }
}
