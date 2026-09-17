/**
 * 热更配置服务：把「会随外部变化而过期的配置」做成远程可覆盖的覆盖表
 *
 * 策略：**缓存优先 + 后台刷新**（stale-while-revalidate）
 * - 启动时**同步**应用本地缓存里的覆盖（零延迟，保证在选择器被各功能查询之前就已生效）；
 * - 随后后台拉取远端最新表：成功则写入缓存**并立即应用**（本次会话后续查询即用新值，下次打开页面用缓存值）；
 * - 拉不到就什么都不覆盖（内置值照常工作），绝不抛错、绝不清空缓存。
 *
 * 安全边界见 src/shared/hot-config.ts：只覆盖已存在的 key、逐条校验、非法项丢弃。
 */
import { LoggerService } from '@/services/logger.service'
import { overrideSelector } from '@/shared/element-selectors'
import { hasSelector } from '@/shared/selector-registry'
import { AI_PROVIDER_CONFIGS, applyProviderOverrides } from '@/shared/ai-providers'
import { parseHotConfigPayload, pickStringOverrides, pickProviderOverrides, describeHotConfig } from '@/shared/hot-config'
import type { HotConfigSource } from '@/shared/hot-config'
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
/** 表名 → 应用函数（返回值 = 实际生效条数） */
const TABLES: Record<string, { url: string, apply: (entries: Record<string, unknown>) => number }> = {
    selectors: {
        url: `${HOT_CONFIG_BASE}selectors.js`,
        apply: entries => {
            const overrides = pickStringOverrides(entries, hasSelector)
            const applied: string[] = []
            for (const [name, selector] of Object.entries(overrides)) {
                try {
                    // overrideSelector 自带 CSS 语法校验（同时写 registry 与 CSS_MAP），非法选择器会抛错 → 逐条丢弃
                    overrideSelector(name, selector)
                    applied.push(name)
                } catch (error) {
                    logger.warn(`选择器覆盖被拒绝：${name}（${error instanceof Error ? error.message : String(error)}）`)
                }
            }
            if (applied.length) logger.debug('已覆盖选择器：' + applied.join(', '))
            return applied.length
        }
    },
    'ai-providers': {
        url: `${HOT_CONFIG_BASE}ai-providers.js`,
        apply: entries => applyProviderOverrides(
            pickProviderOverrides(entries, provider => Object.prototype.hasOwnProperty.call(AI_PROVIDER_CONFIGS, provider))
        ).length
    }
}
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
/** 写入缓存（把应用过的条目连同更新时间一起存下来） */
const writeCachedEntries = (table: string, entries: Record<string, unknown>, updatedAt: string): void => {
    try {
        localStorage.setItem(CACHE_PREFIX + table, JSON.stringify({ table, overrides: entries, updatedAt, fetchedAt: Date.now() }))
    } catch { /* 隐私模式等场景写不进去：忽略 */ }
}
/** 拉取单张表（失败返回 null，绝不抛错） */
const fetchTable = async (table: string): Promise<Record<string, unknown> | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        const response = await fetch(TABLES[table].url, { signal: controller.signal, credentials: 'omit' })
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
 * 必须在功能模块初始化之前调用，否则选择器覆盖会晚于首次查询。
 */
export const applyCachedHotConfig = (): void => {
    for (const table of Object.keys(TABLES)) {
        const entries = readCachedEntries(table)
        if (!entries) {
            logger.debug(describeHotConfig(table, 'none', 0))
            continue
        }
        const applied = TABLES[table].apply(entries)
        logger.debug(describeHotConfig(table, 'cache', applied))
    }
}
/** 后台刷新所有表：成功即写缓存并立即应用（失败静默） */
export const refreshHotConfig = async (): Promise<void> => {
    await Promise.all(Object.keys(TABLES).map(async table => {
        const entries = await fetchTable(table)
        if (!entries) return
        // 先应用再缓存：应用函数返回的条数就是"真正生效"的数量，避免把被丢弃的条目也写进缓存
        const applied = TABLES[table].apply(entries)
        writeCachedEntries(table, entries, '')
        logger.debug(describeHotConfig(table, 'remote', applied))
    }))
}
/** 仅测试用：清空所有表缓存 */
export const clearHotConfigCacheForTest = (): void => {
    for (const table of Object.keys(TABLES)) {
        try {
            localStorage.removeItem(CACHE_PREFIX + table)
        } catch { /* 忽略 */ }
    }
}
/** 来源类型别名（供测试/日志复用） */
export type { HotConfigSource }
