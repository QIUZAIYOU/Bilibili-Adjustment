import { theme } from '../theme'
export const videoPageStyles = {
    playerControl: `
        .bpx-player-container[data-screen=full] #goToComments {
            opacity: 0.6;
            cursor: not-allowed;
            pointer-events: none;
        }

        #bilibili-player video {
            transition: transform 0.3s ease;
            transform-origin: center center;
        }

        .bpx-player-video-wrap {
            overflow: visible !important;
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

        #UpSpacePopover {
            width: min(1080px, 94vw);
            height: min(880px, 90vh);
            max-height: 90vh;
            padding: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        #UpSpacePopover .adjustment-popover-header {
            flex-shrink: 0;
            padding: 14px 20px;
        }

        #UpSpacePopover .up-space-popover-frame {
            flex: 1;
            width: 100%;
            border: none;
        }

        #UpSpacePopoverCloseButton {
            cursor: pointer;
            font-size: 16px;
            color: #888;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 6px;
            user-select: none;
        }

        #UpSpacePopoverCloseButton:hover {
            color: #fff;
            background: #333;
        }

        #SkipSegmentManagerPopover {
            width: min(500px, 90vw);
            max-height: 70vh;
            padding: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        #SkipSegmentManagerPopover .adjustment-popover-header {
            flex-shrink: 0;
            padding: 14px 20px;
        }

        #SkipSegmentManagerPopover .adjustment-popover-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        #SkipSegmentManagerPopover .adjustment-popover-title {
            font-size: 18px;
            font-weight: 600;
            color: #fff;
        }

        #SkipSegmentManagerCloseButton {
            cursor: pointer;
            font-size: 16px;
            color: #888;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 6px;
            user-select: none;
        }

        #SkipSegmentManagerCloseButton:hover {
            color: #fff;
            background: #333;
        }

        .adjustment-popover-back {
            cursor: pointer;
            font-size: 22px;
            color: #888;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 6px;
            user-select: none;
            margin-right: 8px;
            font-weight: 300;
        }

        .adjustment-popover-back:hover {
            color: #fff;
            background: #333;
        }

        .episode-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 420px;
            overflow-y: auto;
            padding: 16px 20px;
        }

        .episode-list-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            border-radius: 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            cursor: pointer;
            transition: all 0.2s;
        }

        .episode-list-item:hover {
            background: rgba(255,255,255,0.08);
            border-color: rgba(0,161,214,0.3);
        }

        .episode-list-item.current {
            background: rgba(0,161,214,0.12);
            border-color: rgba(0,161,214,0.4);
        }

        .episode-list-item.has-segments .episode-segment-count {
            color: #00a1d6;
        }

        .episode-index {
            color: #00a1d6;
            font-weight: 600;
            font-size: 14px;
            min-width: 24px;
        }

        .episode-title {
            color: #ccc;
            font-size: 13px;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .episode-list-item.current .episode-title {
            color: #fff;
            font-weight: 500;
        }

        .episode-segment-count {
            color: #666;
            font-size: 12px;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .episode-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            margin-bottom: 14px;
            border-radius: 8px;
            background: rgba(0,161,214,0.08);
            border: 1px solid rgba(0,161,214,0.15);
        }

        .episode-header-index {
            color: #00a1d6;
            font-weight: 600;
            font-size: 15px;
        }

        .episode-header-title {
            color: #fff;
            font-size: 14px;
        }

        .episode-header-segments {
            margin-left: auto;
            color: #868686;
            font-size: 13px;
        }

        #SkipSegmentManagerPopover .adjustment-popover-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            min-height: 80px;
        }

        #SkipSegmentManagerPopover .empty-tip {
            text-align: center;
            color: #666;
            font-size: 13px;
            line-height: 1.6;
            margin: -12px 0 28px;
        }

        #SkipSegmentManagerPopover .empty-result,
        #SkipSegmentManagerPopover .loading,
        #SkipSegmentManagerPopover .error,
        #SkipSegmentManagerPopover .success {
            text-align: center;
            padding: 40px 0 24px;
            color: #868686;
        }

        #SkipSegmentManagerPopover .empty-result { padding: 24px; }
        #SkipSegmentManagerPopover .error { color: #f56c6c; }
        #SkipSegmentManagerPopover .success { color: #67c23a; }

        #SkipSegmentManagerPopover .cache-info {
            padding: 12px;
            margin-bottom: 16px;
            background: rgba(0,161,214,0.08);
            border-radius: 8px;
            border: 1px solid rgba(0,161,214,0.15);
        }

        #SkipSegmentManagerPopover .cache-meta {
            font-size: 13px;
            color: #868686;
            line-height: 1.6;
        }

        #SkipSegmentManagerPopover .segment-count {
            margin: 16px 0;
            color: #fff;
            font-size: 15px;
        }

        #SkipSegmentManagerPopover .segment-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        #SkipSegmentManagerPopover .segment-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            transition: background 0.2s;
        }

        #SkipSegmentManagerPopover .segment-item:hover {
            background: rgba(255,255,255,0.08);
        }

        #SkipSegmentManagerPopover .segment-index {
            color: #00a1d6;
            font-weight: 600;
            font-size: 14px;
            min-width: 20px;
        }

        #SkipSegmentManagerPopover .segment-time {
            color: #fff;
            font-family: monospace;
            font-size: 14px;
            background: rgba(0,161,214,0.15);
            padding: 4px 10px;
            border-radius: 4px;
        }

        #SkipSegmentManagerPopover .segment-delete {
            margin-left: auto;
            cursor: pointer;
            color: #868686;
            font-size: 16px;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.2s;
            opacity: 0;
        }

        #SkipSegmentManagerPopover .segment-item:hover .segment-delete {
            opacity: 1;
        }

        #SkipSegmentManagerPopover .segment-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }

        #SkipSegmentManagerPopover .manual-entry-section {
            padding: 12px 20px 16px;
            border-top: 1px solid #424242;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        #SkipSegmentManagerPopover .inline-msg {
            font-size: 13px;
            border-radius: 6px;
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: all 0.2s;
        }

        #SkipSegmentManagerPopover .inline-msg.warn {
            color: #e6a23c;
            background: rgba(230,162,60,0.1);
            border: 1px solid rgba(230,162,60,0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        #SkipSegmentManagerPopover .manual-entry-form {
            display: flex;
            align-items: flex-end;
            gap: 10px;
        }

        #SkipSegmentManagerPopover .time-inputs {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            flex: 1;
        }

        #SkipSegmentManagerPopover .time-input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        }

        #SkipSegmentManagerPopover .time-input-group label {
            font-size: 12px;
            color: #868686;
        }

        #SkipSegmentManagerPopover .time-input {
            background: #2a2a2a;
            border: 1px solid #424242;
            border-radius: 6px;
            color: #fff;
            padding: 8px 10px;
            font-size: 14px;
            font-family: monospace;
            width: 100%;
            box-sizing: border-box;
        }

        #SkipSegmentManagerPopover .time-input:focus {
            border-color: #00a1d6;
            outline: none;
        }

        #SkipSegmentManagerPopover .time-separator {
            color: #868686;
            font-size: 14px;
            padding-bottom: 8px;
        }

        #SkipSegmentManagerPopover .manual-add-btn {
            padding: 8px 16px;
            white-space: nowrap;
            flex-shrink: 0;
        }

        #SkipSegmentManagerPopover .pending-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        #SkipSegmentManagerPopover .pending-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 6px;
            background: rgba(0,161,214,0.06);
            border: 1px solid rgba(0,161,214,0.12);
            font-size: 13px;
        }

        #SkipSegmentManagerPopover .pending-item .segment-time {
            background: rgba(0,161,214,0.12);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            color: #fff;
        }

        #SkipSegmentManagerPopover .pending-item .pending-delete {
            margin-left: auto;
            cursor: pointer;
            color: #868686;
            font-size: 14px;
            padding: 2px 4px;
            border-radius: 3px;
        }

        #SkipSegmentManagerPopover .pending-item .pending-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }
    `
}
