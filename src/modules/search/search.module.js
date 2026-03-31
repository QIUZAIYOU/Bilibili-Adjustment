import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('SearchModule')
export default {
    name: 'search',
    version: '1.0.0',
    async install () {
        logger.info('搜索结果页模块｜已加载')
        // 这里可以添加搜索结果页的特定功能
    }
}