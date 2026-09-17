/**
 * 极简 DOM 桩（仅供 Node 侧使用：单测 / 发布侧校验脚本）
 *
 * 目的：让「模块体依赖浏览器 API」的源码（元素选择器、模板注册表、主题管理器…）能在 Node 里被 import，
 * 从而直接复用**运行时同一套校验代码**做发布前检查，而不是另写一份规则。
 *
 * 注意：`querySelector` 的 CSS 语法校验在这里只是**启发式**（真校验在浏览器里做，
 * 运行时也会对每条非法覆盖单独丢弃并告警）；这里挡住的是明显非法写法与 CSS 注入字符。
 */
/** 明显不合法的选择器（返回原因；null = 认为可用） */
const invalidSelectorReason = selector => {
    if (typeof selector !== 'string' || !selector.trim()) return '空选择器'
    if (/[;{}<>\\]/.test(selector)) return '含 CSS 注入字符'
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(selector)) return '含控制字符'
    if (/\/\*|\*\//.test(selector)) return '含注释'
    if (/^[>+~]/.test(selector.trim())) return '以组合符开头'
    if (/#{2,}/.test(selector.replace(/\\./g, ''))) return '单个复合选择器里出现多个 #'
    let depth = 0
    for (const char of selector) {
        if (char === '(' || char === '[') depth++
        if (char === ')' || char === ']') depth--
        if (depth < 0) return '括号/方括号不配对'
    }
    if (depth !== 0) return '括号/方括号不配对'
    return null
}
/**
 * 安装 DOM 桩
 * @param {Object} [options]
 * @param {Map<string, any>} [options.elements] 选择器 → 元素（供需要断言「查到了谁」的场景）
 * @param {(selector: string) => any} [options.onQuerySelector] 自定义查询实现（优先于 elements）
 * @param {(id: string) => any} [options.getElementById] 自定义 id 查询（如返回假的 <style> 断言变量被重写）
 */
export const installDomStub = ({ elements = new Map(), onQuerySelector = null, getElementById = null } = {}) => {
    const createElement = () => ({
        querySelector: selector => {
            const reason = invalidSelectorReason(selector)
            if (reason) throw new SyntaxError(`'${selector}' is not a valid selector（${reason}）`)
            return null
        }
    })
    const document = {
        createElement,
        querySelector: selector => (onQuerySelector ? onQuerySelector(selector) : (elements.get(selector) || null)),
        querySelectorAll: () => [],
        getElementById: id => (getElementById ? getElementById(id) : null),
        createTreeWalker: () => ({ nextNode: () => false, currentNode: null }),
        documentElement: {
            setAttribute: () => {},
            getAttribute: () => null,
            classList: { contains: () => false, add: () => {}, remove: () => {} },
            append: () => {},
            addEventListener: () => {}
        },
        head: { append: () => {} },
        body: { appendChild: () => {}, append: () => {} }
    }
    const location = { host: '', hostname: '', pathname: '/', origin: '', search: '', href: 'https://example.invalid/' }
    Object.assign(globalThis, {
        document,
        location,
        window: {
            location,
            addEventListener: () => {},
            removeEventListener: () => {},
            getComputedStyle: () => ({ getPropertyValue: () => '' }),
            self: globalThis
        },
        MutationObserver: class {
            observe () {}
            disconnect () {}
            takeRecords () { return [] }
        },
        getComputedStyle: () => ({ getPropertyValue: () => '' })
    })
    return { document, invalidSelectorReason }
}
