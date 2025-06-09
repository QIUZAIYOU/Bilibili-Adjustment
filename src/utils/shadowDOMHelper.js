/* global , DocumentFragment, requestIdleCallback */
export class ShadowDOMHelper {
    constructor () {
        this.observers = new WeakSet()
        this.processedNodes = new WeakSet()
    }
    /**
     * 通过 CSS 选择器获取指定的元素，优化为单次深度优先搜索。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element|null} - 匹配的第一个元素或 null
     */
    querySelector (selector, root = document) {
        const stack = [root]
        const processed = new WeakSet()
        while (stack.length) {
            const node = stack.pop()
            if (processed.has(node)) continue
            processed.add(node)
            try {
                const found = node.querySelector(selector)
                if (found) return found
            } catch (e) {
                continue
            }
            if (node.shadowRoot) {
                stack.push(node.shadowRoot)
            }
            if (node.children) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push(node.children[i])
                }
            }
        }
        return null
    }
    /**
     * 获取所有匹配的元素，使用去重和批量处理。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element[]} - 所有匹配的唯一元素
     */
    querySelectorAll (selector, root = document) {
        const results = new Set()
        const queue = [root]
        const processed = new WeakSet()
        while (queue.length) {
            const node = queue.shift()
            if (processed.has(node)) continue
            processed.add(node)
            try {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
                    results.add(node)
                }
                const matches = node.querySelectorAll(selector)
                for (const element of matches) {
                    results.add(element)
                }
            } catch (e) {
                // 忽略错误
            }
            if (node.shadowRoot) {
                queue.push(node.shadowRoot)
            }
            if (node.children) {
                queue.push(...node.children)
            }
        }
        return Array.from(results)
    }
    /**
     * 在指定节点及其后代中查询匹配 CSS 选择器的元素。
     * @param {Element|ShadowRoot} element - 开始查询的节点
     * @param {string} selector - CSS 选择器
     * @param {boolean} [all=false] - 是否返回所有匹配元素
     * @returns {Element|null|Element[]} - 第一个匹配元素（all=false）或所有匹配元素数组（all=true）
     */
    queryDescendant (element, selector, all = false) {
        console.debug('queryDescendant called with element:', element, 'type:', Object.prototype.toString.call(element), 'selector:', selector, 'all:', all)
        if (!element || !(element instanceof Element) && !(element instanceof DocumentFragment)) {
            throw new TypeError(`First argument must be an Element or ShadowRoot, received: ${element}`)
        }
        const stack = [element]
        const processed = new WeakSet()
        const results = all ? new Set() : null
        while (stack.length) {
            const node = stack.pop()
            if (processed.has(node)) continue
            processed.add(node)
            // 检查当前节点
            if (node instanceof Element && node.matches(selector)) {
                if (!all) return node
                results.add(node)
            }
            // 尝试直接查询
            try {
                if (all) {
                    const matches = node.querySelectorAll(selector)
                    for (const match of matches) {
                        results.add(match)
                    }
                } else {
                    const found = node.querySelector(selector)
                    if (found) return found
                }
            } catch (e) {
                continue
            }
            // 添加 ShadowRoot
            if (node.shadowRoot) {
                stack.push(node.shadowRoot)
            }
            // 添加子节点
            if (node.children) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push(node.children[i])
                }
            }
        }
        return all ? Array.from(results) : null
    }
    /**
     * 监控元素插入并处理现有元素，异步化并优化性能。
     * @param {string} selector - CSS 选择器
     * @param {function} callback - 回调函数，接收匹配元素
     * @param {Element|Document} [root=document] - 监控的根节点
     * @returns {Function} - 停止监控的函数
     */
    observeInsertion (selector, callback, root = document) {
        if (typeof this.querySelector !== 'function') {
            throw new TypeError('querySelector is not available on this context')
        }
        const processed = new WeakSet()
        let isProcessing = false
        const processExistingElements = async node => {
            if (isProcessing) return
            isProcessing = true
            const queue = [node]
            const batch = []
            const processBatch = () => {
                for (const element of batch) {
                    if (!processed.has(element)) {
                        processed.add(element)
                        callback(element)
                    }
                }
                batch.length = 0
            }
            while (queue.length) {
                const current = queue.shift()
                if (processed.has(current)) continue
                try {
                    if (current.nodeType === Node.ELEMENT_NODE && current.matches(selector)) {
                        batch.push(current)
                    }
                    const matches = current.querySelectorAll(selector)
                    batch.push(...matches)
                } catch (e) {
                    // 忽略错误
                }
                if (batch.length > 100) {
                    processBatch()
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
                if (current.shadowRoot) {
                    queue.push(current.shadowRoot)
                }
                if (current.children) {
                    queue.push(...current.children)
                }
            }
            if (batch.length) {
                processBatch()
            }
            isProcessing = false
        }
        if (this.querySelector(selector, root)) {
            requestIdleCallback(() => processExistingElements(root).catch(console.error))
        }
        let pendingMutations = []
        let timeoutId = null
        const observer = new MutationObserver(mutations => {
            pendingMutations.push(...mutations)
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    const mutations = pendingMutations
                    pendingMutations = []
                    timeoutId = null
                    const batch = new Set()
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    if (node.matches(selector)) {
                                        batch.add(node)
                                    }
                                    const matches = node.querySelectorAll(selector)
                                    for (const element of matches) {
                                        batch.add(element)
                                    }
                                    if (node.shadowRoot) {
                                        processExistingElements(node.shadowRoot).catch(console.error)
                                    }
                                }
                            }
                        }
                    }
                    for (const element of batch) {
                        if (!processed.has(element)) {
                            processed.add(element)
                            callback(element)
                        }
                    }
                }, 50)
            }
        })
        observer.observe(root, { childList: true, subtree: true })
        this.observers.add(observer)
        const queue = [root]
        while (queue.length) {
            const node = queue.shift()
            if (node.shadowRoot) {
                observer.observe(node.shadowRoot, { childList: true, subtree: true })
                queue.push(node.shadowRoot)
            }
            if (node.children) {
                queue.push(...node.children)
            }
        }
        return () => {
            observer.disconnect()
            this.observers.delete(observer)
            clearTimeout(timeoutId)
            processed.clear()
        }
    }
}
