// ===== scripts/utils/shadowDOMHelper.js =====
// 对齐原始 src/utils/shadowDOMHelper.js（完整版）
window.__biliExt = window.__biliExt || {}

class ShadowDOMHelper {
    constructor () {
        this.observers = new WeakSet()
    }
    _isValidRoot (root) {
        return root instanceof Element || root instanceof Document || root instanceof DocumentFragment
    }
    _traverse (root, selector, mode = 'first') {
        if (!this._isValidRoot(root)) { throw new TypeError(`Invalid root: ${root}`) }
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
            } catch (e) { continue }
            if (node.shadowRoot && !processed.has(node.shadowRoot)) { stack.push(node.shadowRoot) }
            if (node.children) {
                for (let i = node.children.length - 1; i >= 0; i--) { stack.push(node.children[i]) }
            }
        }
        return isAll ? Array.from(results) : null
    }
    querySelector (selector, root = document) { return this._traverse(root, selector, 'first') }
    querySelectorAll (selector, root = document) { return this._traverse(root, selector, 'all') }
    queryDescendant (element, selector, all = false) { return this._traverse(element, selector, all ? 'all' : 'first') }

    observeInsertion (selector, callback, root = document) {
        if (typeof callback !== 'function') { throw new TypeError('callback must be a function') }
        if (!this._isValidRoot(root)) { throw new TypeError(`Invalid root: ${root}`) }
        const processed = new WeakSet()
        let pendingMutations = []
        let timeoutId = null
        const processQueue = []
        let isDraining = false
        const scheduleIdle = (typeof requestIdleCallback === 'function') ? fn => requestIdleCallback(fn) : fn => setTimeout(fn, 1)
        const processBatch = elements => {
            for (const el of elements) {
                if (!processed.has(el)) {
                    processed.add(el)
                    try { callback(el) } catch (e) { console.error('Insertion callback error:', e) }
                }
            }
        }
        const drain = () => {
            if (processQueue.length === 0) { isDraining = false; return }
            isDraining = true
            scheduleIdle(() => {
                const batch = processQueue.splice(0, processQueue.length)
                processBatch(batch)
                isDraining = false
                if (processQueue.length > 0) drain()
            })
        }
        const flush = () => {
            clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
                const elements = this._traverse(root, selector, 'all') || []
                const newElements = elements.filter(el => !processed.has(el))
                if (newElements.length > 0) { processQueue.push(...newElements); if (!isDraining) drain() }
                pendingMutations = []
            }, 16)
        }
        // 处理已存在的元素
        const existing = this._traverse(root, selector, 'all') || []
        if (existing.length > 0) { processQueue.push(...existing); if (!isDraining) drain() }
        const observer = new MutationObserver(() => { flush() })
        observer.observe(root, { childList: true, subtree: true })
        this.observers.add(observer)
        const observeShadowRoots = (node) => {
            if (node.shadowRoot) { observer.observe(node.shadowRoot, { childList: true, subtree: true }); observeShadowRoots(node.shadowRoot) }
            for (let i = 0; i < (node.children?.length || 0); i++) { observeShadowRoots(node.children[i]) }
        }
        observeShadowRoots(root)
        return () => {
            observer.disconnect()
            this.observers.delete(observer)
            clearTimeout(timeoutId)
            pendingMutations = []
        }
    }
}

window.__biliExt.ShadowDOMHelper = ShadowDOMHelper
window.__biliExt.shadowDOMHelper = new ShadowDOMHelper()
