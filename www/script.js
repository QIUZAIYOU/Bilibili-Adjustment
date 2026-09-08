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
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger within each group
                setTimeout(() => {
                    entry.target.classList.add('visible')
                }, i * 60)
                revealObs.unobserve(entry.target)
            }
        })
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
    revealTargets.forEach(el => revealObs.observe(el))
})
