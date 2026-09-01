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
// 通知容器与样式
let _notificationContainer = null
const NOTIFICATION_DURATION = 3000
const NOTIFICATION_MAX = 5
const NOTIFICATION_STYLES = `
    #ba-notification-container {
        position: fixed;
        top: 20px;
        right: 16px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 24px;
    }
    .ba-notification {
        position: relative;
        display: flex;
        align-items: flex-start;
        width: 330px;
        padding: 14px 26px 14px 13px;
        border-radius: 8px;
        border: 1px solid #e4e7ed;
        background: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,.08);
        overflow: hidden;
        pointer-events: auto;
        animation: ba-slide-in .35s ease-out;
    }
    .ba-notification.ba-dismiss {
        animation: ba-slide-out .3s ease-in forwards;
    }
    @keyframes ba-slide-in {
        from { opacity: 0; transform: translateX(100%); }
        to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes ba-slide-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(100%); }
    }
    .ba-notification__icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        font-size: 24px;
        line-height: 24px;
    }
    .ba-notification--warn .ba-notification__icon { color: #e6a23c; }
    .ba-notification--error .ba-notification__icon { color: #f56c6c; }
    .ba-notification__group {
        flex: 1;
        min-width: 0;
        margin-left: 13px;
        margin-right: 8px;
    }
    .ba-notification__title {
        font-size: 16px;
        font-weight: 700;
        color: #303133;
        line-height: 24px;
        margin: 0;
    }
    .ba-notification__content {
        font-size: 14px;
        color: #606266;
        line-height: 24px;
        margin-top: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-all;
    }
    .ba-notification__close {
        position: absolute;
        top: 18px;
        right: 15px;
        width: 16px;
        height: 16px;
        border: none;
        background: none;
        cursor: pointer;
        padding: 0;
        color: #909399;
        font-size: 16px;
        line-height: 16px;
        text-align: center;
        transition: color .2s;
    }
    .ba-notification__close:hover { color: #606266; }
    .ba-notification__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        border-radius: 0 2px 0 0;
        transition: width .1s linear;
    }
    .ba-notification--warn .ba-notification__progress { background: #e6a23c; }
    .ba-notification--error .ba-notification__progress { background: #f56c6c; }
`
function _ensureNotificationContainer () {
    if (_notificationContainer) return _notificationContainer
    const style = document.createElement('style')
    style.textContent = NOTIFICATION_STYLES
    document.head.appendChild(style)
    _notificationContainer = document.createElement('div')
    _notificationContainer.id = 'ba-notification-container'
    document.body.appendChild(_notificationContainer)
    return _notificationContainer
}
const _levelIcons = {
    warn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 192a58.432 58.432 0 0 0-58.24 63.744l23.36 256.384a35.072 35.072 0 0 0 69.76 0l23.296-256.384A58.432 58.432 0 0 0 512 256m0 512a51.2 51.2 0 1 0 0-102.4 51.2 51.2 0 0 0 0 102.4"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 393.664L407.936 353.6a38.4 38.4 0 1 0-54.336 54.336L457.664 512 353.6 616.064a38.4 38.4 0 1 0 54.336 54.336L512 566.336 616.064 670.4a38.4 38.4 0 1 0 54.336-54.336L566.336 512 670.4 407.936a38.4 38.4 0 1 0-54.336-54.336z"/></svg>'
}
function _showNotification (level, title, message) {
    const container = _ensureNotificationContainer()
    while (container.children.length >= NOTIFICATION_MAX) {
        _dismissNotification(container.firstElementChild)
    }
    const icon = _levelIcons[level] || ''
    const el = document.createElement('div')
    el.className = `ba-notification ba-notification--${level}`
    el.innerHTML = `<span class="ba-notification__icon">${icon}</span><div class="ba-notification__group"><p class="ba-notification__title">${title}</p><div class="ba-notification__content">${message}</div></div><button class="ba-notification__close">×</button><div class="ba-notification__progress" style="width:100%"></div>`
    el.querySelector('.ba-notification__close').addEventListener('click', (e) => {
        e.stopPropagation()
        _dismissNotification(el)
    })
    const bar = el.querySelector('.ba-notification__progress')
    requestAnimationFrame(() => {
        bar.style.transition = `width ${NOTIFICATION_DURATION}ms linear`
        bar.style.width = '0%'
    })
    container.appendChild(el)
    setTimeout(() => _dismissNotification(el), NOTIFICATION_DURATION)
}
function _dismissNotification (el) {
    if (!el || !el.parentNode) return
    el.classList.add('ba-dismiss')
    setTimeout(() => el.parentNode?.removeChild(el), 300)
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
        debug: import.meta.env?.DEV
    }
    static async updateLogLevelsFromConfig (configValues) {
        try {
            const logLevels = {
                info: configValues?.log_level_info ?? true,
                error: configValues?.log_level_error ?? true,
                warn: configValues?.log_level_warn ?? true,
                debug: configValues?.log_level_debug ?? (import.meta.env?.DEV)
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
            const prefix = `${LoggerService.PAGE_TYPE_PREFIX} ${timestamp}${level === 'debug' ? `(调试)丨${this.module}` : import.meta.env?.DEV ? ` ${this.module}` : ''}`
            console.log(`%c${prefix}`, LoggerService.LEVELS[level], ...args)
            if (level === 'warn' || level === 'error') {
                const title = level === 'warn' ? '⚠️ 警告' : '❌ 错误'
                const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
                _showNotification(level, `${title}丨${this.module}`, msg)
            }
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
    static updateLogLevels (levels) {
        Object.assign(LoggerService.ENABLED_LEVELS, levels)
    }
    static getLogLevels () {
        return { ...LoggerService.ENABLED_LEVELS }
    }
}
