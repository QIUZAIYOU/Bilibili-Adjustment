import { popoverBaseStyle, buttonStyle, scrollbarStyle } from '../style-utils'
export const popoverStyles = {
    base: popoverBaseStyle(),
    backdrop: `
        &::backdrop {
            backdrop-filter: blur(12px);
            background: var(--adj-bg-scrim-strong);
        }
    `,
    title: `
        margin-bottom: var(--adj-space-lg);
        text-align: center;
        font-weight: 600;
        font-size: var(--adj-font-xxl);
        color: var(--adj-text-strong);

        .subTitle {
            font-size: var(--adj-font-sm);
            margin-top: var(--adj-space-xs);
            color: var(--adj-text-soft);
        }
    `,
    version: `
        position: absolute;
        top: var(--adj-space-sm);
        right: var(--adj-space-md);
        font-size: var(--adj-font-xs);
        color: var(--adj-text-disabled);
    `,
    recommend: `
        padding: var(--adj-space-md);
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-md);
        box-sizing: border-box;
        text-align: center;
        margin-bottom: var(--adj-space-xl);
        font-size: var(--adj-font-sm);
        background: rgba(var(--adj-brand-rgb), 0.05);

        a {
            color: var(--adj-brand);
            text-decoration: none;
            font-weight: 500;
        }
    `,
    buttonGroup: `
        display: flex;
        margin-top: var(--adj-space-xl);
        align-items: center;
        justify-content: flex-end;
        gap: var(--adj-space-md);
        padding-top: var(--adj-space-lg);
        border-top: 1px solid var(--adj-border-strong);
    `,
    button: buttonStyle(),
    form: `
        display: flex;
        flex-direction: column;
        gap: var(--adj-space-lg);
    `,
    sectionTitle: `
        font-size: var(--adj-font-lg);
        font-weight: 600;
        color: var(--adj-text-strong);
        margin-bottom: var(--adj-space-md);
        padding-bottom: var(--adj-space-sm);
        border-bottom: 1px solid var(--adj-border-strong);
    `,
    formItem: `
        display: flex;
        flex-direction: column;
        gap: var(--adj-space-sm);
        padding: var(--adj-space-md);
        border-radius: var(--adj-radius-lg);
        background: var(--adj-bg-subtle);
        border: 1px solid transparent;
        transition: var(--adj-motion-normal);

        &:hover {
            background: var(--adj-bg-hover);
            border-color: rgba(var(--adj-brand-rgb), 0.2);
        }
    `,
    formItemContent: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--adj-space-md);

        label {
            flex-shrink: 0;
            font-size: var(--adj-font-base);
            color: var(--adj-text-primary);
        }
    `,
    input: `
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        padding: var(--adj-space-sm) var(--adj-space-md);
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-md);
        background: var(--adj-bg-page);
        color: var(--adj-text-primary);
        font-size: var(--adj-font-base);
        outline: none;
        transition: var(--adj-motion-normal);

        &:focus {
            border-color: var(--adj-brand);
            background: var(--adj-bg-input);
            box-shadow: 0 0 0 3px rgba(var(--adj-brand-rgb), 0.1);
        }

        &::placeholder {
            color: var(--adj-text-disabled);
        }
    `,
    checkboxBtn: `
        position: relative;
        width: 44px;
        height: 26px;
        border-radius: 13px;
        background: var(--adj-bg-surface-hover);
        cursor: pointer;
        transition: var(--adj-motion-normal);

        &:hover {
            background: var(--adj-bg-surface);
        }

        .knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--adj-text-soft);
            transition: var(--adj-motion-normal);
        }

        .btn-bg {
            position: absolute;
            inset: 0;
            border-radius: 13px;
            background: linear-gradient(135deg, var(--adj-brand) 0%, var(--adj-brand-hover) 100%);
            opacity: 0;
            transition: opacity var(--adj-motion-normal);
        }

        input:checked ~ .knob {
            left: 20px;
            background: var(--adj-on-brand);
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
            padding: 0 32px 0 var(--adj-space-md);
            border: 1px solid var(--adj-border-strong);
            border-radius: var(--adj-radius-md);
            background: var(--adj-bg-page);
            color: var(--adj-text-primary);
            font-size: var(--adj-font-base);
            outline: none;
            transition: var(--adj-motion-normal);
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            cursor: pointer;

            &:focus {
                border-color: var(--adj-brand);
                background: var(--adj-bg-input);
                box-shadow: 0 0 0 3px rgba(var(--adj-brand-rgb), 0.1);
            }

            option {
                background: var(--adj-bg-input);
                color: var(--adj-text-primary);
                border: none;
                padding: var(--adj-space-sm) var(--adj-space-md);
            }
        }

        &::after {
            content: "▼";
            position: absolute;
            right: var(--adj-space-md);
            top: 50%;
            transform: translateY(-50%);
            font-size: var(--adj-font-xs);
            color: var(--adj-text-soft);
            pointer-events: none;
        }
    `,
    tips: `
        font-size: var(--adj-font-sm);
        color: var(--adj-text-disabled);
        line-height: 1.5;

        &.info {
            color: var(--adj-text-soft);
        }

        &.warning {
            color: var(--adj-warning);
        }

        &.error {
            color: var(--adj-danger);
        }

        &.success {
            color: var(--adj-success);
        }

        a {
            color: inherit;
            text-decoration: none;
        }
    `,
    scrollbar: scrollbarStyle(),
    adRecognitionContent: `
        padding: var(--adj-space-md);
        min-height: 100px;

        .loading {
            text-align: center;
            color: var(--adj-text-soft);
            padding: var(--adj-space-xl);
        }

        .error {
            text-align: center;
            color: var(--adj-danger);
            padding: var(--adj-space-xl);
        }

        .success {
            text-align: center;
            color: var(--adj-success);
            padding: var(--adj-space-xl);
        }

        .result {
            .no-ad {
                text-align: center;
                color: var(--adj-text-soft);
                padding: var(--adj-space-xl);
            }

            .ad-count {
                margin-bottom: var(--adj-space-md);
                color: var(--adj-text-primary);
            }

            .ad-item {
                display: flex;
                align-items: center;
                gap: var(--adj-space-sm);
                padding: var(--adj-space-sm);
                border-radius: var(--adj-radius-md);
                background: var(--adj-bg-subtle);
                margin-bottom: var(--adj-space-xs);

                .ad-index {
                    color: var(--adj-brand);
                    font-weight: 600;
                }

                .ad-time {
                    color: var(--adj-text-primary);
                    font-family: monospace;
                }
            }
        }
    `
}
