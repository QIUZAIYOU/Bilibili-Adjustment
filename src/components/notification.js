/**
 * 页面通知组件（右上角消息条，Element Plus notification 风格）
 *
 * 惰性创建容器与样式；可被日志/功能模块直接调用：
 *   import { notification } from '@/components/notification'
 *   notification.warn('警告丨模块名', '内容')
 *   notification.error('错误丨模块名', '内容')
 *   notification.show({ level: 'info', title, message, duration: 3000 })
 */
const NOTIFICATION_DURATION = 3000
const NOTIFICATION_MAX = 5
const NOTIFICATION_STYLES = `
    #ba-notification-container {
        position: fixed;
        top: 20px;
        right: 16px;
        z-index: var(--adj-z-notification);
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
        border: 1px solid var(--adj-border-strong);
        background: var(--adj-bg-surface);
        box-shadow: var(--adj-shadow-md);
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
    .ba-notification--warn .ba-notification__icon { color: var(--adj-warning); }
    .ba-notification--error .ba-notification__icon { color: var(--adj-danger); }
    .ba-notification__group {
        flex: 1;
        min-width: 0;
        margin-left: 13px;
        margin-right: 8px;
    }
    .ba-notification__title {
        font-size: 16px;
        font-weight: 700;
        color: var(--adj-text-strong);
        line-height: 24px;
        margin: 0;
    }
    .ba-notification__content {
        font-size: 14px;
        color: var(--adj-text-secondary);
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
        color: var(--adj-text-soft);
        font-size: 16px;
        line-height: 16px;
        text-align: center;
        transition: color .2s;
    }
    .ba-notification__close:hover { color: var(--adj-text-secondary); }
    .ba-notification__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        border-radius: 0 2px 0 0;
        transition: width .1s linear;
    }
    .ba-notification--warn .ba-notification__progress { background: var(--adj-warning); }
    .ba-notification--error .ba-notification__progress { background: var(--adj-danger); }
`
let _notificationContainer = null
let _styleInjected = false
const _ensureNotificationContainer = () => {
    if (_notificationContainer && _notificationContainer.isConnected) return _notificationContainer
    if (!_styleInjected) {
        const style = document.createElement('style')
        style.textContent = NOTIFICATION_STYLES
        document.head.appendChild(style)
        _styleInjected = true
    }
    _notificationContainer = document.createElement('div')
    _notificationContainer.id = 'ba-notification-container'
    document.body.appendChild(_notificationContainer)
    return _notificationContainer
}
const _levelIcons = {
    info: '',
    warn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 192a58.432 58.432 0 0 0-58.24 63.744l23.36 256.384a35.072 35.072 0 0 0 69.76 0l23.296-256.384A58.432 58.432 0 0 0 512 256m0 512a51.2 51.2 0 1 0 0-102.4 51.2 51.2 0 0 0 0 102.4"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 393.664L407.936 353.6a38.4 38.4 0 1 0-54.336 54.336L457.664 512 353.6 616.064a38.4 38.4 0 1 0 54.336 54.336L512 566.336 616.064 670.4a38.4 38.4 0 1 0 54.336-54.336L566.336 512 670.4 407.936a38.4 38.4 0 1 0-54.336-54.336z"/></svg>'
}
const _dismiss = el => {
    if (!el || !el.parentNode) return
    el.classList.add('ba-dismiss')
    setTimeout(() => el.parentNode?.removeChild(el), 300)
}
export const notification = {
    /**
     * 显示一条通知
     * @param {Object} options
     * @param {'info'|'warn'|'error'} [options.level='info']
     * @param {string} [options.title]
     * @param {string} [options.message]
     * @param {number} [options.duration=3000] 自动关闭毫秒数（0 = 不自动关闭）
     */
    show ({ level = 'info', title = '', message = '', duration = NOTIFICATION_DURATION } = {}) {
        const container = _ensureNotificationContainer()
        while (container.children.length >= NOTIFICATION_MAX) {
            _dismiss(container.firstElementChild)
        }
        const icon = _levelIcons[level] || ''
        const el = document.createElement('div')
        el.className = `ba-notification ba-notification--${level}`
        el.innerHTML = `<span class="ba-notification__icon">${icon}</span><div class="ba-notification__group"><p class="ba-notification__title">${title}</p><div class="ba-notification__content">${message}</div></div><button class="ba-notification__close">×</button><div class="ba-notification__progress" style="width:100%"></div>`
        el.querySelector('.ba-notification__close').addEventListener('click', e => {
            e.stopPropagation()
            _dismiss(el)
        })
        const bar = el.querySelector('.ba-notification__progress')
        requestAnimationFrame(() => {
            bar.style.transition = `width ${duration}ms linear`
            bar.style.width = '0%'
        })
        container.appendChild(el)
        if (duration > 0) {
            setTimeout(() => _dismiss(el), duration)
        }
        return el
    },
    warn (title, message) {
        return this.show({ level: 'warn', title, message })
    },
    error (title, message) {
        return this.show({ level: 'error', title, message })
    }
}
