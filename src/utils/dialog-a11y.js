/**
 * 弹窗可访问性（P1 / 报告 §5）
 *
 * 基于原生 popover 的弹窗已经具备 top layer、单例、遮罩、Esc 关闭兜底；
 * 这里补齐无障碍与焦点管理：
 * - role="dialog" / aria-modal / aria-labelledby
 * - 初始焦点进入弹窗，Tab / Shift+Tab 焦点陷阱（不逃逸到页面）
 * - Esc 关闭（可自定义回调）
 * - 关闭后焦点归还触发元素
 * - body 滚动锁（多弹窗引用计数，只锁最外层）
 *
 * 纯 DOM 实现（不依赖 Vue），可在命令式组件与 SFC island 中共用。
 */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])'
].join(',')
let openDialogCount = 0
let savedScrollState = null
const lockBodyScroll = () => {
    if (openDialogCount > 1 || savedScrollState) return
    const body = document.body
    if (!body) return
    // 预留滚动条宽度，避免锁滚动时页面横向跳动
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    savedScrollState = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight
    }
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
}
const unlockBodyScroll = () => {
    const body = document.body
    if (!savedScrollState || !body) return
    body.style.overflow = savedScrollState.overflow
    body.style.paddingRight = savedScrollState.paddingRight
    savedScrollState = null
}
/**
 * 为已打开（且已进入 top layer）的弹窗元素应用可访问性增强
 * @param {HTMLElement} root 弹窗根元素
 * @param {object} [options]
 * @param {string|null} [options.labelledBy] 标题元素 id（aria-labelledby）
 * @param {() => void} [options.onEscape] Esc 回调（默认无操作，调用方通常关闭弹窗）
 * @returns {() => void} 清理函数（移除监听、解锁滚动、归还焦点）
 */
export const applyDialogA11y = (root, options = {}) => {
    const { labelledBy = null, onEscape = null } = options
    const activeElement = document.activeElement
    const previouslyFocused = activeElement && activeElement !== document.body ? activeElement : null
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    if (labelledBy) root.setAttribute('aria-labelledby', labelledBy)
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    const getFocusable = () => Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('disabled') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement))
    const onKeydown = event => {
        if (event.key === 'Escape') {
            // 嵌套弹窗时只关闭最上层：由最上层元素自行处理并阻止冒泡
            event.stopPropagation()
            if (typeof onEscape === 'function') onEscape()
            return
        }
        if (event.key !== 'Tab') return
        const focusable = getFocusable()
        if (focusable.length === 0) {
            event.preventDefault()
            root.focus({ preventScroll: true })
            return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        const insideDialog = root.contains(active)
        if (event.shiftKey && (!insideDialog || active === first)) {
            event.preventDefault()
            last.focus({ preventScroll: true })
        } else if (!event.shiftKey && (!insideDialog || active === last)) {
            event.preventDefault()
            first.focus({ preventScroll: true })
        }
    }
    root.addEventListener('keydown', onKeydown)
    openDialogCount += 1
    lockBodyScroll()
    // popover 进入 top layer 后（下一帧）再聚焦，避免聚焦失败
    requestAnimationFrame(() => {
        const target = getFocusable()[0] || root
        try {
            target.focus({ preventScroll: true })
        } catch { /* 忽略聚焦失败（元素已移除等） */ }
    })
    let cleaned = false
    return () => {
        if (cleaned) return
        cleaned = true
        root.removeEventListener('keydown', onKeydown)
        openDialogCount = Math.max(0, openDialogCount - 1)
        unlockBodyScroll()
        // 焦点归还触发元素（若已不可用则忽略）
        try {
            previouslyFocused?.focus?.({ preventScroll: true })
        } catch { /* 忽略 */ }
    }
}
