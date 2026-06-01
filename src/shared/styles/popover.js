import { theme } from '../theme'
import { popoverBaseStyle, buttonStyle, scrollbarStyle } from '../style-utils'

export const popoverStyles = {
    base: popoverBaseStyle(),

    backdrop: `
        &::backdrop {
            backdrop-filter: blur(12px);
            background: rgba(0,0,0,0.7);
        }
    `,

    title: `
        margin-bottom: ${theme.spacing.lg};
        text-align: center;
        font-weight: 600;
        font-size: ${theme.fontSize.xxl};
        color: #fff;

        .adjustment-popover-subtitle {
            font-size: ${theme.fontSize.sm};
            margin-top: ${theme.spacing.xs};
            color: ${theme.colors.textSecondary};
        }
    `,

    version: `
        position: absolute;
        top: ${theme.spacing.sm};
        right: ${theme.spacing.md};
        font-size: ${theme.fontSize.xs};
        color: ${theme.colors.textDisabled};
    `,

    recommend: `
        padding: ${theme.spacing.md};
        border: 1px solid ${theme.colors.border};
        border-radius: ${theme.borderRadius.md};
        box-sizing: border-box;
        text-align: center;
        margin-bottom: ${theme.spacing.xl};
        font-size: ${theme.fontSize.sm};
        background: rgba(0,161,214,0.05);

        a {
            color: ${theme.colors.primary};
            text-decoration: none;
            font-weight: 500;
        }
    `,

    buttonGroup: `
        display: flex;
        margin-top: ${theme.spacing.xl};
        align-items: center;
        justify-content: flex-end;
        gap: ${theme.spacing.md};
        padding-top: ${theme.spacing.lg};
        border-top: 1px solid ${theme.colors.border};
    `,

    button: buttonStyle(),

    form: `
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing.lg};
    `,

    sectionTitle: `
        font-size: ${theme.fontSize.lg};
        font-weight: 600;
        color: #fff;
        margin-bottom: ${theme.spacing.md};
        padding-bottom: ${theme.spacing.sm};
        border-bottom: 1px solid ${theme.colors.border};
    `,

    formItem: `
        display: flex;
        flex-direction: column;
        gap: ${theme.spacing.sm};
        padding: ${theme.spacing.md};
        border-radius: ${theme.borderRadius.lg};
        background: rgba(255,255,255,0.02);
        border: 1px solid transparent;
        transition: ${theme.transitions.normal};

        &:hover {
            background: rgba(255,255,255,0.05);
            border-color: rgba(0,161,214,0.2);
        }
    `,

    formItemContent: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: ${theme.spacing.md};

        label {
            flex-shrink: 0;
            font-size: ${theme.fontSize.base};
            color: ${theme.colors.textPrimary};
        }
    `,

    input: `
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        padding: ${theme.spacing.sm} ${theme.spacing.md};
        border: 1px solid ${theme.colors.border};
        border-radius: ${theme.borderRadius.md};
        background: ${theme.colors.backgroundLight};
        color: ${theme.colors.textPrimary};
        font-size: ${theme.fontSize.base};
        outline: none;
        transition: ${theme.transitions.normal};

        &:focus {
            border-color: ${theme.colors.primary};
            background: ${theme.colors.background};
            box-shadow: 0 0 0 3px rgba(0,161,214,0.1);
        }

        &::placeholder {
            color: ${theme.colors.textDisabled};
        }
    `,

    checkboxBtn: `
        position: relative;
        width: 44px;
        height: 26px;
        border-radius: 13px;
        background: ${theme.colors.secondary};
        cursor: pointer;
        transition: ${theme.transitions.normal};

        &:hover {
            background: ${theme.colors.surface};
        }

        .knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: ${theme.colors.textSecondary};
            transition: ${theme.transitions.normal};
        }

        .btn-bg {
            position: absolute;
            inset: 0;
            border-radius: 13px;
            background: linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%);
            opacity: 0;
            transition: opacity ${theme.transitions.normal};
        }

        input:checked ~ .knob {
            left: 20px;
            background: #fff;
            transform: scale(1.05);
        }

        input:checked ~ .btn-bg {
            opacity: 1;
        }
    `,

    select: `
        position: relative;

        select {
            min-width: 140px;
            height: 40px;
            padding: 0 32px 0 ${theme.spacing.md};
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.borderRadius.md};
            background: ${theme.colors.backgroundLight};
            color: ${theme.colors.textPrimary};
            font-size: ${theme.fontSize.base};
            outline: none;
            transition: ${theme.transitions.normal};
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            cursor: pointer;

            &:focus {
                border-color: ${theme.colors.primary};
                background: ${theme.colors.background};
                box-shadow: 0 0 0 3px rgba(0,161,214,0.1);
            }

            option {
                background: ${theme.colors.background};
                color: ${theme.colors.textPrimary};
                border: none;
                padding: ${theme.spacing.sm} ${theme.spacing.md};
            }
        }

        &::after {
            content: "▼";
            position: absolute;
            right: ${theme.spacing.md};
            top: 50%;
            transform: translateY(-50%);
            font-size: ${theme.fontSize.xs};
            color: ${theme.colors.textSecondary};
            pointer-events: none;
        }
    `,

    tips: `
        font-size: ${theme.fontSize.sm};
        color: ${theme.colors.textDisabled};
        line-height: 1.5;

        &.info {
            color: ${theme.colors.textSecondary};
        }

        &.warning {
            color: ${theme.colors.warning};
        }

        &.error {
            color: ${theme.colors.error};
        }

        &.success {
            color: ${theme.colors.success};
        }

        a {
            color: inherit;
            text-decoration: none;
        }
    `,

    scrollbar: scrollbarStyle()
}
