import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('AnimeModule')
export default {
    name: 'anime',
    version: '1.0.0',
    async install () {
        logger.info('番剧详情页模块｜已加载')
        // 这里可以添加番剧详情页的特定功能
    }
}