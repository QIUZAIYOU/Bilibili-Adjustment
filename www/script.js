// Bilibili Adjustment — Landing Page Script
document.addEventListener('DOMContentLoaded', () => {
    // ---- Nav scroll effect ----
    const nav = document.getElementById('nav')
    const onScroll = () => {
        nav.classList.toggle('scrolled', window.scrollY > 40)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    // ---- Smooth scroll ----
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault()
            const el = document.querySelector(a.getAttribute('href'))
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
    })
    // ---- Player mockup animation ----
    const demoFeats = document.querySelectorAll('.demo-feat')
    const runDemo = () => {
        demoFeats.forEach((el, i) => {
            setTimeout(() => el.classList.add('show'), i * 300)
        })
    }
    const heroVisual = document.querySelector('.hero-visual')
    if (heroVisual) {
        const demoObs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    runDemo()
                    demoObs.unobserve(entry.target)
                }
            })
        }, { threshold: 0.3 })
        demoObs.observe(heroVisual)
    }
    // ---- Scroll reveal ----
    const revealTargets = document.querySelectorAll(
        '.feature-primary, .feature-card, .install-step, .changelog-item, .section-head, .cta'
    )
    revealTargets.forEach(el => el.setAttribute('data-reveal', ''))
    const revealObs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return
            // 按同父元素内的次序错峰（而非本次回调批次），顺序更自然；上限 5 档避免长尾
            const siblings = [...(entry.target.parentElement?.children || [])]
                .filter(el => el.hasAttribute('data-reveal'))
            const order = Math.max(0, siblings.indexOf(entry.target))
            setTimeout(() => entry.target.classList.add('visible'), Math.min(order, 5) * 70)
            revealObs.unobserve(entry.target)
        })
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
    revealTargets.forEach(el => revealObs.observe(el))

    // ---- 指针光照：光标附近的网格被照亮 ----
    // 仅精确指针设备启用；尊重 prefers-reduced-motion；缓动跟随，静止后停止 rAF 不空转
    const gridLayer = document.querySelector('.bg-grid')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (gridLayer && finePointer && !reduced) {
        const IDLE = -400
        let targetX = IDLE
        let targetY = IDLE
        let curX = IDLE
        let curY = IDLE
        let rafId = null
        const tick = () => {
            // 缓动跟随：光斑平滑追上光标，避免生硬跳变
            curX += (targetX - curX) * 0.16
            curY += (targetY - curY) * 0.16
            gridLayer.style.setProperty('--mx', curX.toFixed(1) + 'px')
            gridLayer.style.setProperty('--my', curY.toFixed(1) + 'px')
            if (Math.abs(targetX - curX) < 0.5 && Math.abs(targetY - curY) < 0.5) {
                rafId = null
                return
            }
            rafId = requestAnimationFrame(tick)
        }
        window.addEventListener('pointermove', e => {
            targetX = e.clientX
            targetY = e.clientY
            if (!document.body.classList.contains('pointer-glow')) {
                document.body.classList.add('pointer-glow')
            }
            if (rafId === null) rafId = requestAnimationFrame(tick)
        }, { passive: true })
        const hide = () => document.body.classList.remove('pointer-glow')
        document.addEventListener('pointerleave', hide)
        window.addEventListener('blur', hide)
    }
})
