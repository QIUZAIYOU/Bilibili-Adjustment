/**
 * 热更配置服务：拉取/缓存「远程覆盖表」，并驱动各目标模块应用
 *
 * 策略：**缓存优先 + 后台刷新**（stale-while-revalidate）
 * - 启动时**同步**应用本地缓存里的覆盖（零延迟，保证在选择器/正则被各功能查询之前就已生效）；
 * - 随后后台拉取远端最新表：成功则写入缓存**并立即应用**（本次会话后续查询即用新值，下次打开页面用缓存值）；
 * - 拉不到就什么都不覆盖（内置值照常工作），绝不抛错、绝不清空缓存。
 *
 * 表 → 目标模块的注册关系见 `src/shared/hot-config-registry.ts`：本服务**不 import 任何目标模块**，
 * 因此不会把懒加载的页面模块（正则/模板…）拖进首屏包，也不存在循环引用。
 * 安全边界见 src/shared/hot-config.ts：只覆盖已存在的 key、逐条校验、非法项丢弃。
 */
import { LoggerService } from '@/services/logger.service'
import { parseHotConfigPayload, describeHotConfig } from '@/shared/hot-config'
import { setHotConfigReporter, setHotConfigEntries, getAcceptedEntries, clearHotConfigStateForTest } from '@/shared/hot-config-registry'
const logger = new LoggerService('HotConfig', { notify: false })
/**
 * 热更资产目录：服务器上与 meta.js 同级的 `hot-config/` 子目录。
 * 目录内的文件仍以 `.js` 结尾，从而命中服务器 `location ~* ^/UserScripts/.*\.(js|css)$`
 * 这条已放行 `*.bilibili.com` 的 CORS 规则（内容其实是 JSON，按文本读取后自解析）。
 */
export const HOT_CONFIG_BASE = 'https://www.asifadeaway.com/UserScripts/bilibili/hot-config/'
/** 拉取超时：这是后台刷新，等不到就用缓存，绝不拖慢首屏 */
const FETCH_TIMEOUT_MS = 3000
const CACHE_PREFIX = 'adj-hot-config-v1:'
/** 表名 → 远端文件地址（表名同时是文件名与缓存键，故三处必须一致） */
const TABLES: Record<string, string> = {
    selectors: `${HOT_CONFIG_BASE}selectors.js`,
    'ai-providers': `${HOT_CONFIG_BASE}ai-providers.js`,
    regexps: `${HOT_CONFIG_BASE}regexps.js`,
    templates: `${HOT_CONFIG_BASE}templates.js`,
    themes: `${HOT_CONFIG_BASE}themes.js`
}
setHotConfigReporter(report => {
    if (report.rejected.length) {
        logger.warn(`热更配置 ${report.table}：丢弃 ${report.rejected.length} 项 — ${report.rejected.join('，')}`)
    }
    logger.debug(describeHotConfig(report.table, report.source, report.applied.length))
})
/** 读取某张表的本地缓存（校验过再返回；写坏了就当没有） */
const readCachedEntries = (table: string): Record<string, unknown> | null => {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + table)
        if (!raw) return null
        const payload = parseHotConfigPayload(raw, table)
        return payload ? payload.entries : null
    } catch {
        return null
    }
}
/** 写入缓存（只写真正生效的条目） */
const writeCachedEntries = (table: string, entries: Record<string, unknown>): void => {
    try {
        localStorage.setItem(CACHE_PREFIX + table, JSON.stringify({ table, overrides: entries, fetchedAt: Date.now() }))
    } catch { /* 隐私模式等场景写不进去：忽略 */ }
}
/** 拉取单张表（失败返回 null，绝不抛错） */
const fetchTable = async (table: string): Promise<Record<string, unknown> | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        const response = await fetch(TABLES[table], { signal: controller.signal, credentials: 'omit' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = parseHotConfigPayload(await response.text(), table)
        if (!payload) throw new Error('内容格式非法')
        return payload.entries
    } catch (error) {
        logger.debug(`热更配置 ${table} 拉取失败：` + (error instanceof Error ? error.message : String(error)))
        return null
    } finally {
        clearTimeout(timer)
    }
}
/**
 * 启动时同步应用缓存里的覆盖（不发起网络请求，零延迟）
 * 必须在功能模块初始化之前调用：目标模块若尚未加载，内容会被暂存，待其注册时自动补应用。
 */
export const applyCachedHotConfig = (): void => {
    for (const table of Object.keys(TABLES)) {
        const entries = readCachedEntries(table)
        if (!entries) {
            logger.debug(describeHotConfig(table, 'none', 0))
            continue
        }
        setHotConfigEntries(table, entries, 'cache')
    }
}
/** 后台刷新所有表：成功即写缓存并立即应用（失败静默） */
export const refreshHotConfig = async (): Promise<void> => {
    await Promise.all(Object.keys(TABLES).map(async table => {
        const entries = await fetchTable(table)
        if (!entries) return
        // 先应用再缓存：只把**真正生效**的条目写进缓存，避免每次启动重复校验必然被丢的垃圾
        const report = setHotConfigEntries(table, entries, 'remote')
        writeCachedEntries(table, getAcceptedEntries(table, report))
    }))
}
/** 仅测试用：清空所有表缓存与暂存内容 */
export const clearHotConfigCacheForTest = (): void => {
    clearHotConfigStateForTest()
    for (const table of Object.keys(TABLES)) {
        try {
            localStorage.removeItem(CACHE_PREFIX + table)
        } catch { /* 忽略 */ }
    }
}
