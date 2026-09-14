import { LoggerService } from '@/services/logger.service'
import { chunk as chunkArray, pick, reduce, snakeCase } from '@/utils/lodash-lite'
const logger = new LoggerService('Common')
/** 页面类型（决定加载哪个页面模块） */
export type PageType = 'video' | 'home' | 'dynamic' | 'other'
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
export const detectivePageType = (): PageType => {
    const { host, pathname, origin } = window.location
    // 过滤临时URL路径
    const temporaryPaths = ['/correspond/', '/api/', '/ajax/', '/pgc/', '/live/', '/h5/', '/game/']
    const isTemporaryPath = temporaryPaths.some(path => pathname.startsWith(path))
    if (isTemporaryPath) {
        logger.debug(`检测到临时URL路径: ${pathname}，跳过页面类型检测`)
        return 'other'
    }
    logger.debug(`检测页面类型: host=${host}, pathname=${pathname}, origin=${origin}`)
    // 视频播放页（包括普通视频、番剧、列表）
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/') || pathname.startsWith('/list/')) {
        logger.debug('匹配到 video 类型页面')
        return 'video'
    }
    // 首页
    if (host === 'www.bilibili.com' && (pathname === '/' || pathname === '/index.html')) {
        logger.debug('匹配到 home 类型页面')
        return 'home'
    }
    // 动态页
    if (origin === 'https://t.bilibili.com') {
        logger.debug('匹配到 dynamic 类型页面')
        return 'dynamic'
    }
    logger.debug('未匹配到已知页面类型，返回 other')
    return 'other'
}
/** 尺寸变化回调：changed 为 false 时不带 size（与旧实现一致） */
export type ElementSizeChangeCallback = (changed: boolean, size?: { width: number; height: number }) => void
export const isElementSizeChange = (el: HTMLElement, callback?: ElementSizeChangeCallback): ResizeObserver => {
    let lastWidth = el.offsetWidth
    let lastHeight = el.offsetHeight
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.contentBoxSize) {
                const target = entry.target as HTMLElement
                const newWidth = target.offsetWidth
                const newHeight = target.offsetHeight
                if (newWidth !== lastWidth || newHeight !== lastHeight) {
                    lastWidth = newWidth
                    lastHeight = newHeight
                    callback?.(true, { width: newWidth, height: newHeight })
                } else {
                    callback?.(false)
                }
            }
        }
    })
    resizeObserver.observe(el)
    return resizeObserver
}
/** documentScrollTo 的选项 */
export interface DocumentScrollToOptions {
    /** 最大重试次数（默认 3） */
    maxRetries?: number
    /** 重试基准延迟（指数退避，默认 300ms） */
    retryDelay?: number
    /** 位置容差（px，默认 2） */
    tolerance?: number
    /** 滚动行为（duration > 0 时逐帧驱动，此值仅用于无动画路径） */
    behavior?: ScrollBehavior
    /** 动画时长（ms，> 0 时用 rAF 逐帧驱动） */
    duration?: number
}
export const documentScrollTo = (offset: number, options: DocumentScrollToOptions = {}): Promise<void> => {
    const {
        maxRetries = 3,
        retryDelay = 300,
        tolerance = 2,
        behavior = 'auto',
        duration = 0
    } = options
    return new Promise<void>((resolve, reject) => {
        let attempts = 0
        const checkPosition = (): boolean => {
            const currentY = window.scrollY
            return currentY === offset ||
                   Math.abs(currentY - offset) <= tolerance ||
                   offset === -5
        }
        // duration > 0 时用 rAF 逐帧驱动滚动以精确控制时长；每帧强制 instant，
        // 避免页面 CSS 的 scroll-behavior:smooth 叠加出缓慢的浏览器平滑滚动
        const animateScroll = (targetY: number, durationMs: number): Promise<void> => {
            if (durationMs <= 0) {
                window.scrollTo({ top: targetY, behavior })
                return Promise.resolve()
            }
            const startY = window.scrollY
            const distance = targetY - startY
            if (Math.abs(distance) <= tolerance) return Promise.resolve()
            const startTime = performance.now()
            return new Promise(resolveAnimation => {
                const ease = (progress: number): number => 1 - Math.pow(1 - progress, 3)
                const step = (now: number): void => {
                    const progress = Math.min(1, (now - startTime) / durationMs)
                    window.scrollTo({ top: startY + distance * ease(progress), behavior: 'instant' })
                    if (progress < 1) {
                        requestAnimationFrame(step)
                    } else {
                        resolveAnimation()
                    }
                }
                requestAnimationFrame(step)
            })
        }
        const attemptScroll = async (): Promise<void> => {
            try {
                await animateScroll(offset, duration)
                await new Promise(r => requestAnimationFrame(r))
                if (checkPosition()) {
                    resolve()
                } else if (attempts < maxRetries) {
                    attempts++
                    setTimeout(attemptScroll, retryDelay * (2 ** (attempts - 1)))
                } else {
                    reject(new Error(`Failed to scroll after ${maxRetries} attempts`))
                }
            } catch (error) {
                reject(error)
            }
        }
        attemptScroll()
    })
}
export const getElementOffsetToDocument = (element: HTMLElement): { top: number; left: number } => {
    // B站 新版视频页滚动时会给播放器容器吸顶（.left-container.scroll-sticky），吸顶锁定时
    // getBoundingClientRect 与 offsetTop 链都会返回"吸住后"的位移坐标，而非真实文档流位置，
    // 原"差异过大时改用链式结果"的兜底因此失效；这里把路径上的 sticky 祖先临时强制为 static，
    // 同步读取真实文档流坐标后立即恢复，不触发重绘、不影响页面状态
    const pinned: Array<{ element: HTMLElement; position: string; top: string; left: string }> = []
    let current: HTMLElement | null = element
    while (current) {
        if (getComputedStyle(current).position === 'sticky') {
            pinned.push({
                element: current,
                position: current.style.position,
                top: current.style.top,
                left: current.style.left
            })
            current.style.position = 'static'
            current.style.top = ''
            current.style.left = ''
        }
        current = current.parentElement
    }
    try {
        let chainTop = 0
        let chainLeft = 0
        current = element
        while (current) {
            chainTop += current.offsetTop
            chainLeft += current.offsetLeft
            current = current.offsetParent as HTMLElement | null
        }
        const computed = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const rectTop = rect.top + window.scrollY - parseFloat(computed.marginTop)
        const rectLeft = rect.left + window.scrollX - parseFloat(computed.marginLeft)
        return {
            // 存在 transform 祖先时 rect 坐标会被平移而链式结果不受影响，差异过大时取链式结果
            top: Math.abs(rectTop - chainTop) > 10 ? chainTop : rectTop,
            left: Math.abs(rectLeft - chainLeft) > 10 ? chainLeft : rectLeft
        }
    } finally {
        for (let i = pinned.length - 1; i >= 0; i--) {
            const { element: sticky, position, top, left } = pinned[i]
            sticky.style.position = position
            sticky.style.top = top
            sticky.style.left = left
        }
    }
}
export const getElementComputedStyle = (element: Element, propertyName?: string | string[]): unknown => {
    const style = window.getComputedStyle(element)
    if (Array.isArray(propertyName)) {
        return pick(style, propertyName)
    }
    if (typeof propertyName === 'string') {
        return style.getPropertyValue(propertyName)
    }
    return reduce(style, (obj: Record<string, string>, property) => {
        obj[String(property)] = style.getPropertyValue(String(property))
        return obj
    }, {} as Record<string, string>)
}
export const addEventListenerToElement = (targets: unknown, type: string, callback: EventListener, options: AddEventListenerOptions = {}): (() => void) => {
    if (!targets || (typeof targets !== 'object' && typeof targets !== 'string')) {
        throw new Error('Targets must be a DOM element, selector string, or array of elements')
    }
    if (typeof type !== 'string' || !type.trim()) {
        throw new Error('Event type must be a non-empty string')
    }
    if (typeof callback !== 'function') {
        throw new Error('Callback must be a function')
    }
    if (options && typeof options !== 'object') {
        throw new Error('Options must be an object or undefined')
    }
    const elements: Element[] = typeof targets === 'string'
        ? [...document.querySelectorAll(targets)]
        : Array.isArray(targets)
            ? targets.filter((el): el is Element => el instanceof Element)
            : [targets].filter((el): el is Element => el instanceof Element)
    if (elements.length === 0) {
        const describeTarget = (target: unknown): string => {
            if (typeof target === 'string') return `选择器 "${target}"`
            if (target instanceof Element) return `<${target.tagName.toLowerCase()}>#${target.id}`
            return '空值'
        }
        const targetInfo = Array.isArray(targets) ? targets.map(describeTarget).join(' | ') : describeTarget(targets)
        logger.debug(`未找到有效的元素用于添加事件监听器（目标: ${targetInfo}）`)
        return () => {}
    }
    const finalOptions = {
        passive: true,
        capture: false,
        ...options
    }
    elements.forEach(element => {
        try {
            element.addEventListener(type, callback, finalOptions)
        } catch (error) {
            logger.error('添加元素事件监听器失败:', error)
        }
    })
    return () => {
        elements.forEach(element => {
            try {
                element.removeEventListener(type, callback, finalOptions)
            } catch (error) {
                logger.error('移除元素事件监听器失败:', error)
            }
        })
    }
}
/** executeFunctionsSequentially 的选项 */
export interface ExecuteFunctionsOptions {
    /** 每批并发数（默认 1） */
    concurrency?: number
    /** 单个函数失败时是否继续（默认 false，即中断并抛出） */
    continueOnError?: boolean
    /** 每批执行完后的回调（用于驱动重试队列等） */
    onAfterChunk?: (() => unknown) | null
}
export const executeFunctionsSequentially = async (
    functionsArray: unknown[],
    options: ExecuteFunctionsOptions = { concurrency: 1, continueOnError: false, onAfterChunk: null }
): Promise<Array<PromiseSettledResult<unknown>>> => {
    const { concurrency, continueOnError, onAfterChunk } = options
    const chunks = chunkArray(functionsArray, concurrency)
    const results: Array<PromiseSettledResult<unknown>> = []
    for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
            chunk.map(async item => { // 处理单个项（可能是数组或函数）
                // 判断是否为数组，非数组则包装为 [func, true]
                const pair = (Array.isArray(item) ? item : [item, true]) as [unknown, boolean?]
                const func = pair[0] as () => unknown
                const execute = pair[1] ?? true
                if (!execute) return null // 跳过不执行的函数
                try {
                    const result = await func()
                    const withCallback = result as { callback?: unknown[] } | null | undefined
                    if (withCallback?.callback) {
                        await executeFunctionsSequentially(withCallback.callback, options)
                    }
                    return result
                } catch (error) {
                    logger.error('函数执行失败:', error)
                    if (!continueOnError) throw error
                    return null
                }
            })
        )
        results.push(...chunkResults)
        // 每个 chunk 执行完后尝试重试队列
        if (onAfterChunk) await onAfterChunk()
    }
    return results
}
/** isTabActive 的选项 */
export interface IsTabActiveOptions {
    /** 激活状态变化回调 */
    onActiveChange?: (active: boolean) => void
    /** 是否立即检测一次（默认 false） */
    immediate?: boolean
    /** 首次检测到可见后停止轮询（默认 false） */
    once?: boolean
    /** 轮询间隔（默认 1000ms） */
    checkInterval?: number
}
export const isTabActive = (options: IsTabActiveOptions = {}): (() => void) => {
    const {
        onActiveChange,
        immediate = false,
        once = false,
        checkInterval = 1000
    } = options
    const checkVisibility = (): void => {
        const currentState = document.visibilityState
        if (currentState === 'visible') {
            // logger.debug('页面已激活')
            onActiveChange?.(true)
            if (once) {
                clearInterval(intervalId ?? undefined)
                intervalId = null
            }
        } else {
            logger.debug('页面未激活')
            onActiveChange?.(false)
        }
    }
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (immediate) checkVisibility()
    if (!once || document.visibilityState !== 'visible') {
        intervalId = setInterval(checkVisibility, checkInterval)
    }
    return () => {
        if (intervalId) {
            clearInterval(intervalId ?? undefined)
            intervalId = null
        }
    }
}
/** URL 变更回调（可返回 Promise，异常会被记录且不影响其它监听者） */
export type HrefChangeCallback = () => unknown
const hrefChangeListeners = new Set<HrefChangeCallback>()
let hrefMonitorInitialized = false
let hrefMonitorLastHref = location.href
let originalPushState: typeof history.pushState
let originalReplaceState: typeof history.replaceState
const hrefListenerOptions = { passive: true, capture: true }
const getFinalHref = (url: URL): string => {
    const pParam = url.searchParams.get('p')
    return `${url.href.split('?')[0].trim()}${pParam ? `?p=${pParam}` : ''}`.replace(/\/+$/, '')
}
const notifyHrefChange = (): void => {
    const currentHref = location.href
    const previousUrl = new URL(hrefMonitorLastHref)
    const currentUrl = new URL(currentHref)
    if (getFinalHref(previousUrl) === getFinalHref(currentUrl)) return
    hrefMonitorLastHref = currentHref
    hrefChangeListeners.forEach(callback => {
        try {
            Promise.resolve(callback()).catch(error => logger.error('URL变更回调错误:', error))
        } catch (error) {
            logger.error('URL变更回调错误:', error)
        }
    })
}
const initializeHrefMonitor = (): void => {
    if (hrefMonitorInitialized) return
    hrefMonitorInitialized = true
    originalPushState = history.pushState
    originalReplaceState = history.replaceState
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
        const result = originalPushState.apply(this, args)
        notifyHrefChange()
        return result
    }
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
        const result = originalReplaceState.apply(this, args)
        notifyHrefChange()
        return result
    }
    window.addEventListener('hashchange', notifyHrefChange, hrefListenerOptions)
    window.addEventListener('popstate', notifyHrefChange, hrefListenerOptions)
}
export const monitorHrefChange = (callback: HrefChangeCallback): (() => void) => {
    if (typeof callback !== 'function') {
        throw new TypeError('URL变更回调必须是函数')
    }
    initializeHrefMonitor()
    hrefChangeListeners.add(callback)
    return () => {
        hrefChangeListeners.delete(callback)
        if (hrefChangeListeners.size > 0) return
        window.removeEventListener('hashchange', notifyHrefChange, hrefListenerOptions)
        window.removeEventListener('popstate', notifyHrefChange, hrefListenerOptions)
        history.pushState = originalPushState
        history.replaceState = originalReplaceState
        hrefMonitorInitialized = false
        hrefMonitorLastHref = location.href
    }
}
/** 自定义确认弹窗的按钮定义 */
export interface AdjustmentConfirmButton {
    key: string
    label: string
    className?: string
}
/** adjustmentConfirm 的选项 */
export interface AdjustmentConfirmOptions {
    /** 渲染容器（传入 popover 元素以确保在 top layer 中显示） */
    container?: HTMLElement
    /** 自定义按钮列表，未设置则使用默认「取消/确定」 */
    buttons?: AdjustmentConfirmButton[]
}
/**
 * 自定义确认弹窗（替代浏览器 confirm）
 * @param message 提示文字
 * @param options 选项（容器 / 自定义按钮）
 * @returns 自定义按钮时返回 key，默认时返回 true/false
 */
export const adjustmentConfirm = (message: string, options: AdjustmentConfirmOptions = {}): Promise<string | boolean> => {
    const { container = document.body, buttons } = options
    return new Promise<string | boolean>(resolve => {
        const overlay = document.createElement('div')
        overlay.className = 'adjustment-confirm-overlay'
        const btnsHtml = buttons
            ? buttons.map(b => '<div class="adjustment-button ' + (b.className || 'secondary') + '" data-key="' + b.key + '">' + b.label + '</div>').join('')
            : '<div class="adjustment-button secondary" data-key="cancel">取消</div><div class="adjustment-button primary" data-key="ok">确定</div>'
        overlay.innerHTML = `
            <div class="adjustment-confirm-dialog">
                <div class="adjustment-confirm-msg"></div>
                <div class="adjustment-confirm-btns">${btnsHtml}</div>
            </div>
        `
        overlay.querySelector('.adjustment-confirm-msg')!.textContent = message
        const closeAndResolve = (value: string | boolean) => {
            try { overlay.hidePopover() } catch { /* 忽略异常 */ }
            overlay.remove()
            resolve(value)
        }
        overlay.querySelectorAll('.adjustment-confirm-btns .adjustment-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = (btn as HTMLElement).dataset.key
                closeAndResolve(buttons ? (key ?? '') : key === 'ok')
            })
        })
        overlay.addEventListener('click', (e: MouseEvent) => {
            if (e.target === overlay) {
                closeAndResolve(buttons ? 'cancel' : false)
            }
        })
        // 用原生 popover（top layer）承载：当宿主是原生 popover 弹窗时，
        // 普通文档流元素（即使 z-index 99999）会被压在 top layer 之下，
        // 只有同为 popover/top layer 的元素才能覆盖其上。
        overlay.setAttribute('popover', 'manual')
        document.body.appendChild(overlay)
        if (typeof overlay.showPopover === 'function') overlay.showPopover()
        // 若宿主弹窗在确认期间被关闭（Esc/外部点击），自动移除确认遮罩并作取消处理，防止残留模态
        if (container instanceof Element && container !== document.body) {
            const onToggle = (e: ToggleEvent) => {
                if (e.newState === 'closed') {
                    container.removeEventListener('toggle', onToggle)
                    closeAndResolve(buttons ? 'cancel' : false)
                }
            }
            container.addEventListener('toggle', onToggle)
        }
    })
}
// 自定义"点击外部关闭"：用真实 DOM 遮罩替代 ::backdrop（UA 的 backdrop 不接收指针事件，导致穿透）
// 同时原生 light dismiss 在"弹窗内按下、弹窗外松开"（如拖选文字）时也会误关，
// 改为遮罩元素拦截所有弹窗外交互——点击遮罩即关闭，拖选不受影响
export const enablePopoverLightDismiss = (popover: HTMLElement): (() => void) => {
    const overlay = document.createElement('div')
    overlay.className = 'adjustment-popover-overlay'
    overlay.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        popover.hidePopover()
    })
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && popover.matches(':popover-open')) {
            popover.hidePopover()
        }
    }
    const onToggle = (e: ToggleEvent) => {
        if (e.newState === 'open') {
            // 遮罩插入到弹窗前面（同级），z-index 低于弹窗
            popover.parentElement?.insertBefore(overlay, popover)
            document.addEventListener('keydown', onKeyDown)
        } else {
            overlay.remove()
            document.removeEventListener('keydown', onKeyDown)
        }
    }
    popover.addEventListener('toggle', onToggle)
    return () => {
        overlay.remove()
        document.removeEventListener('keydown', onKeyDown)
        popover.removeEventListener('toggle', onToggle)
    }
}
export const escapeHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
export const sanitizeHttpUrl = (value: unknown): string => {
    const rawValue = String(value ?? '').trim()
    if (!rawValue) return ''
    try {
        const url = new URL(rawValue, location.origin)
        return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
    } catch {
        return ''
    }
}
/** createElementAndInsert 支持的插入方式 */
export type InsertionMethod = 'append' | 'prepend' | 'before' | 'after' | 'replaceWith'
export const createElementAndInsert = (HtmlString: string, target: Node, method: InsertionMethod = 'append'): Element | Element[] => {
    if (typeof HtmlString !== 'string' || !HtmlString.trim()) {
        throw new Error('Invalid HTML string provided')
    }
    if (!target || !(target instanceof Node)) {
        throw new Error('Target must be a valid DOM node')
    }
    const supportedMethods: readonly string[] = ['append', 'prepend', 'before', 'after', 'replaceWith']
    if (!supportedMethods.includes(method)) {
        throw new Error(`Unsupported insertion method: ${method}`)
    }
    try {
        const template = document.createElement('template')
        template.innerHTML = HtmlString.trim()
        const fragment = template.content
        // template.content.cloneNode(true) 运行时返回 DocumentFragment（浅层类型为 Node，故此处收窄）
        const clonedFragment = fragment.cloneNode(true) as DocumentFragment
        const insertedNodes = [...clonedFragment.children]
        // Node 类型不含 append/prepend/before/after/replaceWith（它们来自 ParentNode/ChildNode），此处一次性收窄
        const host = target as unknown as Node & ParentNode & ChildNode
        if (method === 'replaceWith') {
            host.replaceWith(clonedFragment)
        } else {
            // 原实现为动态调用 target[method](clonedFragment)，此处展开为显式映射以通过类型检查（行为一致）
            const inserters: Record<InsertionMethod, (node: Node) => void> = {
                append: node => host.append(node),
                prepend: node => host.prepend(node),
                before: node => host.before(node),
                after: node => host.after(node),
                replaceWith: node => host.replaceWith(node)
            }
            inserters[method](clonedFragment)
        }
        return insertedNodes.length > 1 ? insertedNodes : insertedNodes[0]
    } catch (error) {
        logger.error('创建并插入元素失败:', error)
        throw error
    }
}
export const getTotalSecondsFromTimeString = (timeString?: string | null): number => {
    if (!timeString) return 0
    const parts = timeString.split(':')
    if (parts.length === 1) {
        return parseInt(parts[0], 10)
    } else if (parts.length === 2) {
        const [minutes, seconds] = parts.map(Number)
        return minutes * 60 + seconds
    } else if (parts.length === 3) {
        const [hours, minutes, seconds] = parts.map(Number)
        return hours * 3600 + minutes * 60 + seconds
    }
    return 0
}
export const insertStyleToDocument = (styles: Record<string, string>): void => {
    if (typeof styles === 'object' && !Array.isArray(styles)) {
        for (const [id, cssString] of Object.entries(styles)) {
            let styleElement: HTMLElement | null = document.getElementById(id)
            if (!cssString) {
                styleElement?.remove()
                continue
            }
            if (!styleElement) {
                styleElement = document.createElement('style')
                styleElement.id = id
                document.head.append(styleElement)
            }
            styleElement.textContent = cssString
        }
    } else {
        throw new Error('Invalid argument type. Expected an object.')
    }
}
export const getBodyHeight = (): number => {
    const bodyHeight = document.body?.clientHeight || 0
    const docHeight = document.documentElement?.clientHeight || 0
    return bodyHeight < docHeight ? bodyHeight : docHeight
}
// 更新相关功能已移至 update.service.js
export const initializeCheckbox = (elements: unknown, userConfigs: Record<string, unknown>, configKey?: string): void => {
    const elementList = Array.isArray(elements) ? elements : [elements]
    elementList.forEach(element => {
        if (!(element instanceof HTMLInputElement)) return
        const key = configKey || snakeCase(element.id).replace(/_(\d)_k/g, '$1k')
        if (!(key in userConfigs)) {
            logger.warn(`配置键 "${key}" 不存在于用户配置中`)
            return
        }
        const value = Boolean(userConfigs[key])
        // 使用 requestAnimationFrame 确保 DOM 更新
        requestAnimationFrame(() => {
            element.checked = value
            element.toggleAttribute('checked', value)
            element.dispatchEvent(new Event('change', { bubbles: true }))
        })
    })
}
export const showPlayerTooltip = (triggerElement: HTMLElement, tooltipElement: HTMLElement): void => {
    requestAnimationFrame(() => {
        const rect = triggerElement.getBoundingClientRect()
        tooltipElement.style.cssText = `
            top: ${rect.top - tooltipElement.clientHeight - 12}px;
            left: ${rect.left + (rect.width / 2) - (tooltipElement.clientWidth / 2)}px;
            opacity: 1;
            visibility: visible;
            transition: opacity .3s;
        `
    })
}
export const hidePlayerTooltip = (tooltipElement: HTMLElement): void => {
    requestAnimationFrame(() => {
        tooltipElement.style.cssText = `
            opacity: 0;
            visibility: hidden;
        `
    })
}
export const generateMentionUserLinks = (username: string, desc_v2?: Array<{ raw_text?: string; biz_id?: string | number }>): string => {
    // desc_v2 的 raw_text 自带 @ 前缀（如 '@量子位'），且旧接口可能不下发 desc_v2
    const matchedItem = desc_v2?.find(item => item.raw_text === `@${username}`)
    return matchedItem
        ? `<a target="_blank" href="//space.bilibili.com/${matchedItem.biz_id}" class="mention-user" data-v-8ced1e78="">@${username} </a>`
        : `@${username}`
}
/**
 * 统一的弹窗管理器
 * 所有弹窗应使用此函数创建，以确保行为一致：
 * 1. 提供统一的打开/关闭 API
 * 2. 遮罩穿透由 enablePopoverLightDismiss 的真实 DOM 遮罩处理
 */
/** 弹窗实例（由 popoverManager.register 创建） */
export interface PopoverInstance {
    id: string
    element: HTMLElement | null
    showPopover: () => void
    hidePopover: () => void
    destroy: () => void
}
/** popoverManager.init 的选项 */
export interface PopoverInitOptions {
    /** 弹窗关闭时的回调 */
    onClose?: () => void
}
/** 弹窗管理器（统一 open/close/destroy 行为） */
export interface PopoverManager {
    register: (id: string) => PopoverInstance
    init: (id: string, element: HTMLElement, options?: PopoverInitOptions) => void
    show: (id: string) => Promise<void>
    hide: (id: string) => Promise<void>
    destroy: (id: string) => Promise<void>
    get: (id: string) => PopoverInstance | null
}
export const createPopoverManager = (): PopoverManager => {
    const popoverInstances = new Map<string, PopoverInstance>()
    return {
        /**
         * 注册并管理一个弹窗
         * @param {string} id - 弹窗元素 ID
         * @param {Object} options - 配置项
         * @param {Function} options.onCreate - 弹窗创建后的回调
         * @param {Function} options.onClose - 弹窗关闭时的回调
         * @returns {Object} 弹窗控制对象
         */
        register (id: string): PopoverInstance {
            if (popoverInstances.has(id)) {
                return popoverInstances.get(id)!
            }
            const instance: PopoverInstance = {
                id,
                element: null,
                showPopover: () => {},
                hidePopover: () => {},
                destroy: () => {}
            }
            popoverInstances.set(id, instance)
            return instance
        },
        /**
         * 初始化弹窗元素并绑定事件
         * @param {string} id - 弹窗元素 ID
         * @param {HTMLElement} element - 弹窗 DOM 元素
         * @param {Object} options - 配置项
         */
        init (id: string, element: HTMLElement, options: PopoverInitOptions = {}): void {
            const instance = popoverInstances.get(id)
            if (!instance) return
            instance.element = element
            // 绑定 toggle 事件：关闭时触发回调
            element.addEventListener('toggle', (e: ToggleEvent) => {
                if (e.newState === 'closed') {
                    options.onClose?.()
                }
            })
            // 提供统一的打开/关闭方法
            instance.showPopover = () => element.showPopover()
            instance.hidePopover = () => element.hidePopover()
            instance.destroy = () => {
                element.hidePopover()
                element.remove()
                popoverInstances.delete(id)
            }
        },
        /**
         * 显示弹窗
         * @param {string} id - 弹窗元素 ID
         */
        async show (id: string): Promise<void> {
            const instance = popoverInstances.get(id)
            if (instance?.element) {
                instance.element.showPopover()
            }
        },
        /**
         * 隐藏弹窗
         * @param {string} id - 弹窗元素 ID
         */
        async hide (id: string): Promise<void> {
            const instance = popoverInstances.get(id)
            if (instance?.element) {
                instance.element.hidePopover()
            }
        },
        /**
         * 销毁弹窗
         * @param {string} id - 弹窗元素 ID
         */
        async destroy (id: string): Promise<void> {
            const instance = popoverInstances.get(id)
            if (instance) {
                await instance.destroy()
            }
        },
        /**
         * 获取弹窗实例
         * @param {string} id - 弹窗元素 ID
         * @returns {Object|null} 弹窗实例
         */
        get (id: string): PopoverInstance | null {
            return popoverInstances.get(id) || null
        }
    }
}
// 导出全局弹窗管理器实例
export const popoverManager = createPopoverManager()
