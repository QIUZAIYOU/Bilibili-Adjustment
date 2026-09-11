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
        // 光效强度：光标落在内容元素上时衰减——这些元素本就在网格层之上，
        // 衰减后看起来就像光被挡在卡片后面（模拟遮挡而不是把光糊在卡片上）
        const OCCLUDERS = '.feature-card, .feature-primary, .install-step, .nav, .cta, .hero, .hero-visual, .visual-card, .footer, .section-head'
        let strength = 0
        let targetStrength = 1
        let hitX = -1e4
        let hitY = -1e4
        const tick = () => {
            // 缓动跟随：光斑平滑追上光标，带一点迟滞，像光线而不是贴纸
            curX += (targetX - curX) * 0.16
            curY += (targetY - curY) * 0.16
            // 位移超过 6px 才重新做命中测试（elementFromPoint 有成本，避免每帧调用）
            if (Math.abs(targetX - hitX) > 6 || Math.abs(targetY - hitY) > 6) {
                hitX = targetX
                hitY = targetY
                const hit = document.elementFromPoint(targetX, targetY)
                targetStrength = hit && hit.closest(OCCLUDERS) ? 0.32 : 1
            }
            strength += (targetStrength - strength) * 0.12
            document.documentElement.style.setProperty('--mx', curX.toFixed(1) + 'px')
            document.documentElement.style.setProperty('--my', curY.toFixed(1) + 'px')
            document.documentElement.style.setProperty('--glow-opacity', strength.toFixed(3))
            const settled = Math.abs(targetX - curX) < 0.5 && Math.abs(targetY - curY) < 0.5
            if (settled && Math.abs(targetStrength - strength) < 0.01) {
                rafId = null
                return
            }
            rafId = requestAnimationFrame(tick)
        }
        window.addEventListener('pointermove', e => {
            targetX = e.clientX
            targetY = e.clientY
            if (rafId === null) rafId = requestAnimationFrame(tick)
        }, { passive: true })
        // 移出窗口或失焦：强度归零，光效平滑淡出（而非瞬间消失）
        const hide = () => { targetStrength = 0 }
        document.addEventListener('pointerleave', hide)
        window.addEventListener('blur', hide)
    }

    // ---- 卡片边缘光：光标进入卡片时点亮它 1px 的边框 ----
    // 光点位置按光标在卡片内的相对坐标写入 --px/--py，光感跟着指针走（对应鸿蒙 lightEffect）；
    // 监听挂在每张卡片自身上，所以只有被指向的那张卡片才产生计算
    const LIT_SELECTOR = '.feature-primary, .feature-card, .install-step'
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.querySelectorAll(LIT_SELECTOR).forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect()
                el.style.setProperty('--px', (e.clientX - r.left).toFixed(1) + 'px')
                el.style.setProperty('--py', (e.clientY - r.top).toFixed(1) + 'px')
                el.classList.add('is-lit')
            }, { passive: true })
            el.addEventListener('pointerleave', () => el.classList.remove('is-lit'))
        })
    }
})
