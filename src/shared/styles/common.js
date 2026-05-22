import { theme } from '../theme'

export const commonStyles = {
    bodyOverflowHidden: `
        body {
            overflow: hidden !important;
        }
    `,

    resetPlayerLayout: `
        body {
            padding-top: 0;
            position: auto;
        }
        #playerWrap {
            display: block;
        }
        #bilibili-player {
            height: auto;
            position: relative;
        }
        .bpx-player-mini-warp {
            display: none;
        }
    `,

    unlockWebPlayer: `
        body.webscreen-fix {
            padding-top: BODYHEIGHT;
            position: unset;
        }
        #bilibili-player.mode-webscreen {
            height: BODYHEIGHT;
            position: absolute;
        }
        #playerWrap {
            display: none;
        }
        #danmukuBox {
            margin-top: 0;
        }
    `,

    freezeHeaderAndVideoTitle: `
        #biliMainHeader {
            height: 64px !important;
        }
        #viewbox_report {
            height: 108px !important;
            padding-top: 22px !important;
        }
        .members-info-container {
            height: 86px !important;
            overflow: hidden !important;
            padding-top: 11px !important;
        }
        .membersinfo-wide .header {
            display: none !important;
        }
    `,

    videoCommentDescription: `
        #bili-adjustment-body {
            position: relative;
            padding-left: 80px;
            padding-top: 22px;
        }
        #bili-adjustment-user-avatar {
            position: absolute;
            left: 20px;
            top: 22px;
            width: 48px;
            height: 48px;
            transform-origin: left top;
            transform: scale(1);
        }
        #bili-adjustment-avatar-picture {
            width: 48px;
            height: 48px;
            opacity: 1;
            border-radius: 50%;
            border: 2px solid ${theme.colors.primary};
        }
        #bili-adjustment-info {
            display: inline-flex;
            align-items: center;
        }
        #bili-adjustment-user-name {
            font-size: 13px;
            font-weight: 500;
        }
        #bili-adjustment-user-name a {
            color: ${theme.colors.primary};
            text-decoration: none;
        }
        #bili-adjustment-user-badge {
            background: #0491bf;
            border-radius: 3px;
            color: #fff;
            padding: 2px 3px;
            margin-left: 5px;
            font-size: 10px;
        }
        #bili-adjustment-content {
            font-size: 15px;
            line-height: 24px;
        }
        #bili-adjustment-contents {
            margin-block-start: 0;
            margin-block-end: 0;
            margin-inline-start: 0;
            margin-inline-end: 0;
            display: inline;
            white-space: pre-line;
            word-break: break-word;
            -webkit-font-smoothing: antialiased;
        }
        #bili-adjustment-contents a {
            color: ${theme.colors.primary};
            text-decoration: none;
            background-color: transparent;
            cursor: pointer;
        }
        #bili-adjustment-spread-line {
            padding-bottom: 14px;
            margin-left: 80px;
            border-bottom: 1px solid var(--graph_bg_thick);
        }
    `,

    videoSettingsOpenButton: `
        border: 1px solid var(--line_light);
        font-size: 12px;
        box-sizing: border-box;
        border-radius: ${theme.borderRadius.sm};
        width: 40px;
        margin-bottom: 12px;
        transition: ${theme.transitions.slow};
        cursor: pointer;
        color: var(--text1);
        fill: var(--text1);
        text-align: center;
        padding: 8px 0 4px;
        background-color: var(--bg1_float);
    `
}
