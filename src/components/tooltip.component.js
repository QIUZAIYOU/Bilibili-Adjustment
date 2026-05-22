/**
 * 简单直接的 Tooltip 组件
 * 直接绑定到每个图标元素
 */
export class TooltipComponent {
    constructor(options = {}) {
        this.delay = options.delay || 300
        this.container = options.container || document.body
        this.tooltip = null
        this.showTimeout = null
        this.hideTimeout = null
        this.boundIcons = new WeakSet()
        this.init()
    }

    init() {
        // 创建 tooltip 元素
        this.tooltip = document.createElement('div')
        this.tooltip.className = 'adjustment-tooltip'
        this.tooltip.style.cssText = `
            position: fixed;
            z-index: 9999999;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 320px;
            padding: 10px 14px;
            border-radius: 8px;
            background: #1a1a1a;
            color: #e0e0e0;
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid #333;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
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
    bindToIcons() {
        const icons = document.querySelectorAll('.adjustment-tips-icon[data-tooltip]')
        icons.forEach(icon => {
            // 避免重复绑定
            if (this.boundIcons.has(icon)) return
            this.boundIcons.add(icon)
            
            icon.style.cursor = 'help'
            icon.addEventListener('mouseenter', () => {
                this.clearTimeout()
                this.showTimeout = setTimeout(() => {
                    this.show(icon.dataset.tooltip, icon)
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
        this.tooltip.addEventListener('mouseenter', () => {
            this.clearHideTimeout()
            if (this.tooltip) {
                this.tooltip.style.opacity = '1'
                this.tooltip.style.transform = 'translateY(0)'
            }
        })
        this.tooltip.addEventListener('mouseleave', () => {
            this.hideTimeout = setTimeout(() => {
                this.hide()
            }, 100)
        })
    }

    show(content, target) {
        if (!this.tooltip) return

        // 设置内容（直接使用 data-tooltip 的值）
        this.tooltip.innerHTML = content
        
        // 先显示并设置 opacity 0 来获取尺寸
        this.tooltip.style.display = 'block'
        this.tooltip.style.opacity = '0'
        
        const rect = target.getBoundingClientRect()
        const tooltipRect = this.tooltip.getBoundingClientRect()
        
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

        this.tooltip.style.left = `${left}px`
        this.tooltip.style.top = `${top}px`
        
        // 真正显示
        requestAnimationFrame(() => {
            this.tooltip.style.opacity = '1'
            this.tooltip.style.transform = 'translateY(0)'
        })
    }

    hide() {
        if (!this.tooltip) return
        this.tooltip.style.opacity = '0'
        this.tooltip.style.transform = 'translateY(4px)'
        setTimeout(() => {
            if (this.tooltip && this.tooltip.style.opacity === '0') {
                this.tooltip.style.display = 'none'
            }
        }, 200)
    }

    clearTimeout() {
        if (this.showTimeout) {
            clearTimeout(this.showTimeout)
            this.showTimeout = null
        }
    }

    clearHideTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout)
            this.hideTimeout = null
        }
    }

    destroy() {
        this.clearTimeout()
        this.clearHideTimeout()
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip)
        }
    }
}

// 单例模式
let tooltipInstance = null
export function initTooltip(options) {
    if (!tooltipInstance) {
        tooltipInstance = new TooltipComponent(options)
    }
    return tooltipInstance
}

export function bindTooltipIcons() {
    if (tooltipInstance) {
        tooltipInstance.bindToIcons()
    }
}

export function destroyTooltip() {
    if (tooltipInstance) {
        tooltipInstance.destroy()
        tooltipInstance = null
    }
}
