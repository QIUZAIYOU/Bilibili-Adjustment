import { notification } from '@/components/notification'
import { isNormalVideoPage, isBangumiPage, isActivityVideoPage } from '@/utils/page-type'
/** 日志级别 */
export type LogLevel = 'info' | 'error' | 'warn' | 'debug'
/** 配置服务传入的日志级别开关（字段可缺省） */
export interface LogLevelConfig {
    log_level_info?: boolean
    log_level_error?: boolean
    log_level_warn?: boolean
    log_level_debug?: boolean
}
let cachedPageTypePrefix: string | null = null
const computePageTypePrefix = (): string => {
    const { host, pathname, origin } = window.location
    // 页型判据统一走 utils/page-type.ts（唯一实现），别在这里另写一份路径正则
    if (isNormalVideoPage(pathname) || isActivityVideoPage(pathname)) return '播放页调整'
    if (isBangumiPage(pathname)) return '番剧页调整'
    if (host === 'www.bilibili.com' && pathname === '/') return '首页调整'
    if (origin === 'https://t.bilibili.com') return '动态页调整'
    return '其他页调整'
}
// 页型在单个页面生命周期内不会变（SPA 换页会重载脚本或改 href，但日志前缀只用于阅读），
// 缓存一次即可：旧实现每条日志都跑一遍页型正则（审查 I12）
const getPageTypePrefix = (): string => {
    if (cachedPageTypePrefix === null) cachedPageTypePrefix = computePageTypePrefix()
    return cachedPageTypePrefix
}
/** 测试/SPA 内部跳转后如需刷新前缀可调用 */
export const resetPageTypePrefixCache = (): void => {
    cachedPageTypePrefix = null
}
/**
 * 通知文案的安全序列化（审查 W9）
 *
 * `JSON.stringify(new Error('x'))` 得到 `{}`，而带循环引用的对象会直接抛错 ——
 * 日志路径上抛错会把「记录」变成「崩溃」。这里优先用 Error 的 message，
 * 其余对象在抛错时回落到 String()。
 */
const stringifyForNotification = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.message || value.name
    if (value === undefined || value === null) return String(value)
    try {
        return JSON.stringify(value) ?? String(value)
    } catch {
        return String(value)
    }
}
export class LoggerService {
    static LEVELS = {
        info: 'color:white;background:#006aff;padding:2px;border-radius:2px',
        error: 'color:white;background:#f33;padding:2px;border-radius:2px',
        warn: 'color:white;background:#ff6d00;padding:2px;border-radius:2px',
        debug: 'color:white;background:#cc00ff;padding:2px;border-radius:2px'
    }
    /** 各级别开关；debug 默认仅开发模式开启 */
    static ENABLED_LEVELS: Record<LogLevel, boolean | undefined> = {
        info: true,
        error: true,
        warn: true,
        debug: import.meta.env?.DEV
    }
    static async updateLogLevelsFromConfig (configValues: LogLevelConfig | null | undefined): Promise<void> {
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
    static get PAGE_TYPE_PREFIX (): string {
        return getPageTypePrefix()
    }
    /** 模块名（日志前缀） */
    module: string
    /** 是否在 warn/error 时弹通知条 */
    notify: boolean
    constructor (module: string, { notify = true }: { notify?: boolean } = {}) {
        this.module = module
        this.notify = notify
    }
    /**
     * 输出日志
     *
     * 末尾参数若为**恰好只含 `notify` 的布尔对象**，视为通知开关并从输出参数中摘除
     * （不会被打印）。用法：
     *   logger.error('接口请求失败', error, { notify: false })  // 只进控制台，不弹通知条
     * 仅在 `{ notify: boolean }` 这一精确形态下生效，不会与「第二参数传数据对象」冲突。
     */
    log (level: LogLevel, ...args: unknown[]): void {
        let notifyOverride: boolean | null = null
        const last = args[args.length - 1]
        if (last && typeof last === 'object') {
            const keys = Object.keys(last)
            const maybeNotify = last as { notify?: unknown }
            if (keys.length === 1 && keys[0] === 'notify' && typeof maybeNotify.notify === 'boolean') {
                notifyOverride = maybeNotify.notify
                args = args.slice(0, -1)
            }
        }
        if (LoggerService.ENABLED_LEVELS[level]) {
            const timestamp = new Date().toLocaleTimeString()
            const prefix = `${LoggerService.PAGE_TYPE_PREFIX} ${timestamp}${level === 'debug' ? `(调试)丨${this.module}` : import.meta.env?.DEV ? ` ${this.module}` : ''}`
            console.log(`%c${prefix}`, LoggerService.LEVELS[level], ...args)
            // notifyOverride === false 时按调用点静音（构造参数 notify=false 则是静态全静音）
            if (this.notify && notifyOverride !== false && (level === 'warn' || level === 'error')) {
                const title = level === 'warn' ? '⚠️ 警告' : '❌ 错误'
                // 审查 W9：JSON.stringify(Error) 会得到 {}、循环引用会直接抛在日志路径上，
                // 统一走安全序列化
                const msg = args.map(a => stringifyForNotification(a)).join(' ')
                if (level === 'error') notification.error(`${title}丨${this.module}`, msg)
                else notification.warn(`${title}丨${this.module}`, msg)
            }
        }
    }
    info (...args: unknown[]): void {
        this.log('info', ...args)
    }
    error (...args: unknown[]): void {
        this.log('error', ...args)
    }
    warn (...args: unknown[]): void {
        this.log('warn', ...args)
    }
    debug (...args: unknown[]): void {
        this.log('debug', ...args)
    }
    static updateLogLevels (levels: Partial<Record<LogLevel, boolean | undefined>>): void {
        Object.assign(LoggerService.ENABLED_LEVELS, levels)
    }
    static getLogLevels (): Record<LogLevel, boolean | undefined> {
        return { ...LoggerService.ENABLED_LEVELS }
    }
}
