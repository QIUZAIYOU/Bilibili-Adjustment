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
    static PAGE_TYPE_PREFIX = getPageTypePrefix()
    constructor (module) {
        this.module = module
    }
    // 通用的日志记录方法
    log (level, ...args) {
        if (LoggerService.ENABLED_LEVELS[level]) {
            console.log(`%c${LoggerService.PAGE_TYPE_PREFIX}${level === 'debug' ? '(调试)丨' : ''}${import.meta.env.DEV ? this.module : ''}`, LoggerService.LEVELS[level], ...args)
        }
    }
    // 记录信息级别的日志
    info (...args) {
        this.log('info', ...args)
    }
    // 记录错误级别的日志
    error (...args) {
        this.log('error', ...args)
    }
    // 记录警告级别的日志
    warn (...args) {
        this.log('warn', ...args)
    }
    // 记录调试级别的日志
    debug (...args) {
        this.log('debug', ...args)
    }
}
