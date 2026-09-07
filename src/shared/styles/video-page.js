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




        .skip-manager-dialog { width: min(500px, 92vw) !important; }
        .skip-manager-dialog .cache-lock-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .skip-manager-dialog .cache-lock-state {
            font-size: 12px;
            color: #999;
        }
        .skip-manager-dialog .cache-lock-btn,
        .skip-manager-dialog .accordion-lock-btn {
            cursor: pointer;
            padding: 3px 10px;
            font-size: 12px;
            border-radius: 6px;
            user-select: none;
            white-space: nowrap;
        }
        .skip-manager-dialog .accordion-owner-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 12px;
            margin-bottom: 12px;
            border: 1px solid #424242;
            border-radius: 8px;
            background: #2c2c2c;
            color: #ccc;
            font-size: 12px;
        }

        .skip-manager-dialog > .adjustment-dialog-body { padding: 0; }
        .skip-manager-dialog .adjustment-popover-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            min-height: 80px;
        }

        .skip-manager-dialog .empty-tip {
            text-align: center;
            color: #666;
            font-size: 13px;
            line-height: 1.6;
            margin: -12px 0 28px;
        }

        .skip-manager-dialog .empty-result,
        .skip-manager-dialog .loading,
        .skip-manager-dialog .error,
        .skip-manager-dialog .success {
            text-align: center;
            padding: 40px 0 24px;
            color: #868686;
        }

        .skip-manager-dialog .empty-result { padding: 24px; }
        .skip-manager-dialog .error { color: #f56c6c; }
        .skip-manager-dialog .success { color: #67c23a; }

        .skip-manager-dialog .cache-info {
            padding: 12px;
            margin-bottom: 16px;
            background: rgba(0,161,214,0.08);
            border-radius: 8px;
            border: 1px solid rgba(0,161,214,0.15);
        }

        .skip-manager-dialog .cache-meta {
            font-size: 13px;
            color: #868686;
            line-height: 1.6;
        }

        .skip-manager-dialog .segment-count {
            margin: 16px 0;
            color: #fff;
            font-size: 15px;
        }

        .skip-manager-dialog .segment-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .skip-manager-dialog .segment-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            transition: background 0.2s;
        }

        .skip-manager-dialog .segment-item:hover {
            background: rgba(255,255,255,0.08);
        }

        .skip-manager-dialog .segment-index {
            color: #00a1d6;
            font-weight: 600;
            font-size: 14px;
            min-width: 20px;
        }

        .skip-manager-dialog .segment-time {
            color: #fff;
            font-family: monospace;
            font-size: 14px;
            background: rgba(0,161,214,0.15);
            padding: 4px 10px;
            border-radius: 4px;
            flex-shrink: 0;
        }

        .skip-manager-dialog .segment-summary {
            flex: 1;
            min-width: 0;
            color: #999;
            font-size: 12px;
            line-height: 1.5;
            text-align: left;
            word-break: break-word;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .skip-manager-dialog .segment-item .segment-delete {
            margin-left: auto;
            cursor: pointer;
            color: #868686;
            font-size: 16px;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.2s;
            opacity: 0;
        }

        .skip-manager-dialog .segment-item:hover .segment-delete {
            opacity: 1;
        }

        .skip-manager-dialog .segment-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }

        .skip-manager-dialog .manual-entry-section {
            padding: 12px 20px 16px;
            border-top: 1px solid #424242;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .skip-manager-dialog .inline-msg {
            font-size: 13px;
            border-radius: 6px;
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: all 0.2s;
        }

        .skip-manager-dialog .inline-msg.warn {
            color: #e6a23c;
            background: rgba(230,162,60,0.1);
            border: 1px solid rgba(230,162,60,0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .inline-msg.success {
            color: #67c23a;
            background: rgba(103,194,58,0.1);
            border: 1px solid rgba(103,194,58,0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .manual-entry-form {
            display: flex;
            align-items: flex-end;
            gap: 10px;
        }

        .skip-manager-dialog .time-inputs {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            flex: 1;
        }

        .skip-manager-dialog .time-input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        }

        .skip-manager-dialog .time-input-group label {
            font-size: 12px;
            color: #868686;
        }

        .skip-manager-dialog .time-input {
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

        .skip-manager-dialog .time-input:focus {
            border-color: #00a1d6;
            outline: none;
        }

        .skip-manager-dialog .time-separator {
            color: #868686;
            font-size: 14px;
            padding-bottom: 8px;
        }

        .skip-manager-dialog .manual-add-btn {
            padding: 8px 16px;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .skip-manager-dialog .pending-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .skip-manager-dialog .pending-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 6px;
            background: rgba(0,161,214,0.06);
            border: 1px solid rgba(0,161,214,0.12);
            font-size: 13px;
        }

        .skip-manager-dialog .pending-item .segment-time {
            background: rgba(0,161,214,0.12);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            color: #fff;
        }

        .skip-manager-dialog .pending-item .pending-delete {
            margin-left: auto;
            cursor: pointer;
            color: #868686;
            font-size: 14px;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .skip-manager-dialog .pending-item .pending-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }

        .skip-manager-dialog .input-mode-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
        }

        .skip-manager-dialog .input-mode-btn,
        .skip-manager-dialog .accordion-manual-entry .input-mode-btn {
            background: rgba(0,161,214,0.15);
            border: 1px solid rgba(0,161,214,0.3);
            border-radius: 6px;
            color: #00a1d6;
            padding: 4px 10px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            height: 34px;
            box-sizing: border-box;
        }

        .skip-manager-dialog .input-mode-btn:hover,
        .skip-manager-dialog .accordion-manual-entry .input-mode-btn:hover {
            background: rgba(0,161,214,0.25);
        }

        .skip-manager-dialog .adjustment-button.danger {
            background: rgba(245,108,108,0.15);
            border: 1px solid rgba(245,108,108,0.3);
            color: #f56c6c;
        }

        .skip-manager-dialog .adjustment-button.danger:hover {
            background: rgba(245,108,108,0.25);
        }

        .skip-manager-dialog .adjustment-button.info {
            background: rgba(0,161,214,0.15);
            border: 1px solid rgba(0,161,214,0.3);
            color: #00a1d6;
        }

        .skip-manager-dialog .adjustment-button.info:hover {
            background: rgba(0,161,214,0.25);
        }

        .skip-manager-dialog .episode-accordion {
            display: flex;
            flex-direction: column;
            gap: 0;
            max-height: 420px;
            overflow-y: auto;
            padding: 16px 20px;
        }

        .skip-manager-dialog .episode-accordion-item {
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 8px;
            margin-bottom: 6px;
        }

        .skip-manager-dialog .episode-accordion-item:has(.episode-accordion-body.expanded) {
            border-color: rgba(0,161,214,0.3);
            z-index: 1;
            position: relative;
        }

        .skip-manager-dialog .episode-accordion-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            cursor: pointer;
            transition: background 0.2s;
            border-radius: 8px;
        }

        .skip-manager-dialog .episode-accordion-header.active {
            border-radius: 8px 8px 0 0;
        }

        .skip-manager-dialog .episode-accordion-header:hover {
            background: rgba(255,255,255,0.08);
        }

        .skip-manager-dialog .episode-accordion-header.active {
            background: rgba(0,161,214,0.12);
            border-color: rgba(0,161,214,0.4);
        }

        .skip-manager-dialog .episode-accordion-header .episode-index {
            color: #00a1d6;
            font-weight: 600;
            font-size: 14px;
            min-width: 24px;
        }

        .skip-manager-dialog .episode-accordion-header .episode-title {
            color: #ccc;
            font-size: 13px;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .skip-manager-dialog .episode-accordion-header.active .episode-title {
            color: #fff;
            font-weight: 500;
        }

        .skip-manager-dialog .episode-accordion-header .episode-segment-preview {
            color: #868686;
            font-size: 12px;
            font-family: monospace;
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .skip-manager-dialog .episode-accordion-header .episode-segment-preview.has-segments {
            color: #00a1d6;
        }

        .skip-manager-dialog .episode-accordion-header .accordion-arrow {
            color: #868686;
            font-size: 12px;
            transition: transform 0.3s ease;
            flex-shrink: 0;
        }

        .skip-manager-dialog .episode-accordion-header.active .accordion-arrow {
            transform: rotate(180deg);
        }

        .skip-manager-dialog .episode-accordion-body {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease, padding 0.3s ease;
            padding: 0 14px;
            background: rgba(0,0,0,0.15);
            border-radius: 0 0 8px 8px;
            border-top: 1px solid transparent;
        }

        .skip-manager-dialog .episode-accordion-body.expanded {
            border-top-color: rgba(0,161,214,0.2);
        }

        .skip-manager-dialog .episode-accordion-body.expanded {
            max-height: 600px;
            padding: 14px;
        }

        .skip-manager-dialog .episode-accordion-body .segment-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 6px;
        }

        .skip-manager-dialog .episode-accordion-body .segment-item {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5px 8px;
            border-radius: 6px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
        }

        .skip-manager-dialog .episode-accordion-body .segment-time {
            color: #fff;
            font-family: monospace;
            font-size: 12px;
            background: rgba(0,161,214,0.12);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .skip-manager-dialog .episode-accordion-body .empty-result {
            color: #666;
            font-size: 13px;
            padding: 12px 0;
        }

        .skip-manager-dialog .episode-accordion-body .accordion-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.06);
        }

        .skip-manager-dialog .episode-accordion-body .accordion-actions .adjustment-button {
            flex: 1 1 calc(50% - 4px);
            min-width: 0;
            font-size: 12px;
            padding: 6px 8px;
        }

        .skip-manager-dialog .accordion-manual-entry {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.06);
        }

        .skip-manager-dialog .accordion-manual-entry .manual-entry-form {
            display: flex;
            align-items: flex-end;
            gap: 10px;
        }

        .skip-manager-dialog .accordion-manual-entry .time-inputs {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            flex: 1;
        }

        .skip-manager-dialog .accordion-manual-entry .time-input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        }

        .skip-manager-dialog .accordion-manual-entry .time-input-group label {
            font-size: 12px;
            color: #868686;
        }

        .skip-manager-dialog .accordion-manual-entry .time-input {
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

        .skip-manager-dialog .accordion-manual-entry .time-input:focus {
            border-color: #00a1d6;
            outline: none;
        }

        .skip-manager-dialog .accordion-manual-entry .time-separator {
            color: #868686;
            font-size: 14px;
            padding-bottom: 8px;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-add-btn {
            padding: 8px 14px;
            white-space: nowrap;
            flex-shrink: 0;
            font-size: 12px;
            background: #00a1d6;
            color: #fff;
            border: 1px solid rgba(0,161,214,0.4);
            border-radius: 6px;
            cursor: pointer;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-add-btn:hover {
            background: #00b8e6;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-cancel-edit-btn {
            padding: 8px 14px;
            white-space: nowrap;
            flex-shrink: 0;
            font-size: 12px;
            background: #2c2c2c;
            color: #ccc;
            border: 1px solid #424242;
            border-radius: 6px;
            cursor: pointer;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-cancel-edit-btn:hover {
            background: #333;
        }

        .skip-manager-dialog .accordion-manual-entry .form-actions {
            display: flex;
            gap: 6px;
            align-items: flex-end;
        }

        .skip-manager-dialog .accordion-pending-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 8px;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 6px;
            background: rgba(0,161,214,0.06);
            border: 1px solid rgba(0,161,214,0.12);
            font-size: 13px;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .segment-time {
            background: rgba(0,161,214,0.12);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            color: #fff;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .pending-delete {
            margin-left: auto;
            cursor: pointer;
            color: #868686;
            font-size: 14px;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .pending-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }

        .skip-manager-dialog .accordion-inline-msg {
            font-size: 13px;
            border-radius: 6px;
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: all 0.2s;
        }

        .skip-manager-dialog .accordion-inline-msg.warn {
            color: #e6a23c;
            background: rgba(230,162,60,0.1);
            border: 1px solid rgba(230,162,60,0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .accordion-inline-msg.success {
            color: #67c23a;
            background: rgba(103,194,58,0.1);
            border: 1px solid rgba(103,194,58,0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        /* 暂存区样式 */
        .skip-manager-dialog .cached-section,
        .skip-manager-dialog .staging-section {
            margin-bottom: 8px;
        }

        .skip-manager-dialog .cached-section-header,
        .skip-manager-dialog .staging-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #868686;
            margin-bottom: 6px;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .skip-manager-dialog .cached-count,
        .skip-manager-dialog .staging-count {
            font-size: 11px;
            padding: 1px 6px;
            border-radius: 3px;
            background: rgba(255,255,255,0.06);
        }

        .skip-manager-dialog .staging-count {
            background: rgba(0,161,214,0.12);
            color: #00a1d6;
        }

        .skip-manager-dialog .cached-segment-list .segment-item.cached-item .segment-time {
            background: rgba(255,255,255,0.04);
            color: #999;
        }

        .skip-manager-dialog .staging-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .skip-manager-dialog .staging-item {
            display: flex;
            align-items: center;
            padding: 5px 10px;
            border-radius: 4px;
            background: rgba(0,161,214,0.06);
            border: 1px solid rgba(0,161,214,0.12);
            transition: all 0.15s;
        }

        .skip-manager-dialog .staging-item:hover {
            background: rgba(0,161,214,0.1);
        }

        .skip-manager-dialog .staging-item.editing {
            border-color: #00a1d6;
            background: rgba(0,161,214,0.12);
        }

        .skip-manager-dialog .staging-item .segment-time {
            font-size: 13px;
            background: rgba(0,161,214,0.12);
            padding: 2px 8px;
            border-radius: 3px;
        }

        .skip-manager-dialog .staging-actions {
            margin-left: auto;
            display: flex;
            gap: 4px;
        }

        .skip-manager-dialog .staging-edit,
        .skip-manager-dialog .staging-delete {
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            color: #868686;
            transition: all 0.15s;
        }

        .skip-manager-dialog .staging-edit:hover {
            color: #00a1d6;
            background: rgba(0,161,214,0.15);
        }

        .skip-manager-dialog .staging-delete:hover {
            color: #f56c6c;
            background: rgba(245,108,108,0.15);
        }

        .skip-manager-dialog .form-actions {
            display: flex;
            gap: 6px;
            align-items: flex-end;
        }
    `
}
