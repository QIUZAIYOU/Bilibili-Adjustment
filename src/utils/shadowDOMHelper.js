/* global Document */
export class ShadowDOMHelper { /**
    /**
     * 通过 CSS 选择器获取指定的元素，即使这个元素在很深的 Shadow Root 中。
     * @param {string} selector - CSS 选择器
     * @param {Element} [root=document] - 开始查找的根节点，默认为 document
     * @returns {Element|null} - 匹配的第一个元素，如果没有找到则返回 null
     */
    querySelector (selector, root = document) {
        const found = root.querySelector(selector)
        if (found) return found
        if (root.shadowRoot) {
            const foundInShadow = this.querySelector(selector, root.shadowRoot)
            if (foundInShadow) return foundInShadow
        }
        for (const child of root.children) {
            const foundInChild = this.querySelector(selector, child)
            if (foundInChild) return foundInChild
        }
        return null
    }
    /**
     * 通过 CSS 选择器获取所有匹配的元素（去重），即使这些元素在很深的 Shadow Root 中。
     * @param {string} selector - CSS 选择器
     * @param {Element} [root=document] - 开始查找的根节点，默认为 document
     * @param {Set<Element>} [seen=new Set()] - 用于跟踪已访问元素的 Set
     * @returns {Element[]} - 所有匹配的唯一元素列表
     */
    querySelectorAll (selector, root = document, seen = new Set()) {
        let results = []
        // 在当前节点查找匹配元素
        const elements = root.querySelectorAll(selector)
        for (const element of elements) {
            if (!seen.has(element)) {
                seen.add(element)
                results.push(element)
            }
        }
        // 如果当前节点有 Shadow Root，则递归查找
        if (root.shadowRoot) {
            const shadowResults = this.querySelectorAll(selector, root.shadowRoot, seen)
            results = results.concat(shadowResults)
        }
        // 遍历所有子节点，递归查找
        for (const child of root.children) {
            const childResults = this.querySelectorAll(selector, child, seen)
            results = results.concat(childResults)
        }
        return results
    }
    /**
     * 监控指定元素的插入，并在新元素插入时触发回调函数。
     * @param {string} selector - CSS 选择器，用于匹配新插入的元素
     * @param {Function} callback - 回调函数，接收新插入的元素作为参数
     * @param {Element} [root=document] - 开始监控的根节点，默认为 document
     * @returns {Function} - 停止监控的函数
     */
    observeInsertion (selector, callback, root = document) {
        const observers = new Set() // 使用 Set 避免重复添加 observer
        // 核心监控函数
        const observe = target => {
            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查当前节点是否匹配选择器
                                if (node.matches(selector)) {
                                    callback(node)
                                }
                                // 检查所有后代节点是否匹配选择器
                                const matchingDescendants = node.querySelectorAll(selector)
                                matchingDescendants.forEach(callback)
                                // 如果新节点有 shadowRoot，监控它
                                if (node.shadowRoot) {
                                    observe(node.shadowRoot)
                                }
                            }
                        }
                    }
                }
            })
            observer.observe(target, { childList: true, subtree: true })
            observers.add(observer)
        }
        // 初始化：监控根节点
        observe(root)
        // 遍历并监控所有已存在的 Shadow Root
        const traverseShadowRoots = node => {
            if (node.shadowRoot) {
                observe(node.shadowRoot)
                traverseShadowRoots(node.shadowRoot) // 递归处理 Shadow DOM 内的 Shadow DOM
            }
            for (const child of node.children) {
                traverseShadowRoots(child)
            }
        }
        traverseShadowRoots(root)
        // 返回停止监控的函数
        return () => {
            observers.forEach(observer => observer.disconnect())
            observers.clear()
        }
    }
    /**
     * 在指定元素及其后代（包括 Shadow DOM）中查询匹配 CSS 选择器的元素
     * @param {Element} element - 开始查询的元素
     * @param {string} selector - CSS 选择器
     * @returns {Element|null} - 匹配的第一个元素，如果没有找到则返回 null
     */
    queryDescendant (element, selector) {
        if (!(element instanceof Element)) {
            throw new TypeError('First argument must be an Element')
        }
        // 检查当前元素是否匹配
        if (element.matches(selector)) {
            return element
        }
        // 在当前元素的子树中查找
        const found = element.querySelector(selector)
        if (found) {
            return found
        }
        // 如果有 Shadow Root，递归查找
        if (element.shadowRoot) {
            const foundInShadow = this.queryDescendant(element.shadowRoot, selector)
            if (foundInShadow) {
                return foundInShadow
            }
        }
        // 遍历子节点
        for (const child of element.children) {
            const foundInChild = this.queryDescendant(child, selector)
            if (foundInChild) {
                return foundInChild
            }
        }
        return null
    }
}
// if (typeof module !== 'undefined' && module.exports) {
//     module.exports = ShadowDomHelper
// }
