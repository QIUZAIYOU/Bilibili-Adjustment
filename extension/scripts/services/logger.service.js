// ===== scripts/services/logger.service.js =====
window.__biliExt = window.__biliExt || {}

class LoggerService {
  #name
  #config = { info: true, error: true, warn: true, debug: false }

  static instances = new Map()
  static globalConfig = { info: true, error: true, warn: true, debug: false }

  constructor (name) {
    this.#name = name
    if (LoggerService.instances.has(name)) return LoggerService.instances.get(name)
    LoggerService.instances.set(name, this)
  }

  static updateLogLevelsFromConfig (config) {
    if (config.log_level_info !== undefined) LoggerService.globalConfig.info = !!config.log_level_info
    if (config.log_level_error !== undefined) LoggerService.globalConfig.error = !!config.log_level_error
    if (config.log_level_warn !== undefined) LoggerService.globalConfig.warn = !!config.log_level_warn
    if (config.log_level_debug !== undefined) LoggerService.globalConfig.debug = !!config.log_level_debug
  }

  #shouldLog (level) { return LoggerService.globalConfig[level] }

  #formatMessage (level, message, data) {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = `[BiliAdjust][${timestamp}][${level.toUpperCase()}][${this.#name}]`
    return data ? [prefix, message, data] : [prefix, message]
  }

  info (message, data) { if (this.#shouldLog('info')) console.log(...this.#formatMessage('info', message, data)) }
  error (message, data) { if (this.#shouldLog('error')) console.error(...this.#formatMessage('error', message, data)) }
  warn (message, data) { if (this.#shouldLog('warn')) console.warn(...this.#formatMessage('warn', message, data)) }
  debug (message, data) { if (this.#shouldLog('debug')) console.debug(...this.#formatMessage('debug', message, data)) }
}

window.__biliExt.LoggerService = LoggerService
