import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('ShadowDOMHelper')
/* global */
export class ShadowDOMHelper {
    /** 已注册的 MutationObserver（WeakSet 仅用于保持引用/去重） */
    private observers = new WeakSet<MutationObserver>()
    /**
     * 校验根节点是否合法
     */
    _isValidRoot (root: unknown): boolean {
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
    _traverse (root: Element | Document | DocumentFragment, selector: string, mode: 'first' | 'all' = 'first'): Element | Element[] | null {
        if (!this._isValidRoot(root)) {
            throw new TypeError(`Invalid root: ${root}`)
        }
        const isAll = mode === 'all'
        const results: Set<Element> | null = isAll ? new Set<Element>() : null
        const stack: Array<Element | Document | DocumentFragment> = [root]
        const processed = new WeakSet()
        while (stack.length) {
            const node = stack.pop()!
            if (processed.has(node)) continue
            processed.add(node)
            // 仅在根节点与 ShadowRoot 边界执行原生查询，避免对每个子节点重复 querySelector
            if (node === root || node instanceof ShadowRoot) {
                try {
                    if (isAll) {
                        for (const el of node.querySelectorAll(selector)) results?.add(el)
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
            }
            // shadowRoot / children 只存在于 Element（Document 与 DocumentFragment 上分别缺失/等价），统一按 Element 读取
            const nodeEl = node as Element
            if (nodeEl.shadowRoot && !processed.has(nodeEl.shadowRoot)) {
                stack.push(nodeEl.shadowRoot)
            }
            if (nodeEl.children) {
                for (let i = nodeEl.children.length - 1; i >= 0; i--) {
                    stack.push(nodeEl.children[i])
                }
            }
        }
        return isAll && results ? Array.from(results) : null
    }
    /**
     * 通过 CSS 选择器获取指定的元素，穿透 Shadow DOM。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element|null} - 匹配的第一个元素或 null
     */
    querySelector (selector: string, root: Element | Document = document): Element | null {
        return this._traverse(root, selector, 'first') as Element | null
    }
    /**
     * 获取所有匹配的元素，穿透 Shadow DOM，结果去重。
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} [root=document] - 开始查找的根节点
     * @returns {Element[]} - 所有匹配的唯一元素
     */
    querySelectorAll (selector: string, root: Element | Document = document): Element[] {
        return this._traverse(root, selector, 'all') as Element[]
    }
    /**
     * 在指定节点及其后代中查询匹配 CSS 选择器的元素，穿透 Shadow DOM。
     * @param {Element|ShadowRoot} element - 开始查询的节点
     * @param {string} selector - CSS 选择器
     * @param {boolean} [all=false] - 是否返回所有匹配元素
     * @returns {Element|null|Element[]} - 第一个匹配元素（all=false）或所有匹配元素数组（all=true）
     */
    queryDescendant (element: Element | ShadowRoot, selector: string, all = false): Element | Element[] | null {
        return this._traverse(element, selector, all ? 'all' : 'first')
    }
    /**
     * 监控元素插入并处理现有元素，异步化并优化性能。
     * @param {string} selector - CSS 选择器
     * @param {function} callback - 回调函数，接收匹配元素
     * @param {Element|Document} [root=document] - 监控的根节点
     * @returns {Function} - 停止监控的函数
     */
    observeInsertion (selector: string, callback: (el: Element) => void, root: Element | Document = document): () => void {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function')
        }
        if (!this._isValidRoot(root)) {
            throw new TypeError(`Invalid root: ${root}`)
        }
        try {
            document.createElement('div').matches(selector)
        } catch {
            throw new TypeError(`Invalid CSS selector: "${selector}"`)
        }
        const processed = new WeakSet<Element>()
        let pendingMutations: MutationRecord[][] = []
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let cancelled = false
        const processQueue: Array<Element | Document | DocumentFragment> = []
        let isDraining = false
        const scheduleIdle: (fn: () => void) => void = (typeof requestIdleCallback === 'function')
            ? fn => requestIdleCallback(fn)
            : fn => setTimeout(fn, 1)
        const processBatch = (elements: Iterable<Element>): void => {
            for (const el of elements) {
                if (!processed.has(el)) {
                    processed.add(el)
                    try {
                        callback(el)
                    } catch (e) {
                        logger.error('插入回调执行失败:', e)
                    }
                }
            }
        }
        const drainQueue = async (): Promise<void> => {
            if (isDraining) return
            isDraining = true
            while (processQueue.length && !cancelled) {
                const node = processQueue.shift()!
                const batch: Element[] = []
                // 复用 _traverse 的边界查询，避免逐节点重复 querySelector
                // 注：nodeType 判断在前，非元素节点（Document/DocumentFragment）不会走到 matches
                const nodeEl = node as Element
                if (nodeEl.nodeType === Node.ELEMENT_NODE && nodeEl.matches(selector)) {
                    batch.push(nodeEl)
                }
                for (const el of this._traverse(node, selector, 'all') as Element[]) {
                    batch.push(el)
                }
                while (batch.length) {
                    if (cancelled) break
                    processBatch(batch.splice(0, 100))
                    if (batch.length) await new Promise(r => setTimeout(r, 0))
                }
            }
            isDraining = false
        }
        const initProcess = (): void => {
            processQueue.push(root)
            drainQueue().catch(error => logger.error('插入队列处理失败:', error))
        }
        scheduleIdle(initProcess)
        const observer = new MutationObserver((mutations: MutationRecord[]) => {
            pendingMutations.push(mutations)
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    const batches = pendingMutations
                    pendingMutations = []
                    timeoutId = null
                    const batch = new Set<Element>()
                    for (const mutationList of batches) {
                        for (const mutation of mutationList) {
                            if (mutation.type !== 'childList') continue
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType !== Node.ELEMENT_NODE) continue
                                const nodeEl = node as Element
                                if (nodeEl.matches(selector)) batch.add(nodeEl)
                                try {
                                    const matches = nodeEl.querySelectorAll(selector)
                                    for (const el of matches) batch.add(el)
                                } catch { /* ignore */ }
                                if (nodeEl.shadowRoot) {
                                    // 新挂载的 shadow root 必须纳入观察，否则其内部后续插入无法触发回调
                                    observeShadowRoots(nodeEl)
                                    processQueue.push(nodeEl.shadowRoot)
                                    drainQueue().catch(error => logger.error('插入队列处理失败:', error))
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
        const observeShadowRoots = (node: Element | Document | DocumentFragment): void => {
            const stack: Array<Element | Document | DocumentFragment> = [node]
            const seen = new WeakSet<Element | Document | DocumentFragment>()
            while (stack.length) {
                const current = stack.pop()!
                if (seen.has(current)) continue
                seen.add(current)
                const currentEl = current as Element
                if (currentEl.shadowRoot) {
                    observer.observe(currentEl.shadowRoot, { childList: true, subtree: true })
                    stack.push(currentEl.shadowRoot)
                }
                if (currentEl.children) {
                    for (const child of currentEl.children) stack.push(child)
                }
            }
        }
        observeShadowRoots(root)
        return () => {
            cancelled = true
            observer.disconnect()
            this.observers.delete(observer)
            clearTimeout(timeoutId ?? undefined)
            pendingMutations = []
        }
    }
}
