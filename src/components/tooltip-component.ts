/**
 * 简单直接的 Tooltip 组件
 * 直接绑定到每个图标元素
 */
/** TooltipComponent 的构造选项 */
export interface TooltipOptions {
    /** 悬停多久后显示（ms，默认 300） */
    delay?: number
    /** tooltip 的挂载容器（默认 document.body） */
    container?: HTMLElement
}
export class TooltipComponent {
    delay: number
    container: HTMLElement
    tooltip: HTMLDivElement | null
    showTimeout: ReturnType<typeof setTimeout> | null
    hideTimeout: ReturnType<typeof setTimeout> | null
    boundIcons = new WeakSet<Element>()
    constructor (options: TooltipOptions = {}) {
        this.delay = options.delay || 300
        this.container = options.container || document.body
        this.tooltip = null
        this.showTimeout = null
        this.hideTimeout = null
        this.boundIcons = new WeakSet()
        this.init()
    }
    init (): void {
        // 创建 tooltip 元素
        this.tooltip = document.createElement('div')
        this.tooltip.className = 'adjustment-tooltip'
        this.tooltip.style.cssText = `
            position: fixed;
            z-index: var(--adj-z-tooltip);
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 320px;
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--adj-bg-tooltip);
            color: var(--adj-text-secondary);
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid var(--adj-border);
            box-shadow: var(--adj-shadow-float);
            word-wrap: break-word;
            overflow-wrap: break-word;
            pointer-events: auto;
            display: none;
        `
        this.container.appendChild(this.tooltip)
    }
    /**
     * 绑定事件到 tooltip 图标
     */
    bindToIcons (): void {
        const icons = document.querySelectorAll('.adjustment-tips-icon[data-tooltip]')
        icons.forEach(icon => {
            // 避免重复绑定
            if (this.boundIcons.has(icon)) return
            this.boundIcons.add(icon)
            const iconEl = icon as HTMLElement
            iconEl.style.cursor = 'help'
            icon.addEventListener('mouseenter', () => {
                this.clearTimeout()
                this.showTimeout = setTimeout(() => {
                    this.show(iconEl.dataset.tooltip ?? '', iconEl)
                }, this.delay)
            })
            icon.addEventListener('mouseleave', () => {
                this.clearTimeout()
                this.hideTimeout = setTimeout(() => {
                    this.hide()
                }, 100)
            })
        })
        // 绑定 tooltip 本身的鼠标事件，防止鼠标移入 tooltip 时被隐藏
        // （tooltip 由 init() 在构造阶段创建，这里保持原实现的非空假设）
        this.tooltip!.addEventListener('mouseenter', () => {
            this.clearHideTimeout()
            this.tooltip!.style.opacity = '1'
            this.tooltip!.style.transform = 'translateY(0)'
        })
        this.tooltip!.addEventListener('mouseleave', () => {
            this.hideTimeout = setTimeout(() => {
                this.hide()
            }, 100)
        })
    }
    show (content: string, target: Element): void {
        // 取局部引用：类属性收窄会被后续方法调用打断，局部变量更稳且行为一致
        const tooltip = this.tooltip
        if (!tooltip) return
        // 设置内容（直接使用 data-tooltip 的值）
        tooltip.innerHTML = content
        // 先显示并设置 opacity 0 来获取尺寸
        tooltip.style.display = 'block'
        tooltip.style.opacity = '0'
        const rect = target.getBoundingClientRect()
        const tooltipRect = tooltip.getBoundingClientRect()
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2
        let top = rect.bottom + 8
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        if (left < 8) left = 8
        if (left + tooltipRect.width > viewportWidth - 8) {
            left = viewportWidth - tooltipRect.width - 8
        }
        if (top + tooltipRect.height > viewportHeight - 8) {
            top = rect.top - tooltipRect.height - 8
        }
        tooltip.style.left = `${left}px`
        tooltip.style.top = `${top}px`
        // 真正显示
        requestAnimationFrame(() => {
            tooltip.style.opacity = '1'
            tooltip.style.transform = 'translateY(0)'
        })
    }
    hide (): void {
        const tooltip = this.tooltip
        if (!tooltip) return
        tooltip.style.opacity = '0'
        tooltip.style.transform = 'translateY(4px)'
        setTimeout(() => {
            if (this.tooltip && this.tooltip.style.opacity === '0') {
                this.tooltip.style.display = 'none'
            }
        }, 200)
    }
    clearTimeout (): void {
        if (this.showTimeout) {
            clearTimeout(this.showTimeout)
            this.showTimeout = null
        }
    }
    clearHideTimeout (): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout)
            this.hideTimeout = null
        }
    }
    destroy (): void {
        this.clearTimeout()
        this.clearHideTimeout()
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip)
        }
    }
}
// 单例模式
let tooltipInstance: TooltipComponent | null = null
/** 初始化（或复用）tooltip 单例 */
export function initTooltip (options?: TooltipOptions): TooltipComponent {
    if (!tooltipInstance) {
        tooltipInstance = new TooltipComponent(options)
    }
    return tooltipInstance
}
export function bindTooltipIcons (): void {
    if (tooltipInstance) {
        tooltipInstance.bindToIcons()
    }
}
export function destroyTooltip (): void {
    if (tooltipInstance) {
        tooltipInstance.destroy()
        tooltipInstance = null
    }
}
