/**
 * 选择器注册与验证中心
 * 提供统一的选择器注册、验证与查询功能
 */
const selectorRegistry = new Map()

/**
 * 注册选择器
 * @param {string} name - 选择器名称
 * @param {string} selector - CSS 选择器字符串
 * @param {Object} meta - 元数据 { category, description }
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
        description: meta.description || ''
    })
}

/**
 * 获取已注册的选择器 CSS 字符串
 * @param {string} name
 * @returns {string|null}
 */
export function getSelector (name) {
    const entry = selectorRegistry.get(name)
    return entry ? entry.selector : null
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
 * 模板关联（保留以兼容 template-registry.js，实际为空操作）
 */
export function bindTemplate () {}
