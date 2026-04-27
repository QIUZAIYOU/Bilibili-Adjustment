/**
 * 模板注册与管理中心
 * 提供模板注册、选择器关联、依赖追踪和同步更新功能
 */
import { LoggerService } from '@/services/logger.service'
import { bindTemplate } from './selector-registry'
const logger = new LoggerService('TemplateRegistry')
// 模板存储
const templateRegistry = new Map()
// 模板使用统计
const templateUsageStats = new Map()
// 模板版本追踪
const templateVersions = new Map()
/**
 * 从模板字符串中提取 CSS 选择器
 * @param {string} template
 * @returns {string[]}
 */
const extractSelectorsFromTemplate = template => {
    const selectors = new Set()
    // 匹配 id 选择器
    const idMatches = template.matchAll(/id="([^"]+)"/g)
    for (const match of idMatches) {
        selectors.add(`#${match[1]}`)
    }
    // 匹配 class 选择器（简单提取）
    const classMatches = template.matchAll(/class="([^"]+)"/g)
    for (const match of classMatches) {
        match[1].split(/\s+/).forEach(cls => {
            if (cls.trim()) selectors.add(`.${cls.trim()}`)
        })
    }
    // 匹配自定义标签选择器
    const tagMatches = template.matchAll(/<([a-zA-Z-]+)[\s>]/g)
    for (const match of tagMatches) {
        const tag = match[1]
        if (tag.includes('-') && !tag.startsWith('svg') && !tag.startsWith('path')) {
            selectors.add(tag)
        }
    }
    return Array.from(selectors)
}
/**
 * 注册模板
 * @param {string} name - 模板名称
 * @param {string} template - 模板字符串
 * @param {Object} meta - 元数据 { description, selectors }
 */
export function registerTemplate (name, template, meta = {}) {
    if (typeof name !== 'string' || !name.trim()) {
        throw new TypeError('模板名称必须是有效字符串')
    }
    if (typeof template !== 'string') {
        throw new TypeError('模板内容必须是字符串')
    }
    // 自动提取模板中的选择器
    const extractedSelectors = meta.selectors || extractSelectorsFromTemplate(template)
    templateRegistry.set(name, {
        template,
        description: meta.description || '',
        selectors: extractedSelectors,
        dependencies: new Set(meta.dependencies || []),
        registeredAt: Date.now(),
        updatedAt: Date.now()
    })
    // 初始化版本
    if (!templateVersions.has(name)) {
        templateVersions.set(name, 1)
    }
    // 自动关联选择器与模板
    extractedSelectors.forEach(selector => {
        // 尝试从选择器字符串中提取 ID 或 class 名称
        const idMatch = selector.match(/^#(.+)$/)
        const classMatch = selector.match(/^\.(.+)$/)
        const selectorName = idMatch?.[1] || classMatch?.[1] || selector
        bindTemplate(selectorName, name)
    })
    logger.debug(`模板已注册: ${name} (关联 ${extractedSelectors.length} 个选择器)`)
}
/**
 * 批量注册模板
 * @param {Object} templates - { name: template, ... }
 * @param {Object} metaMap - { name: meta, ... }
 */
export function registerTemplates (templates, metaMap = {}) {
    Object.entries(templates).forEach(([name, template]) => {
        registerTemplate(name, template, metaMap[name])
    })
}
/**
 * 更新模板（保留依赖关系）
 * @param {string} name
 * @param {string} newTemplate
 * @param {Object} meta
 */
export function updateTemplate (name, newTemplate, meta = {}) {
    const existing = templateRegistry.get(name)
    if (!existing) {
        throw new Error(`模板 "${name}" 不存在，无法更新`)
    }
    // 合并元数据
    const mergedMeta = {
        description: meta.description || existing.description,
        selectors: meta.selectors || extractSelectorsFromTemplate(newTemplate),
        dependencies: meta.dependencies ? [...existing.dependencies, ...meta.dependencies] : [...existing.dependencies]
    }
    templateRegistry.set(name, {
        ...existing,
        template: newTemplate,
        selectors: mergedMeta.selectors,
        dependencies: new Set(mergedMeta.dependencies),
        updatedAt: Date.now()
    })
    // 版本递增
    templateVersions.set(name, (templateVersions.get(name) || 1) + 1)
    logger.debug(`模板已更新: ${name} (v${templateVersions.get(name)})`)
}
/**
 * 获取模板
 * @param {string} name
 * @returns {string|null}
 */
export function getTemplate (name) {
    const entry = templateRegistry.get(name)
    if (!entry) {
        logger.warn(`未注册的模板被访问: "${name}"`)
        return null
    }
    return entry.template
}
/**
 * 获取模板元数据
 * @param {string} name
 * @returns {Object|null}
 */
export function getTemplateMeta (name) {
    return templateRegistry.get(name) || null
}
/**
 * 记录模板使用
 * @param {string} name
 */
export function recordTemplateUsage (name) {
    if (!templateUsageStats.has(name)) {
        templateUsageStats.set(name, { count: 0, lastUsed: null })
    }
    const stats = templateUsageStats.get(name)
    stats.count++
    stats.lastUsed = Date.now()
}
/**
 * 获取模板使用报告
 * @returns {Array}
 */
export function getTemplateUsageReport () {
    const report = []
    templateUsageStats.forEach((stats, name) => {
        const meta = templateRegistry.get(name) || {}
        report.push({
            name,
            ...stats,
            selectorCount: meta.selectors?.length || 0,
            dependencyCount: meta.dependencies?.size || 0
        })
    })
    return report.sort((a, b) => b.count - a.count)
}
/**
 * 获取模板依赖图
 * @param {string} name
 * @returns {Object}
 */
export function getTemplateDependencyGraph (name) {
    const entry = templateRegistry.get(name)
    if (!entry) return null
    return {
        name,
        dependencies: Array.from(entry.dependencies),
        selectors: entry.selectors,
        dependentTemplates: []
    }
}
/**
 * 导出完整注册表
 * @returns {Object}
 */
export function exportTemplateRegistry () {
    const result = {}
    templateRegistry.forEach((meta, name) => {
        const stats = templateUsageStats.get(name) || { count: 0, lastUsed: null }
        result[name] = {
            ...meta,
            selectors: meta.selectors,
            dependencies: Array.from(meta.dependencies),
            version: templateVersions.get(name) || 1,
            stats
        }
    })
    return result
}
/**
 * 获取未使用的模板
 * @returns {string[]}
 */
export function getUnusedTemplates () {
    const unused = []
    templateRegistry.forEach((meta, name) => {
        const stats = templateUsageStats.get(name)
        if (!stats || stats.count === 0) {
            unused.push(name)
        }
    })
    return unused
}
/**
 * 同步更新模板中的选择器引用
 * 当选择器变更时，自动更新引用该选择器的所有模板
 * @param {string} oldSelector
 * @param {string} newSelector
 * @returns {number} - 更新的模板数量
 */
export function syncSelectorInTemplates (oldSelector, newSelector) {
    let updatedCount = 0
    templateRegistry.forEach((meta, name) => {
        if (meta.template.includes(oldSelector)) {
            const updatedTemplate = meta.template.replaceAll(oldSelector, newSelector)
            templateRegistry.set(name, {
                ...meta,
                template: updatedTemplate,
                selectors: meta.selectors.map(s => s === oldSelector ? newSelector : s),
                updatedAt: Date.now()
            })
            templateVersions.set(name, (templateVersions.get(name) || 1) + 1)
            updatedCount++
            logger.debug(`模板 "${name}" 中的选择器已同步更新: ${oldSelector} -> ${newSelector}`)
        }
    })
    return updatedCount
}
// 开发模式下暴露到全局
if (process.env.NODE_ENV === 'development') {
    window.__TemplateRegistry__ = {
        registry: templateRegistry,
        usageStats: templateUsageStats,
        templateVersions,
        exportRegistry: exportTemplateRegistry,
        getUsageReport: getTemplateUsageReport,
        getUnusedTemplates
    }
}
