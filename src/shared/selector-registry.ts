/**
 * 选择器注册与验证中心
 * 提供统一的选择器注册、验证与查询功能
 */
/** 已注册选择器：名称 → { 选择器字符串, 分类, 说明 } */
interface SelectorEntry {
    selector: string
    category: string
    description: string
}
const selectorRegistry = new Map<string, SelectorEntry>()
/**
 * 注册选择器
 * @param {string} name - 选择器名称
 * @param {string} selector - CSS 选择器字符串
 * @param {Object} meta - 元数据 { category, description }
 */
export function registerSelector (name: string, selector: string, meta: { category?: string; description?: string } = {}): void {
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
export function getSelector (name: string): string | null {
    const entry = selectorRegistry.get(name)
    return entry ? entry.selector : null
}
/**
 * 验证选择器是否已注册
 * @param {string} name
 * @returns {boolean}
 */
export function hasSelector (name: string): boolean {
    return selectorRegistry.has(name)
}
/**
 * 模板关联（保留以兼容 template-registry.js，实际为空操作）
 * 注：历史调用点会传 (selectorName, templateName) 两个参数，故用可变参数保持兼容。
 */
export function bindTemplate (...args: unknown[]): void {
    void args
}
