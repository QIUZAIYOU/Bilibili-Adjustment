import { theme } from './theme'

export const generateCssVariables = () => {
    let css = ':root {'
    Object.entries(theme.colors).forEach(([key, value]) => {
        css += `--color-${key}: ${value};`
    })
    Object.entries(theme.spacing).forEach(([key, value]) => {
        css += `--spacing-${key}: ${value};`
    })
    Object.entries(theme.borderRadius).forEach(([key, value]) => {
        css += `--radius-${key}: ${value};`
    })
    css += '}'
    return css
}

export const ifTrue = (condition, styles) => condition ? styles : ''

export const cx = (...styles) => styles.filter(Boolean).join(' ')

export const breakpoint = {
    sm: '@media (max-width: 576px)',
    md: '@media (max-width: 768px)',
    lg: '@media (max-width: 992px)'
}

export const scrollbarStyle = (color = theme.colors.primary) => `
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track-piece {
        border-radius: 0;
        background-color: ${theme.colors.background};
    }
    ::-webkit-scrollbar-thumb:vertical,
    ::-webkit-scrollbar-thumb:horizontal {
        border-radius: 6px;
        background-color: ${color};
    }
    ::-webkit-scrollbar-corner {
        border-radius: 0;
        background-color: ${theme.colors.backgroundLight};
    }
`

export const popoverBaseStyle = (width = '520px') => `
    position: fixed;
    inset: 0;
    margin: auto;
    box-sizing: border-box;
    padding: ${theme.spacing.xl};
    width: ${width};
    max-height: 85vh;
    border: 0;
    border-radius: ${theme.borderRadius.lg};
    font-size: ${theme.fontSize.base};
    overscroll-behavior: contain;
    background: linear-gradient(180deg, ${theme.colors.backgroundLight} 0%, ${theme.colors.background} 100%);
    overflow-y: auto;
    color: ${theme.colors.textPrimary};
    border: 1px solid ${theme.colors.border};
    box-shadow: ${theme.shadows.lg}, 0 0 0 1px rgba(0,161,214,0.1);
`

export const buttonStyle = (variant = 'primary') => {
    const variants = {
        primary: `
            background: ${theme.colors.primary};
            color: #fff;
            border-color: transparent;
            &:hover {
                background: ${theme.colors.primaryHover};
                transform: translateY(-1px);
                box-shadow: ${theme.shadows.glow};
            }
        `,
        secondary: `
            background: ${theme.colors.secondary};
            color: ${theme.colors.textPrimary};
            border-color: ${theme.colors.border};
            &:hover {
                background: ${theme.colors.surface};
            }
        `,
        outline: `
            background: transparent;
            border-color: ${theme.colors.border};
            color: ${theme.colors.textSecondary};
            &:hover {
                background: ${theme.colors.surface};
                color: ${theme.colors.textPrimary};
            }
        `
    }

    return `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        margin: 0;
        padding: ${theme.spacing.sm} ${theme.spacing.xl};
        outline: 0;
        border: 1px solid;
        border-radius: ${theme.borderRadius.md};
        text-align: center;
        white-space: nowrap;
        font-weight: 500;
        font-size: ${theme.fontSize.base};
        line-height: 1;
        cursor: pointer;
        transition: ${theme.transitions.normal};
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
