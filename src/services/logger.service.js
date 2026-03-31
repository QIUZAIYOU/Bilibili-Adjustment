const getPageTypePrefix = () => {
    const { host, pathname, origin } = window.location
    const strategies = [
        { test: () => /^\/video\//.test(pathname), type: '播放页调整' },
        { test: () => /^\/bangumi\//.test(pathname), type: '番剧页调整' },
        { test: () => host === 'www.bilibili.com' && pathname === '/', type: '首页调整' },
        { test: () => origin === 'https://t.bilibili.com', type: '动态页调整' }
    ]
    const matched = strategies.find(s => s.test())
    return matched?.type || '其他页调整'
}
export class LoggerService {
    static LEVELS = {
        info: 'color:white;background:#006aff;padding:2px;border-radius:2px',
        error: 'color:white;background:#f33;padding:2px;border-radius:2px',
        warn: 'color:white;background:#ff6d00;padding:2px;border-radius:2px',
        debug: 'color:white;background:#cc00ff;padding:2px;border-radius:2px'
    }
    static ENABLED_LEVELS = {
        info: true,
        error: true,
        warn: true,
        debug: import.meta.env.DEV
    }
    
    // 根据用户配置更新日志级别
    static async updateLogLevelsFromConfig() {
        try {
            // 动态导入 ConfigService，避免循环依赖
            const { ConfigService } = await import('@/services/config.service')
            const logLevels = {
                info: await ConfigService.getValue('log_level_info'),
                error: await ConfigService.getValue('log_level_error'),
                warn: await ConfigService.getValue('log_level_warn'),
                debug: await ConfigService.getValue('log_level_debug')
            }
            this.updateLogLevels(logLevels)
        } catch (error) {
            console.error('更新日志级别失败:', error)
        }
    }
    static get PAGE_TYPE_PREFIX () {
        return getPageTypePrefix()
    }
    constructor (module) {
        this.module = module
    }
    log (level, ...args) {
        if (LoggerService.ENABLED_LEVELS[level]) {
            const timestamp = new Date().toLocaleTimeString()
            console.log(`%c${LoggerService.PAGE_TYPE_PREFIX} ${timestamp}${level === 'debug' ? `(调试)丨${this.module}` : import.meta.env.DEV ? ` ${this.module}` : ''}`, LoggerService.LEVELS[level], ...args)
        }
    }
    info (...args) {
        this.log('info', ...args)
    }
    error (...args) {
        this.log('error', ...args)
    }
    warn (...args) {
        this.log('warn', ...args)
    }
    debug (...args) {
        this.log('debug', ...args)
    }
    // 静态方法：更新日志级别配置
    static updateLogLevels(levels) {
        Object.assign(LoggerService.ENABLED_LEVELS, levels)
    }
    // 静态方法：获取当前日志级别配置
    static getLogLevels() {
        return { ...LoggerService.ENABLED_LEVELS }
    }
}
