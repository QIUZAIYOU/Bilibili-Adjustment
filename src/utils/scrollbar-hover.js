import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('ScrollbarHover')
// 滚动条悬停加宽：悬停检测与宽度动画全部由 JS 驱动。
// Chromium 的 ::-webkit-scrollbar 不继承自定义属性、不支持 transition，:hover 命中还有明显延迟，
// 因此悬停时在目标元素上打 data 属性，逐帧重写专用样式规则实现动画加宽/恢复
// 仅鼠标落在滚动条滑块（thumb）上才触发；页面（文档）滚动条与页面内元素滚动条都生效
const SCROLLBAR_BASE_WIDTH = 8
const SCROLLBAR_HOVER_WIDTH = 12
const HOVER_MARGIN = 14
const ANIMATION_DURATION = 150
const MIN_THUMB_LENGTH = 20
const HOVER_ATTRIBUTE = 'data-adjustment-scrollbar-hover'
const PAGE_SCROLLBAR = Symbol('page-scrollbar')
const easeOutCubic = t => 1 - Math.pow(1 - t, 3)
export const initScrollbarHoverWidening = () => {
    const styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    const active = { el: null, width: SCROLLBAR_BASE_WIDTH, to: SCROLLBAR_BASE_WIDTH, raf: 0, start: 0, from: 0 }
    // !important 保证覆盖 B站 自身的滚动条宽度样式；属性选择器特异性高于基础规则
    const writeWidthRule = width => {
        styleElement.textContent =
            `[${HOVER_ATTRIBUTE}]::-webkit-scrollbar { width: ${width}px !important; height: ${width}px !important; }`
    }
    // 页面滚动条可能由 html 伪元素渲染，也可能由 body 传播到视口（html overflow hidden 时），两个元素同时打标记
    const applyHoverMark = target => {
        if (target === PAGE_SCROLLBAR) {
            document.documentElement.setAttribute(HOVER_ATTRIBUTE, '')
            document.body.setAttribute(HOVER_ATTRIBUTE, '')
        } else {
            target.setAttribute(HOVER_ATTRIBUTE, '')
        }
    }
    const removeHoverMark = target => {
        if (target === PAGE_SCROLLBAR) {
            document.documentElement.removeAttribute(HOVER_ATTRIBUTE)
            document.body.removeAttribute(HOVER_ATTRIBUTE)
        } else {
            target.removeAttribute(HOVER_ATTRIBUTE)
        }
    }
    const tick = now => {
        active.raf = 0
        if (!active.el) return
        const progress = Math.min(1, (now - active.start) / ANIMATION_DURATION)
        active.width = active.from + (active.to - active.from) * easeOutCubic(progress)
        writeWidthRule(active.width)
        if (progress < 1) {
            active.raf = requestAnimationFrame(tick)
        } else if (active.to === SCROLLBAR_BASE_WIDTH) {
            // 恢复动画结束：移除悬停标记，落回基础规则
            removeHoverMark(active.el)
            active.el = null
            active.width = SCROLLBAR_BASE_WIDTH
        }
    }
    const cancelAnimation = () => {
        cancelAnimationFrame(active.raf)
        active.raf = 0
    }
    // 切换目标时旧目标立即恢复（同一时间只能有一个目标持有悬停标记）
    const instantRestore = () => {
        cancelAnimation()
        if (active.el) {
            removeHoverMark(active.el)
            active.el = null
        }
        active.width = SCROLLBAR_BASE_WIDTH
        active.to = SCROLLBAR_BASE_WIDTH
    }
    const startWiden = target => {
        applyHoverMark(target)
        writeWidthRule(SCROLLBAR_BASE_WIDTH)
        active.el = target
        active.from = SCROLLBAR_BASE_WIDTH
        active.to = SCROLLBAR_HOVER_WIDTH
        active.start = performance.now()
        active.raf = requestAnimationFrame(tick)
    }
    // 移出滚动条：从当前宽度动画恢复
    const startShrink = () => {
        if (!active.el || active.to === SCROLLBAR_BASE_WIDTH) return
        cancelAnimation()
        active.from = active.width
        active.to = SCROLLBAR_BASE_WIDTH
        active.start = performance.now()
        active.raf = requestAnimationFrame(tick)
    }
    // 仅当元素确实渲染出滚动条（内容溢出且 overflow 允许显示）时才视为命中
    const rendersScrollbar = (overflow, scrollSize, clientSize) =>
        scrollSize > clientSize + 1 && overflow !== 'visible' && overflow !== 'hidden' && overflow !== 'clip'
    // 按 thumb 几何位置判断光标是否落在滑块上（轨道命中不触发加宽）
    const isCursorOverThumb = (el, axis, clientX, clientY, trackStartOverride) => {
        const rect = el.getBoundingClientRect()
        const isVertical = axis === 'y'
        const scrollOffset = isVertical ? el.scrollTop : el.scrollLeft
        const clientSize = isVertical ? el.clientHeight : el.clientWidth
        const scrollSize = isVertical ? el.scrollHeight : el.scrollWidth
        const scrollableRange = scrollSize - clientSize
        const trackLength = clientSize
        const thumbLength = Math.max(MIN_THUMB_LENGTH, trackLength * clientSize / scrollSize)
        const travelRange = trackLength - thumbLength
        const thumbOffset = travelRange > 0 ? scrollOffset / scrollableRange * travelRange : 0
        const cursorPosition = isVertical ? clientY : clientX
        // 文档滚动元素（scrollingElement）的 rect 是文档坐标（top = -scrollY），非视口坐标；
        // 页面滚动条轨道从视口边缘（0）开始，调用处传入 0 覆盖，否则滚动后检测区间会偏出视口
        const trackStart = trackStartOverride ?? (isVertical ? rect.top : rect.left)
        const thumbStart = trackStart + thumbOffset
        return cursorPosition >= thumbStart && cursorPosition <= thumbStart + thumbLength
    }
    const findHoveredScrollbar = (clientX, clientY) => {
        // 页面内元素滚动条优先：从光标所在元素向上遍历
        const cursorElement = document.elementFromPoint(clientX, clientY)
        if (cursorElement) {
            let el = cursorElement
            while (el && el !== document.body) {
                const rect = el.getBoundingClientRect()
                if (rect.right - clientX <= HOVER_MARGIN || rect.bottom - clientY <= HOVER_MARGIN) {
                    const computed = getComputedStyle(el)
                    const verticalHovered = rect.right - clientX <= HOVER_MARGIN &&
                        rendersScrollbar(computed.overflowY, el.scrollHeight, el.clientHeight) &&
                        isCursorOverThumb(el, 'y', clientX, clientY)
                    const horizontalHovered = rect.bottom - clientY <= HOVER_MARGIN &&
                        rendersScrollbar(computed.overflowX, el.scrollWidth, el.clientWidth) &&
                        isCursorOverThumb(el, 'x', clientX, clientY)
                    if (verticalHovered || horizontalHovered) return el
                }
                el = el.parentElement
            }
        }
        // 页面（文档）滚动条：视口边缘条带且光标落在滑块上
        const scroller = document.scrollingElement || document.documentElement
        const nearRightEdge = clientX >= window.innerWidth - HOVER_MARGIN
        const nearBottomEdge = clientY >= window.innerHeight - HOVER_MARGIN
        const pageThumbHovered = (nearRightEdge && scroller.scrollHeight > scroller.clientHeight + 1 && isCursorOverThumb(scroller, 'y', clientX, clientY, 0)) ||
            (nearBottomEdge && scroller.scrollWidth > scroller.clientWidth + 1 && isCursorOverThumb(scroller, 'x', clientX, clientY, 0))
        return pageThumbHovered ? PAGE_SCROLLBAR : null
    }
    const handleMove = (clientX, clientY) => {
        const next = findHoveredScrollbar(clientX, clientY)
        if (next === active.el) {
            // 恢复动画进行中重新悬停：从当前宽度立即反向加宽
            if (active.to === SCROLLBAR_HOVER_WIDTH) return
            cancelAnimation()
            active.from = active.width
            active.to = SCROLLBAR_HOVER_WIDTH
            active.start = performance.now()
            active.raf = requestAnimationFrame(tick)
            return
        }
        if (next) {
            instantRestore()
            startWiden(next)
            return
        }
        startShrink()
    }
    let scheduled = false
    document.addEventListener('mousemove', e => {
        if (scheduled) return
        scheduled = true
        requestAnimationFrame(() => {
            scheduled = false
            handleMove(e.clientX, e.clientY)
        })
    })
    // 光标移出视口时动画恢复
    document.addEventListener('mouseleave', startShrink)
    logger.debug('滚动条悬停加宽已初始化')
}
