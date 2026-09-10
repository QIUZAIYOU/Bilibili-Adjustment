/**
 * 自绘下拉组件（设置弹窗 select 视觉替身）
 *
 * 背景：原生 <select> 的 option 弹出面板由浏览器系统绘制，无法样式化，
 * 与脚本主题风格不一致（docs/theme-system.md 决策 dec-80cd6be287c4dedf）。
 *
 * 设计原则：
 * - 原生 <select data-config-type="select"> 保留在 DOM 中作为「数据与事件中枢」：
 *   value/options/disabled 的读取、change 事件派发、跨标签同步、模型列表重建
 *   均仍作用于原生元素，本组件不复制任何业务逻辑；
 * - 视觉层：在 .adjustment-select 容器内套自绘 trigger（当前项 + caret）与
 *   listbox 菜单；原生 select 绝对定位隐藏（opacity:0 + pointer-events:none），
 *   仅保留可读性；
 * - 提交：点击菜单项 → 写回 select.value 并派发原生 change（bubbles）→
 *   既有 bindConfigChangeEvents / saveConfig / 联动链原样执行；
 * - 同步：外部直接改 select（syncConfigControl / refreshModelList / 模型重建）
 *   后调用 refreshCustomSelects(popover) 刷新视觉（label 与 disabled 态）；
 * - 全部样式走 var(--adj-*)，无字面色值；自定义容器打 .adj-select-enhanced 标记，
 *   用于覆盖旧 .adjustment-select::after 箭头并隐藏原生 select。
 */
import { insertStyleToDocument } from '@/utils/common'
const STYLE_ID = 'AdjCustomSelectStyle'
const MARK = 'adj-select-enhanced'
const CUSTOM_SELECT_CSS = `
    /* ========== 自绘下拉（覆盖旧箭头并隐藏原生 select） ========== */
    .adjustment-select.${MARK} {
        position: relative;
        display: flex;
        align-items: center;
    }
    .adjustment-select.${MARK}::after {
        content: none !important;
    }
    .adjustment-select.${MARK} > select {
        position: absolute;
        top: 0;
        left: 0;
        width: 1px;
        height: 1px;
        margin: 0;
        padding: 0;
        border: 0;
        opacity: 0;
        pointer-events: none;
    }
    .adj-select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--adj-space-sm);
        box-sizing: border-box;
        width: 100%;
        height: 36px;
        padding: 0 var(--adj-space-md);
        border: 1px solid var(--adj-border);
        border-radius: var(--adj-radius-md);
        background: var(--adj-bg-page);
        color: var(--adj-text-primary);
        font-size: var(--adj-font-base);
        line-height: 1;
        outline: none;
        cursor: pointer;
        transition: border-color var(--adj-motion-fast), box-shadow var(--adj-motion-fast);
        -webkit-appearance: none;
        user-select: none;
        text-align: left;
    }
    .adj-select-trigger:hover:not(:disabled) {
        border-color: var(--adj-border-hover);
    }
    .adj-select-trigger:focus-visible {
        border-color: var(--adj-brand);
        box-shadow: var(--adj-shadow-ring);
    }
    .adj-select-trigger:disabled {
        color: var(--adj-text-disabled);
        cursor: not-allowed;
        opacity: 0.6;
    }
    .adj-select-trigger-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .adj-select-caret {
        flex-shrink: 0;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid var(--adj-text-disabled);
        transition: transform var(--adj-motion-fast);
    }
    .adj-select-enhanced.open .adj-select-caret {
        transform: rotate(180deg);
    }
    .adj-select-menu {
        position: absolute;
        left: 0;
        right: auto;
        z-index: var(--adj-z-tooltip);
        box-sizing: border-box;
        width: max-content;
        min-width: 100%;
        max-width: none;
        max-height: 320px;
        overflow-y: auto;
        margin: 0;
        padding: var(--adj-space-xs);
        border: 1px solid var(--adj-border);
        border-radius: var(--adj-radius-md);
        background: var(--adj-bg-surface);
        box-shadow: var(--adj-shadow-lg);
        color: var(--adj-text-primary);
        font-size: var(--adj-font-base);
        list-style: none;
        outline: none;
        overscroll-behavior: contain;
    }
    .adj-select-menu.down {
        top: calc(100% + 4px);
        bottom: auto;
    }
    .adj-select-menu.up {
        top: auto;
        bottom: calc(100% + 4px);
    }
    .adj-select-option {
        display: flex;
        align-items: center;
        gap: var(--adj-space-sm);
        box-sizing: border-box;
        padding: 8px var(--adj-space-sm);
        border-radius: var(--adj-radius-sm);
        color: var(--adj-text-primary);
        line-height: 1.4;
        cursor: pointer;
        white-space: nowrap;
        transition: background var(--adj-motion-fast);
        -webkit-user-select: none;
        user-select: none;
    }
    .adj-select-option:hover,
    .adj-select-option.active {
        background: var(--adj-bg-hover);
    }
    .adj-select-option[aria-selected="true"] {
        color: var(--adj-brand);
    }
    .adj-select-menu.wrap .adj-select-option {
        white-space: normal;
        overflow-wrap: anywhere;
    }
`
/** 确保样式注入一次（幂等） */
const ensureStyle = () => {
    insertStyleToDocument({ [STYLE_ID]: CUSTOM_SELECT_CSS })
}
/**
 * 由原生 select 读取当前选中项文本
 */
const getSelectedLabel = select => {
    const opt = select.selectedOptions && select.selectedOptions[0]
    return opt ? opt.textContent : ''
}
/**
 * 打开菜单：由 select.options 现读构建，保证与原生数据一致
 */
const buildMenuItems = (select, menu, onPick) => {
    menu.textContent = ''
    for (const option of select.options) {
        const item = document.createElement('div')
        item.className = 'adj-select-option'
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(option.value === select.value))
        item.dataset.value = option.value
        item.textContent = option.textContent
        if (option.disabled) item.setAttribute('aria-disabled', 'true')
        item.addEventListener('click', () => {
            if (option.disabled) return
            onPick(option.value, option.textContent)
        })
        menu.append(item)
    }
    if (!select.options.length) {
        const empty = document.createElement('div')
        empty.className = 'adj-select-option'
        empty.setAttribute('aria-disabled', 'true')
        empty.textContent = '暂无可用选项'
        menu.append(empty)
    }
}
/**
 * 关闭已打开的菜单并归还焦点
 */
const closeMenu = (host, restoreFocus = false) => {
    const menu = host.querySelector('.adj-select-menu')
    const trigger = host.querySelector('.adj-select-trigger')
    if (!host.classList.contains('open')) return
    host.classList.remove('open')
    if (menu) {
        menu.hidden = true
        menu.classList.remove('up', 'down')
    }
    const cleanup = host.__adjSelectCleanup
    if (cleanup) {
        cleanup()
        host.__adjSelectCleanup = null
    }
    if (restoreFocus && trigger) trigger.focus()
}
/**
 * 选择提交：写回原生 select 并派发 change，复用既有事件链
 */
const commit = (host, value) => {
    const select = host.querySelector('select')
    if (!select || select.value === value) {
        closeMenu(host, true)
        return
    }
    select.value = value
    // 通知视觉（label 立即更新，不等事件回流）
    refreshHost(host)
    closeMenu(host, true)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}
/**
 * 最近的可滚动祖先（菜单展开方向与裁剪边界依据）
 */
const getScrollContainer = el => {
    let node = el.parentElement
    while (node) {
        const style = getComputedStyle(node)
        if (/(auto|scroll|overlay)/.test(style.overflowY)) return node
        node = node.parentElement
    }
    return document.documentElement
}
/** 打开菜单（宽度按内容自适应，超可视区自动翻转/折行） */
const openMenu = host => {
    const select = host.querySelector('select')
    const trigger = host.querySelector('.adj-select-trigger')
    const menu = host.querySelector('.adj-select-menu')
    if (!select || !trigger || !menu || select.disabled) return
    if (host.classList.contains('open')) return
    buildMenuItems(select, menu, value => commit(host, value))
    host.classList.add('open')
    menu.hidden = false
    // 宽度：内容自适应（width:max-content），超可视区时优先向左翻转，仍溢出则折行截宽
    const scroller = getScrollContainer(host)
    const scrollerRect = scroller.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    menu.style.maxWidth = 'none'
    menu.classList.remove('wrap')
    const naturalWidth = menu.getBoundingClientRect().width
    const rightSpace = scrollerRect.right - triggerRect.left - 8
    const leftSpace = triggerRect.right - scrollerRect.left - 8
    if (naturalWidth > rightSpace && naturalWidth <= leftSpace) {
        // 向右放不下但向左放得下：右对齐向左展开
        menu.style.left = 'auto'
        menu.style.right = '0'
    } else {
        menu.style.left = '0'
        menu.style.right = 'auto'
        if (naturalWidth > rightSpace) {
            // 两侧都不够：占满较宽一侧并折行显示全文
            menu.style.maxWidth = Math.max(rightSpace, leftSpace) + 'px'
            menu.classList.add('wrap')
        }
    }
    // 展开方向：下方空间不足且上方有余时向上（以滚动容器为边界）
    const menuHeight = Math.min(menu.scrollHeight || 0, 320)
    const spaceBelow = scrollerRect.bottom - triggerRect.bottom
    const spaceAbove = triggerRect.top - scrollerRect.top
    if (spaceBelow < menuHeight + 8 && spaceAbove > menuHeight + 8) {
        menu.classList.add('up')
    } else {
        menu.classList.add('down')
    }
    // 键盘默认位置 = 当前选中项（视觉用文字变色区分，不加背景）
    const allItems = Array.from(menu.children)
    const selectedIndex = allItems.findIndex(el => el.dataset.value === select.value)
    host.__adjSelectIndex = selectedIndex
    if (selectedIndex >= 0) {
        allItems[selectedIndex].scrollIntoView({ block: 'nearest' })
    }
    menu.focus()
    // 外部点击 → 关闭；页面级滚动/缩放 → 关闭（弹窗内部滚动让菜单随内容联动，不关闭）
    const onDocPointerDown = e => {
        if (!host.contains(e.target)) closeMenu(host)
    }
    const onPageScroll = e => {
        if (e.target === document || e.target === document.documentElement) closeMenu(host)
    }
    const onResize = () => closeMenu(host)
    document.addEventListener('pointerdown', onDocPointerDown, true)
    window.addEventListener('scroll', onPageScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKeydown, true)
    host.__adjSelectCleanup = () => {
        document.removeEventListener('pointerdown', onDocPointerDown, true)
        window.removeEventListener('scroll', onPageScroll, true)
        window.removeEventListener('resize', onResize)
        document.removeEventListener('keydown', onKeydown, true)
    }
}
/** 菜单内键盘导航 */
const onKeydown = e => {
    const host = e.target.closest?.('.adjustment-select.adj-select-enhanced.open')
    if (!host) return
    const menu = host.querySelector('.adj-select-menu')
    const items = Array.from(menu?.children || []).filter(el => el.getAttribute('aria-disabled') !== 'true')
    if (!items.length) return
    // 键盘当前项：初始为选中项（不显示背景），方向键移动后落到 .active
    let index = host.__adjSelectIndex ?? -1
    if (index < 0 || index >= items.length) index = -1
    const setActive = i => {
        items.forEach(el => el.classList.remove('active'))
        items[i].classList.add('active')
        host.__adjSelectIndex = i
        items[i].scrollIntoView({ block: 'nearest' })
    }
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault()
            setActive(index < 0 ? 0 : Math.min(index + 1, items.length - 1))
            break
        case 'ArrowUp':
            e.preventDefault()
            setActive(index < 0 ? items.length - 1 : Math.max(index - 1, 0))
            break
        case 'Home':
            e.preventDefault()
            setActive(0)
            break
        case 'End':
            e.preventDefault()
            setActive(items.length - 1)
            break
        case 'Enter':
        case ' ':
            e.preventDefault()
            e.stopPropagation()
            if (index >= 0 && items[index].dataset.value !== undefined) {
                commit(host, items[index].dataset.value)
            } else {
                // 无有效高亮（理论上不会发生）：确认当前值，直接收起
                closeMenu(host, true)
            }
            break
        case 'Escape':
            e.preventDefault()
            e.stopPropagation()
            closeMenu(host, true)
            break
        case 'Tab':
            closeMenu(host)
            break
    }
    // 保持键盘当前值提示与视觉一致
    if (index >= 0 && items[index]) {
        const select = host.querySelector('select')
        select?.setAttribute('data-adj-active-value', items[index].dataset.value ?? '')
    }
}
/**
 * 刷新单个增强容器的视觉（label / disabled），由外部修改 select 后调用
 */
const refreshHost = host => {
    const select = host.querySelector('select')
    const trigger = host.querySelector('.adj-select-trigger')
    const label = host.querySelector('.adj-select-trigger-label')
    if (!select || !trigger) return
    if (label) label.textContent = getSelectedLabel(select)
    trigger.disabled = select.disabled
}
/**
 * 增强容器内所有未处理的自绘下拉；幂等（data 标记防重）
 * @param {HTMLElement} root - 弹窗或任意容器
 */
export const enhanceCustomSelects = root => {
    if (!root) return
    ensureStyle()
    root.querySelectorAll('.adjustment-select').forEach(container => {
        const select = container.querySelector('select[data-config-type="select"]')
        if (!select || container.classList.contains(MARK)) return
        // 构建视觉层
        const trigger = document.createElement('button')
        trigger.type = 'button'
        trigger.className = 'adj-select-trigger'
        trigger.setAttribute('role', 'combobox')
        trigger.setAttribute('aria-haspopup', 'listbox')
        trigger.setAttribute('aria-expanded', 'false')
        const label = document.createElement('span')
        label.className = 'adj-select-trigger-label'
        const caret = document.createElement('span')
        caret.className = 'adj-select-caret'
        trigger.append(label, caret)
        const menu = document.createElement('div')
        menu.className = 'adj-select-menu'
        menu.setAttribute('role', 'listbox')
        menu.hidden = true
        menu.tabIndex = -1
        container.classList.add(MARK)
        container.append(trigger, menu)
        // 原生 select 保留为数据/事件中枢，但移出可访问性树与 Tab 序（交互由自绘 trigger 承担）
        select.setAttribute('aria-hidden', 'true')
        select.setAttribute('tabindex', '-1')
        // 交互
        trigger.addEventListener('click', () => {
            if (container.classList.contains('open')) {
                closeMenu(container)
            } else {
                openMenu(container)
            }
        })
        trigger.addEventListener('keydown', e => {
            if (select.disabled) return
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!container.classList.contains('open')) {
                    openMenu(container)
                    if (e.key === 'Enter' || e.key === ' ') return
                }
            }
        })
        trigger.addEventListener('focus', () => {
            trigger.setAttribute('aria-expanded', container.classList.contains('open') ? 'true' : 'false')
        })
        // 容器打开状态变化 → aria 同步
        const observer = new MutationObserver(() => {
            trigger.setAttribute('aria-expanded', container.classList.contains('open') ? 'true' : 'false')
        })
        observer.observe(container, { attributes: true, attributeFilter: ['class']})
        container.__adjSelectObserver = observer
        // 原生 select 被移除时兜底清理：DOMNodeRemoved 已废弃且开销高，
        // 改为观察父节点 childList（父节点不可用时退回 body 子树），断开即释放
        const removalObserver = new MutationObserver(() => {
            if (container.isConnected) return
            removalObserver.disconnect()
            observer.disconnect()
            closeMenu(container)
        })
        const removalRoot = container.parentNode
        if (removalRoot) removalObserver.observe(removalRoot, { childList: true })
        // 初始化视觉
        refreshHost(container)
    })
}
/**
 * 刷新容器内全部已增强下拉（label / disabled），供外部直接修改 select 后调用
 * @param {HTMLElement} root - 弹窗或任意容器
 */
export const refreshCustomSelects = root => {
    if (!root) return
    root.querySelectorAll(`.adjustment-select.${MARK}`).forEach(refreshHost)
}
/**
 * 销毁容器内增强（可选，弹窗关闭销毁 DOM 时无需手动调用）
 */
export const destroyCustomSelects = root => {
    if (!root) return
    root.querySelectorAll(`.adjustment-select.${MARK}`).forEach(container => {
        container.__adjSelectObserver?.disconnect()
        closeMenu(container)
        container.classList.remove(MARK)
        container.querySelector('.adj-select-trigger')?.remove()
        container.querySelector('.adj-select-menu')?.remove()
    })
}
