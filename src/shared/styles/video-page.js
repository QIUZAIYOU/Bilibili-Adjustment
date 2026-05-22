import { theme } from '../theme'

export const videoPageStyles = {
    playerControl: `
        .bpx-player-container[data-screen=full] #goToComments {
            opacity: 0.6;
            cursor: not-allowed;
            pointer-events: none;
        }
    `,

    commentDescription: `
        #comment-description .user-name {
            display: flex;
            padding: 0 ${theme.spacing.xs};
            height: 22px;
            border: 1px solid;
            border-radius: ${theme.borderRadius.sm};
            align-items: center;
            justify-content: center;
        }
    `,

    skipButton: `
        .bpx-player-ctrl-skip {
            border: none !important;
            background: none !important;
        }
    `,

    episodeSelector: `
        .bpx-player-control-bottom-right .bpx-player-ctrl-btn.bpx-player-ctrl-eplist {
            visibility: visible !important;
            width: 36px !important;
        }

        .bpx-player-ctrl-eplist-menu-wrap {
            min-height: auto !important;
            height: fit-content;
            overscroll-behavior: contain;
        }
    `,

    popoverOverrides: `
        #VideoSettingsPopover {
            width: 550px;
            max-height: 90vh;
        }

        #OffsetTop {
            width: 100px;
        }

        #AiApikey {
            width: 296px;
        }

        .player-mod .adjustment-checkboxGroup {
            flex-direction: row;
        }

        .player-mod .adjustment-checkboxGroup .adjustment-checkbox:last-child .adjustment-radio-btn {
            width: 98px;
        }

        .ai-auto-skip-content {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: ${theme.spacing.lg};
        }

        .auto-skip-checkbox {
            align-items: center;
            display: flex;
            justify-content: space-between;
            width: 100%;
        }

        .ai-api-key {
            align-items: center;
            display: flex;
            justify-content: space-between;
        }
    `
}
