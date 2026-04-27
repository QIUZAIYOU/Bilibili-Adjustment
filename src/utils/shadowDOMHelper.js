/* global */
export class ShadowDOMHelper {
    constructor () {
        this.observers = new WeakSet()
    }
    /**
     * 校验根节点是否合法
     * @param {*} root
     * @returns {boolean}
     */
    _isValidRoot (root) {
        return root instanceof Element || root instanceof Document || root instanceof DocumentFragment
    }
    /**
     * 通用遍历器：负责发现 ShadowRoot 边界，在每个边界内使用原生查询
     * 优化点：避免对每个子节点重复调用原生 querySelector，仅在 ShadowRoot 切换时遍历
     * @param {Element|Document|DocumentFragment} root - 查询根节点
     * @param {string} selector - CSS 选择器
     * @param {'first'|'all'} mode - 查询模式
     * @returns {Element|null|Element[]}
     */
    _traverse (root, selector, mode = 'first') {
        if (!this._isValidRoot(root)) {
            throw new TypeError(`Invalid root: ${root}`)
        }
        const isAll = mode === 'all'
        const results = isAll ? new Set() : null
        const stack = [root]
        const processed = new WeakSet()
        while (stack.length) {
            const node = stack.pop()
            if (processed.has(node)) continue
            processed.add(node)
            try {
                if (isAll) {
                    const matches = node.querySelectorAll(selector)
                    for (const el of matches) results.add(el)
                } else {
                    const found = node.querySelector(selector)
                    if (found) return found
                }
            } catch (e) {
                if (e instanceof DOMException && e.name === 'SyntaxError') {
                    throw new TypeError(`Invalid CSS selector: "${selector}"`)
                }
                continue
            }
            if (node.shadowRoot && !processed.has(node.shadowRoot)) {
                stack.push(node.shadowRoot)
            }
            if (node.children) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push(node.children[i])
                }
            }
        }
        return isAll ? Array.from(results) : null
    }
    /**
     * 通过 CSS 选择器获取指定的元素，穿透 Shadow DOM。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element|null} - 匹配的第一个元素或 null
     */
    querySelector (selector, root = document) {
        return this._traverse(root, selector, 'first')
    }
    /**
     * 获取所有匹配的元素，穿透 Shadow DOM，结果去重。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element[]} - 所有匹配的唯一元素
     */
    querySelectorAll (selector, root = document) {
        return this._traverse(root, selector, 'all')
    }
    /**
     * 在指定节点及其后代中查询匹配 CSS 选择器的元素，穿透 Shadow DOM。
     * @param {Element|ShadowRoot} element - 开始查询的节点
     * @param {string} selector - CSS 选择器
     * @param {boolean} [all=false] - 是否返回所有匹配元素
     * @returns {Element|null|Element[]} - 第一个匹配元素（all=false）或所有匹配元素数组（all=true）
     */
    queryDescendant (element, selector, all = false) {
        return this._traverse(element, selector, all ? 'all' : 'first')
    }
    /**
     * 监控元素插入并处理现有元素，异步化并优化性能。
     * @param {string} selector - CSS 选择器
     * @param {function} callback - 回调函数，接收匹配元素
     * @param {Element|Document} [root=document] - 监控的根节点
     * @returns {Function} - 停止监控的函数
     */
    observeInsertion (selector, callback, root = document) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function')
        }
        if (!this._isValidRoot(root)) {
            throw new TypeError(`Invalid root: ${root}`)
        }
        const processed = new WeakSet()
        let pendingMutations = []
        let timeoutId = null
        const processQueue = []
        let isDraining = false
        const scheduleIdle = (typeof requestIdleCallback === 'function')
            ? fn => requestIdleCallback(fn)
            : fn => setTimeout(fn, 1)
        const processBatch = elements => {
            for (const el of elements) {
                if (!processed.has(el)) {
                    processed.add(el)
                    try {
                        callback(el)
                    } catch (e) {
                        console.error('Insertion callback error:', e)
                    }
                }
            }
        }
        const drainQueue = async () => {
            if (isDraining) return
            isDraining = true
            while (processQueue.length) {
                const node = processQueue.shift()
                const batch = []
                const stack = [node]
                const localProcessed = new WeakSet()
                while (stack.length) {
                    const current = stack.pop()
                    if (localProcessed.has(current)) continue
                    localProcessed.add(current)
                    try {
                        if (current.nodeType === Node.ELEMENT_NODE && current.matches(selector)) {
                            batch.push(current)
                        }
                        const matches = current.querySelectorAll(selector)
                        for (const el of matches) batch.push(el)
                    } catch {
                        // 忽略跨域 ShadowRoot 等错误
                    }
                    if (current.shadowRoot) stack.push(current.shadowRoot)
                    if (current.children) {
                        for (let i = current.children.length - 1; i >= 0; i--) {
                            stack.push(current.children[i])
                        }
                    }
                    if (batch.length > 100) {
                        processBatch(batch.splice(0, 100))
                        await new Promise(r => setTimeout(r, 0))
                    }
                }
                if (batch.length) processBatch(batch)
            }
            isDraining = false
        }
        const initProcess = () => {
            processQueue.push(root)
            drainQueue().catch(console.error)
        }
        scheduleIdle(initProcess)
        const observer = new MutationObserver(mutations => {
            pendingMutations.push(mutations)
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    const batches = pendingMutations
                    pendingMutations = []
                    timeoutId = null
                    const batch = new Set()
                    for (const mutationList of batches) {
                        for (const mutation of mutationList) {
                            if (mutation.type !== 'childList') continue
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType !== Node.ELEMENT_NODE) continue
                                if (node.matches(selector)) batch.add(node)
                                try {
                                    const matches = node.querySelectorAll(selector)
                                    for (const el of matches) batch.add(el)
                                } catch { /* ignore */ }
                                if (node.shadowRoot) {
                                    processQueue.push(node.shadowRoot)
                                    drainQueue().catch(console.error)
                                }
                            }
                        }
                    }
                    processBatch(batch)
                }, 50)
            }
        })
        observer.observe(root, { childList: true, subtree: true })
        this.observers.add(observer)
        const observeShadowRoots = node => {
            const stack = [node]
            const seen = new WeakSet()
            while (stack.length) {
                const current = stack.pop()
                if (seen.has(current)) continue
                seen.add(current)
                if (current.shadowRoot) {
                    observer.observe(current.shadowRoot, { childList: true, subtree: true })
                    stack.push(current.shadowRoot)
                }
                if (current.children) {
                    for (const child of current.children) stack.push(child)
                }
            }
        }
        observeShadowRoots(root)
        return () => {
            observer.disconnect()
            this.observers.delete(observer)
            clearTimeout(timeoutId)
            pendingMutations = []
            // WeakSet 无 clear 方法，丢弃引用由 GC 回收
        }
    }
}
