/**
 * 选择器注册与验证中心
 * 提供统一的选择器注册、验证、追踪和性能监控功能
 */
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('SelectorRegistry')
// 选择器元数据存储
const selectorRegistry = new Map()
// 使用统计
const usageStats = new Map()
// 性能计时
const perfStats = new Map()
// 模板关联映射
const templateBindings = new Map()
/**
 * 注册选择器
 * @param {string} name - 选择器名称
 * @param {string} selector - CSS 选择器字符串
 * @param {Object} meta - 元数据 { category, description, templateRefs }
 */
export function registerSelector (name, selector, meta = {}) {
    if (typeof name !== 'string' || !name.trim()) {
        throw new TypeError('选择器名称必须是有效字符串')
    }
    if (typeof selector !== 'string' || !selector.trim()) {
        throw new TypeError('CSS 选择器必须是有效字符串')
    }
    // 验证选择器语法合法性
    try {
        document.createElement('div').querySelector(selector)
    } catch {
        throw new SyntaxError(`选择器 "${name}" 的 CSS 语法无效: "${selector}"`)
    }
    selectorRegistry.set(name, {
        selector,
        category: meta.category || 'general',
        description: meta.description || '',
        templateRefs: new Set(meta.templateRefs || []),
        registeredAt: Date.now()
    })
    // 初始化使用统计
    if (!usageStats.has(name)) {
        usageStats.set(name, { count: 0, lastUsed: null, avgQueryTime: 0 })
    }
    logger.debug(`选择器已注册: ${name} = "${selector}"`)
}
/**
 * 批量注册选择器
 * @param {Object} selectors - { name: selector, ... }
 * @param {Object} metaMap - { name: meta, ... }
 */
export function registerSelectors (selectors, metaMap = {}) {
    Object.entries(selectors).forEach(([name, selector]) => {
        registerSelector(name, selector, metaMap[name])
    })
}
/**
 * 获取已注册的选择器
 * @param {string} name
 * @returns {string|null}
 */
export function getSelector (name) {
    const entry = selectorRegistry.get(name)
    if (!entry) {
        logger.warn(`未注册的选择器被访问: "${name}"，请先在 SelectorRegistry 中注册`)
        return null
    }
    return entry.selector
}
/**
 * 验证选择器是否已注册
 * @param {string} name
 * @returns {boolean}
 */
export function hasSelector (name) {
    return selectorRegistry.has(name)
}
/**
 * 记录选择器使用
 * @param {string} name
 * @param {number} queryTime - 查询耗时(ms)
 */
export function recordUsage (name, queryTime = 0) {
    if (!usageStats.has(name)) {
        usageStats.set(name, { count: 0, lastUsed: null, avgQueryTime: 0 })
    }
    const stats = usageStats.get(name)
    stats.count++
    stats.lastUsed = Date.now()
    // 移动平均
    stats.avgQueryTime = (stats.avgQueryTime * (stats.count - 1) + queryTime) / stats.count
}
/**
 * 绑定模板引用
 * @param {string} selectorName
 * @param {string} templateName
 */
export function bindTemplate (selectorName, templateName) {
    const entry = selectorRegistry.get(selectorName)
    if (entry) {
        entry.templateRefs.add(templateName)
    }
    if (!templateBindings.has(templateName)) {
        templateBindings.set(templateName, new Set())
    }
    templateBindings.get(templateName).add(selectorName)
}
/**
 * 获取使用统计报告
 * @returns {Object}
 */
export function getUsageReport () {
    const report = []
    usageStats.forEach((stats, name) => {
        const meta = selectorRegistry.get(name) || {}
        report.push({
            name,
            selector: meta.selector || '未知',
            category: meta.category || 'unknown',
            ...stats,
            templateRefs: Array.from(meta.templateRefs || [])
        })
    })
    return report.sort((a, b) => b.count - a.count)
}
/**
 * 获取未使用的选择器列表
 * @returns {string[]}
 */
export function getUnusedSelectors () {
    const unused = []
    selectorRegistry.forEach((meta, name) => {
        const stats = usageStats.get(name)
        if (!stats || stats.count === 0) {
            unused.push(name)
        }
    })
    return unused
}
/**
 * 获取性能报告（按平均查询时间排序）
 * @returns {Array}
 */
export function getPerformanceReport () {
    const report = []
    perfStats.forEach((stats, name) => {
        report.push({ name, ...stats })
    })
    return report.sort((a, b) => b.avgTime - a.avgTime)
}
/**
 * 导出完整注册表（用于调试和文档生成）
 * @returns {Object}
 */
export function exportRegistry () {
    const result = {}
    selectorRegistry.forEach((meta, name) => {
        const stats = usageStats.get(name) || { count: 0, lastUsed: null, avgQueryTime: 0 }
        result[name] = {
            ...meta,
            templateRefs: Array.from(meta.templateRefs),
            stats
        }
    })
    return result
}
/**
 * 获取模板关联的选择器
 * @param {string} templateName
 * @returns {string[]}
 */
export function getTemplateSelectors (templateName) {
    const set = templateBindings.get(templateName)
    return set ? Array.from(set) : []
}
/**
 * 清除所有统计（用于测试）
 */
export function clearStats () {
    usageStats.clear()
    perfStats.clear()
}
// 开发模式下暴露到全局以便调试
if (process.env.NODE_ENV === 'development') {
    window.__SelectorRegistry__ = {
        registry: selectorRegistry,
        usageStats,
        templateBindings,
        exportRegistry,
        getUsageReport,
        getUnusedSelectors
    }
}
