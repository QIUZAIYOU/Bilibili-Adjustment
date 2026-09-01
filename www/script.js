// Scroll Reveal Animation
document.addEventListener('DOMContentLoaded', () => {
    // Add reveal class to elements
    const revealElements = document.querySelectorAll(
        '.feature-card, .feature-hero, .step, .section-header, .cta'
    );
    revealElements.forEach(el => el.classList.add('reveal'));

    // Intersection Observer for scroll reveal
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Stagger animation
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => observer.observe(el));

    // Counter Animation
    const counter = document.querySelector('[data-count]');
    if (counter) {
        const target = parseInt(counter.dataset.count);
        let current = 0;
        const increment = target / 30;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                counter.textContent = target;
                clearInterval(timer);
            } else {
                counter.textContent = Math.floor(current);
            }
        }, 50);
    }

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Nav background on scroll
    const nav = document.querySelector('.nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.background = 'rgba(10, 10, 11, 0.95)';
        } else {
            nav.style.background = 'rgba(10, 10, 11, 0.8)';
        }
    });
});
