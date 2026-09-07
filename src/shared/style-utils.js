export const ifTrue = (condition, styles) => condition ? styles : ''
export const cx = (...styles) => styles.filter(Boolean).join(' ')
export const breakpoint = {
    sm: '@media (max-width: 576px)',
    md: '@media (max-width: 768px)',
    lg: '@media (max-width: 992px)'
}
export const scrollbarStyle = (color = 'var(--adj-brand)') => `
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track-piece {
        border-radius: 0;
        background-color: var(--adj-bg-input);
    }
    ::-webkit-scrollbar-thumb:vertical,
    ::-webkit-scrollbar-thumb:horizontal {
        border-radius: 6px;
        background-color: ${color};
    }
    ::-webkit-scrollbar-corner {
        border-radius: 0;
        background-color: var(--adj-bg-page);
    }
`
export const popoverBaseStyle = (width = '520px') => `
    position: fixed;
    inset: 0;
    margin: auto;
    box-sizing: border-box;
    padding: var(--adj-space-xl);
    width: ${width};
    max-height: 85vh;
    border: 0;
    border-radius: var(--adj-radius-lg);
    font-size: var(--adj-font-base);
    overscroll-behavior: contain;
    background: linear-gradient(180deg, var(--adj-bg-page) 0%, var(--adj-bg-input) 100%);
    overflow-y: auto;
    color: var(--adj-text-primary);
    border: 1px solid var(--adj-border-strong);
    box-shadow: var(--adj-shadow-lg), 0 0 0 1px rgba(var(--adj-brand-rgb), 0.1);
`
export const buttonStyle = (variant = 'primary') => {
    const variants = {
        primary: `
            background: var(--adj-brand);
            color: var(--adj-on-brand);
            border-color: transparent;
            &:hover {
                background: var(--adj-brand-hover);
                transform: translateY(-1px);
                box-shadow: var(--adj-shadow-glow);
            }
        `,
        secondary: `
            background: var(--adj-bg-surface-hover);
            color: var(--adj-text-primary);
            border-color: var(--adj-border-strong);
            &:hover {
                background: var(--adj-bg-surface);
            }
        `,
        outline: `
            background: transparent;
            border-color: var(--adj-border-strong);
            color: var(--adj-text-soft);
            &:hover {
                background: var(--adj-bg-surface);
                color: var(--adj-text-primary);
            }
        `
    }
    return `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        margin: 0;
        padding: var(--adj-space-sm) var(--adj-space-xl);
        outline: 0;
        border: 1px solid;
        border-radius: var(--adj-radius-md);
        text-align: center;
        white-space: nowrap;
        font-weight: 500;
        font-size: var(--adj-font-base);
        line-height: 1;
        cursor: pointer;
        transition: var(--adj-motion-normal);
        -webkit-appearance: none;
        -moz-user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
        &:active {
            transform: translateY(0);
        }
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        ${variants[variant] || variants.primary}
    `
}
