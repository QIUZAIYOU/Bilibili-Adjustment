/**
 * 通用弹窗组件（Element Plus Dialog 式命令式 API）
 *
 * 统一弹窗外壳、行为与基础样式：标题区、内容区（调用方自定义）、底部操作区；
 * 基于原生 popover（top layer），行为与样式全局一致，各功能通过 content/actions/className
 * 注入自定义内容与差异样式。
 *
 * 生命周期：
 *  - 默认（无 keepAliveMs）：关闭即销毁，下次打开重新创建
 *  - keepAliveMs > 0：关闭后保留实例，缓存期内再次打开直接复用（不重建内容，
 *    如 iframe 不重新加载）；超过缓存时长仍未打开则自动销毁
 *  - 同 key 单例：存活实例再次 open 时复用而非叠加
 *
 * 用法：
 *   const dialog = openAdjustmentDialog({
 *     key: 'my-dialog',
 *     title: '标题',
 *     subtitle: '（副标题）',
 *     content: '<div>自定义内容 HTML</div>' | Node | (body) => void,
 *     actions: [{ text: '确定', type: 'primary', onClick: d => d.close() }],
 *     width: 560,
 *     keepAliveMs: 0,
 *     autoClose: 0
 *   })
 *   dialog.close() / dialog.destroy()
 */
import { insertStyleToDocument, enablePopoverLightDismiss } from '@/utils/common'
import { applyDialogA11y } from '@/utils/dialog-a11y'
// 标题元素 id 序号：供 aria-labelledby 关联（P1 / 报告 §5）
let dialogSeq = 0
const DIALOG_CSS = `
    .adjustment-dialog {
        background: var(--adj-bg-page);
        border: 1px solid var(--adj-border-strong);
        border-radius: 16px;
        box-shadow: var(--adj-shadow-dialog);
        padding: 0;
        color: var(--adj-text-primary);
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        overflow: hidden;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        animation: adjustment-popover-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* 关闭态隐藏兜底：原生 popover 移出 top layer 后仍留在 DOM（keepAlive 缓存期不销毁），
       隐藏依赖 UA 规则 [popover]:not(:popover-open){ display: none }（无 !important），
       上方作者级 display:flex 会覆盖它，导致缓存弹窗关闭后以 flex 残留在文档流中
       （如 UP 主空间弹窗关闭后仍显示于其他元素之后）。
       故必须显式以 !important 兜底；:popover-open 打开时此规则不匹配，回归上方 flex 布局。 */
    .adjustment-dialog:not(:popover-open) {
        display: none !important;
    }

    .adjustment-dialog[popover] {
        margin: auto;
        inset: 0;
        width: 550px;
        max-width: 92vw;
    }
    .adjustment-dialog-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 18px 22px 12px;
        border-bottom: 1px solid var(--adj-border-subtle);
        flex-shrink: 0;
    }
    .adjustment-dialog-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--adj-text-strong);
        line-height: 1.5;
    }
    .adjustment-dialog-subtitle {
        font-size: 12px;
        color: var(--adj-text-soft);
        margin-top: 2px;
    }
    .adjustment-dialog-tag {
        font-size: 11px;
        line-height: 1;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid var(--adj-border-strong);
        background: var(--adj-bg-surface);
        color: var(--adj-warning);
        white-space: nowrap;
        flex-shrink: 0;
    }
    .adjustment-dialog-close {
        margin-left: auto;
        flex-shrink: 0;
        cursor: pointer;
        color: var(--adj-text-muted);
        font-size: 16px;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s;
    }
    .adjustment-dialog-close:hover {
        color: var(--adj-text-strong);
        background: var(--adj-bg-active);
    }
    .adjustment-dialog-body {
        flex: 1 1 auto;
        min-height: 0;
        padding: 14px 22px 18px;
        overflow-y: auto;
        line-height: 1.7;
    }
    .adjustment-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 22px 16px;
        border-top: 1px solid var(--adj-border-subtle);
        flex-shrink: 0;
    }
`
let dialogStyleInjected = false
const ensureDialogStyle = () => {
    if (dialogStyleInjected) return
    insertStyleToDocument({ 'AdjustmentPopoverDialogStyle': DIALOG_CSS })
    dialogStyleInjected = true
}
// 单例弹窗注册表：key -> { instance, timer }
const dialogInstances = new Map()
export const openAdjustmentDialog = (options = {}) => {
    const {
        key = '',
        title = '',
        subtitle = '',
        content = '',
        actions = [],
        width = 0,
        className = '',
        closable = true,
        headerExtra = null,
        keepAliveMs = 0,
        autoClose = 0,
        onClosed
    } = options
    // 同 key 单例：存活实例直接复用
    if (key && dialogInstances.has(key)) {
        const prevEntry = dialogInstances.get(key)
        if (prevEntry && !prevEntry.instance._destroyed) {
            prevEntry.instance.open()
            return prevEntry.instance
        }
        dialogInstances.delete(key)
    }
    ensureDialogStyle()
    const root = document.createElement('div')
    root.className = 'adjustment-dialog' + (className ? ' ' + className : '')
    if (typeof width === 'number') {
        if (width > 0) root.style.width = width + 'px'
    } else if (typeof width === 'string' && width.trim()) {
        root.style.width = width
    }
    root.setAttribute('popover', 'manual')
    // 标题 id：无障碍关联（aria-labelledby）
    const titleId = title ? `adj-dialog-title-${++dialogSeq}` : ''
    if (titleId) root.setAttribute('aria-labelledby', titleId)
    // ---------- 骨架 ----------
    const header = document.createElement('div')
    header.className = 'adjustment-dialog-header'
    if (title || subtitle || options.titleTag) {
        const textWrap = document.createElement('div')
        textWrap.style.cssText = 'min-width:0;'
        if (title || options.titleTag) {
            const titleRow = document.createElement('div')
            titleRow.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;'
            if (title) {
                const titleEl = document.createElement('div')
                titleEl.className = 'adjustment-dialog-title'
                titleEl.id = titleId
                titleEl.textContent = title
                titleRow.appendChild(titleEl)
            }
            if (options.titleTag) {
                const tagEl = document.createElement('span')
                tagEl.className = 'adjustment-dialog-tag'
                tagEl.textContent = options.titleTag
                titleRow.appendChild(tagEl)
            }
            textWrap.appendChild(titleRow)
        }
        if (subtitle) {
            const subEl = document.createElement('div')
            subEl.className = 'adjustment-dialog-subtitle'
            subEl.textContent = subtitle
            textWrap.appendChild(subEl)
        }
        header.appendChild(textWrap)
    }
    root.appendChild(header)
    const body = document.createElement('div')
    body.className = 'adjustment-dialog-body'
    let contentCleanup = null
    if (typeof content === 'function') {
        // content(body) 可返回清理函数（如 Vue app.unmount），在弹窗销毁前执行
        const result = content(body)
        if (typeof result === 'function') contentCleanup = result
    } else if (content instanceof Node) {
        body.appendChild(content)
    } else if (content) {
        body.insertAdjacentHTML('beforeend', String(content))
    }
    root.appendChild(body)
    const footer = document.createElement('div')
    if (actions.length > 0) {
        footer.className = 'adjustment-dialog-footer'
        actions.forEach(action => {
            const btn = document.createElement('div')
            btn.className = 'adjustment-button ' + (action.type || 'secondary') + (action.className ? ' ' + action.className : '')
            btn.textContent = action.text
            btn.addEventListener('click', () => {
                if (action.onClick) action.onClick(instance)
                else root.hidePopover()
            })
            footer.appendChild(btn)
        })
        root.appendChild(footer)
    }
    // 右上角关闭按钮与自定义头部内容（追加到 header 最右，关闭按钮置于最末）
    if (headerExtra) {
        if (headerExtra instanceof Node) header.appendChild(headerExtra)
        else header.insertAdjacentHTML('beforeend', String(headerExtra))
    }
    if (closable) {
        const closeEl = document.createElement('div')
        closeEl.className = 'adjustment-dialog-close'
        closeEl.setAttribute('role', 'button')
        closeEl.setAttribute('aria-label', '关闭')
        closeEl.textContent = '✕'
        closeEl.addEventListener('click', () => {
            if (root.matches(':popover-open')) root.hidePopover()
            else instance.destroy()
        })
        header.appendChild(closeEl)
    }
    document.body.appendChild(root)
    root.__popoverDismissCleanup = enablePopoverLightDismiss(root)
    // ---------- 实例 ----------
    const entry = { instance: null, timer: null }
    let autoCloseTimer = null
    let destroyed = false
    const cancelAutoClose = () => {
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer)
            autoCloseTimer = null
        }
    }
    const scheduleLazyDestroy = () => {
        clearTimeout(entry.timer)
        entry.timer = null
        if (keepAliveMs > 0) {
            entry.timer = setTimeout(() => instance.destroy(), keepAliveMs)
        } else {
            instance.destroy()
        }
    }
    // 可访问性生命周期：打开时启用（focus trap / Esc / 滚动锁），关闭或销毁时清理并归还焦点
    let a11yCleanup = null
    const setupDialogA11y = () => {
        if (a11yCleanup || destroyed) return
        a11yCleanup = applyDialogA11y(root, {
            labelledBy: titleId || null,
            onEscape: () => instance.close()
        })
    }
    const teardownDialogA11y = () => {
        if (!a11yCleanup) return
        a11yCleanup()
        a11yCleanup = null
    }
    const instance = {
        key,
        root,
        header,
        body,
        footer,
        _destroyed: false,
        open: () => {
            if (destroyed) return
            clearTimeout(entry.timer)
            entry.timer = null
            if (typeof root.showPopover === 'function' && !root.matches(':popover-open')) root.showPopover()
            setupDialogA11y()
        },
        close: () => {
            if (destroyed) return
            if (root.matches(':popover-open')) root.hidePopover()
            else scheduleLazyDestroy()
        },
        destroy: () => {
            if (destroyed) return
            destroyed = true
            instance._destroyed = true
            cancelAutoClose()
            clearTimeout(entry.timer)
            entry.timer = null
            if (key && dialogInstances.get(key) === entry) dialogInstances.delete(key)
            // 先执行内容清理（如 Vue unmount），再移除 DOM
            if (typeof contentCleanup === 'function') {
                try {
                    contentCleanup()
                } catch {
                    // 清理失败不阻塞弹窗销毁
                }
                contentCleanup = null
            }
            teardownDialogA11y()
            root.__popoverDismissCleanup?.()
            root.__popoverDismissCleanup = null
            try { root.hidePopover() } catch { /* 忽略异常 */ }
            root.remove()
            onClosed?.()
        }
    }
    entry.instance = instance
    // 隐藏（toggle → closed）后的生命周期处理
    root.addEventListener('toggle', e => {
        if (e.newState !== 'closed' || destroyed) return
        // 关闭即释放焦点陷阱与滚动锁（keepAlive 缓存期不销毁 DOM，但不应继续锁滚动）
        teardownDialogA11y()
        clearTimeout(entry.timer)
        entry.timer = null
        if (keepAliveMs > 0) {
            entry.timer = setTimeout(() => instance.destroy(), keepAliveMs)
        } else {
            instance.destroy()
        }
    })
    if (key) dialogInstances.set(key, entry)
    if (autoClose > 0) {
        autoCloseTimer = setTimeout(() => instance.close(), autoClose)
    }
    instance.open()
    return instance
}
