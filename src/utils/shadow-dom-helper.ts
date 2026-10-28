import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('ShadowDOMHelper')
/** 可穿透 Shadow DOM 的查询根节点 */
export type QueryRoot = Element | Document | DocumentFragment
/** 单批回调的条目数：避免一次性处理大量匹配元素阻塞主线程 */
const CALLBACK_CHUNK_SIZE = 100
/** 变更合并窗口（ms）：一批插入只扫描一次 */
const MUTATION_DELAY_MS = 50
/** requestIdleCallback 的超时兜底（ms）：页面繁忙时最多等这么久就必须开始首次扫描 */
const IDLE_TIMEOUT_MS = 1000
/**
 * 校验根节点是否合法。
 * 用 `typeof` 守卫是因为部分运行环境（与裁剪过的 JSDOM）不一定暴露 `ShadowRoot` 全局，
 * 直接 `instanceof ShadowRoot` 会抛 ReferenceError。
 */
export function isValidQueryRoot (root: unknown): root is QueryRoot {
    if (root instanceof Element || root instanceof Document) return true
    return typeof DocumentFragment !== 'undefined' && root instanceof DocumentFragment
}
/**
 * 统一的 CSS 选择器校验：遍历与监听共用同一套判定，避免两处逻辑漂移。
 */
export function assertValidSelector (selector: string): void {
    if (typeof selector !== 'string' || selector.length === 0) {
        throw new TypeError('selector must be a non-empty string')
    }
    try {
        document.createDocumentFragment().querySelector(selector)
    } catch {
        throw new TypeError(`Invalid CSS selector: "${selector}"`)
    }
}
/**
 * 取元素**自身**的 ShadowRoot。
 * ⚠️ `collectShadowRoots` 靠 TreeWalker 遍历后代，而 TreeWalker **不包含根节点自身**，
 * 所以「宿主自己就是 shadow host」的情况（评论区 `bili-comment-renderer` 正是如此）
 * 必须在这里单独取，否则 `queryDescendant(host, …)` 查不到自己 shadow 树里的内容
 * （真实故障：评论区的 IP 属地消失，2026-10-28）。
 */
function ownShadowRoot (root: QueryRoot): ShadowRoot | null {
    return root instanceof Element ? root.shadowRoot : null
}
/**
 * 收集 `root` 的**直属**树里所有的 ShadowRoot（不进入 shadow 树内部，由调用方决定递归顺序）。
 * 用 TreeWalker 替代手写栈：单次原生迭代，省掉大量 push/pop 与数组增长。
 */
export function collectShadowRoots (root: QueryRoot): ShadowRoot[] {
    if (typeof document.createTreeWalker !== 'function') return []
    const found: ShadowRoot[] = []
    const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT)
    let node = walker.nextNode() as Element | null
    while (node) {
        const shadowRoot = node.shadowRoot
        if (shadowRoot) found.push(shadowRoot)
        node = walker.nextNode() as Element | null
    }
    return found
}
/**
 * 跨 Shadow DOM 边界按序查询（`first` 模式）：命中即返回。
 * 顺序约定：当前边界的光照 DOM（原生 querySelector 的文档序）优先，
 * 其后按同样规则深入各个 ShadowRoot，因此**先说光照 DOM，再是 shadow 树**。
 */
export function traverseFirst (root: QueryRoot, selector: string): Element | null {
    assertValidSelector(selector)
    if (!isValidQueryRoot(root)) throw new TypeError(`Invalid root: ${String(root)}`)
    const queue: QueryRoot[] = [root]
    const visited = new WeakSet<object>()
    while (queue.length) {
        const boundary = queue.shift()!
        if (visited.has(boundary)) continue
        visited.add(boundary)
        const found = boundary.querySelector(selector)
        if (found) return found
        const boundaryShadow = ownShadowRoot(boundary)
        if (boundaryShadow) queue.push(boundaryShadow)
        for (const shadowRoot of collectShadowRoots(boundary)) queue.push(shadowRoot)
    }
    return null
}
/**
 * 跨 Shadow DOM 边界按序查询（`all` 模式）：结果按「边界先后 + 边界内文档序」排列，
 * 同一棵边界内由原生 querySelectorAll 保证不重复。
 */
export function traverseAll (root: QueryRoot, selector: string): Element[] {
    assertValidSelector(selector)
    if (!isValidQueryRoot(root)) throw new TypeError(`Invalid root: ${String(root)}`)
    const queue: QueryRoot[] = [root]
    const visited = new WeakSet<object>()
    const results: Element[] = []
    while (queue.length) {
        const boundary = queue.shift()!
        if (visited.has(boundary)) continue
        visited.add(boundary)
        for (const el of boundary.querySelectorAll(selector)) results.push(el)
        const boundaryShadow = ownShadowRoot(boundary)
        if (boundaryShadow) queue.push(boundaryShadow)
        for (const shadowRoot of collectShadowRoots(boundary)) queue.push(shadowRoot)
    }
    return results
}
/**
 * 跨 Shadow DOM 的插入监听器实现。
 * 每个监听器独立持有自己的「已处理元素」集合与扫描队列，生命周期与返回的 stop 函数绑定。
 */
function observeInsertionInternal (selector: string, callback: (el: Element) => void, root: QueryRoot): () => void {
    const processed = new WeakSet<Element>()
    const observedRoots = new WeakSet<object>()
    const queue: QueryRoot[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let draining = false
    const scheduleIdle: (fn: () => void) => void = (typeof requestIdleCallback === 'function')
        ? fn => requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })
        : fn => setTimeout(fn, 0)
    const observer = new MutationObserver((mutations: MutationRecord[]) => {
        // 新出现的 ShadowRoot 必须立刻被观察，否则它内部后续的插入（例如展开楼中楼）会漏掉
        let hasNewNodes = false
        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue
                const element = node as Element
                hasNewNodes = true
                // 元素自身的 shadowRoot 必须单独处理：TreeWalker 只走光照子树，不会进入它自己的 shadow tree
                const ownShadowRoot = element.shadowRoot
                if (ownShadowRoot) observeRoot(ownShadowRoot)
                for (const shadowRoot of collectShadowRoots(element)) observeRoot(shadowRoot)
            }
        }
        if (!hasNewNodes) return
        // 把整棵新增子树入队，由统一遍历器负责穿透其内部的 Shadow DOM（含新增元素自身的 shadowRoot）
        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue
                queue.push(node as Element)
            }
        }
        if (flushTimer) return
        flushTimer = setTimeout(() => {
            flushTimer = null
            if (!cancelled) drain().catch(error => logger.error('插入队列处理失败:', error))
        }, MUTATION_DELAY_MS)
    })
    const observeRoot = (target: QueryRoot): void => {
        if (observedRoots.has(target)) return
        observedRoots.add(target)
        observer.observe(target as Node, { childList: true, subtree: true })
    }
    const drain = async (): Promise<void> => {
        if (draining || cancelled) return
        draining = true
        try {
            while (queue.length && !cancelled) {
                const node = queue.shift()!
                const batch: Element[] = []
                // 元素自身也可能是目标（例如插入的就是标题节点）
                if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(selector)) {
                    batch.push(node as Element)
                }
                for (const el of traverseAll(node, selector)) {
                    if (!processed.has(el)) batch.push(el)
                }
                for (let i = 0; i < batch.length && !cancelled; i += CALLBACK_CHUNK_SIZE) {
                    for (const el of batch.slice(i, i + CALLBACK_CHUNK_SIZE)) {
                        if (cancelled) return
                        if (processed.has(el)) continue
                        processed.add(el)
                        try {
                            callback(el)
                        } catch (error) {
                            logger.error('插入回调执行失败:', error)
                        }
                    }
                    if (i + CALLBACK_CHUNK_SIZE < batch.length) await new Promise<void>(r => setTimeout(r, 0))
                }
            }
        } finally {
            draining = false
        }
    }
    observeRoot(root)
    const rootShadowRoot = (root as Element).shadowRoot
    if (rootShadowRoot) observeRoot(rootShadowRoot)
    for (const shadowRoot of collectShadowRoots(root)) observeRoot(shadowRoot)
    queue.push(root)
    scheduleIdle(() => {
        if (!cancelled) drain().catch(error => logger.error('插入队列处理失败:', error))
    })
    return () => {
        if (cancelled) return
        cancelled = true
        if (flushTimer) {
            clearTimeout(flushTimer)
            flushTimer = null
        }
        queue.length = 0
        observer.disconnect()
    }
}
export class ShadowDOMHelper {
    /**
     * 通过 CSS 选择器获取指定的元素，穿透 Shadow DOM。
     * @param selector - CSS 选择器
     * @param root - 开始查找的根节点（默认 document）
     * @returns 匹配的第一个元素或 null
     */
    querySelector (selector: string, root: QueryRoot = document): Element | null {
        return traverseFirst(root, selector)
    }
    /**
     * 获取所有匹配的元素，穿透 Shadow DOM，结果去重。
     * @param selector - CSS 选择器
     * @param root - 开始查找的根节点（默认 document）
     * @returns 所有匹配的唯一元素
     */
    querySelectorAll (selector: string, root: QueryRoot = document): Element[] {
        return traverseAll(root, selector)
    }
    /**
     * 在指定节点及其后代中查询匹配 CSS 选择器的元素，穿透 Shadow DOM。
     * @param element - 开始查询的节点
     * @param selector - CSS 选择器
     * @param all - 是否返回所有匹配元素
     */
    queryDescendant (element: QueryRoot, selector: string, all?: false): Element | null
    queryDescendant (element: QueryRoot, selector: string, all: true): Element[]
    queryDescendant (element: QueryRoot, selector: string, all = false): Element | null | Element[] {
        return all ? traverseAll(element, selector) : traverseFirst(element, selector)
    }
    /**
     * 监控元素插入并处理现有元素（异步、分批、可停止）。
     * @param selector - CSS 选择器
     * @param callback - 回调函数，接收匹配元素（同一元素只会回调一次）
     * @param root - 监控的根节点（默认 document）
     * @returns 停止监控的函数（可重复调用）
     */
    observeInsertion (selector: string, callback: (el: Element) => void, root: QueryRoot = document): () => void {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function')
        }
        if (!isValidQueryRoot(root)) {
            throw new TypeError(`Invalid root: ${String(root)}`)
        }
        assertValidSelector(selector)
        return observeInsertionInternal(selector, callback, root)
    }
}
