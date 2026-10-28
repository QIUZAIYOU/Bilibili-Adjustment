export const videoPageStyles = {
    /**
     * UP 主空间弹窗：里面的空间页是**跨源** iframe，它自己的样式得靠 iframe 内的脚本注入
     * （见 main.ts 的 UP_SPACE_POPUP_FLAG 分支）；父页面这侧只负责给内容区一个定位上下文，
     * 好让加载骨架屏（.adj-loading-overlay）能盖在 iframe 上。
     */
    upSpaceDialog: `
        .up-space-dialog .adjustment-dialog-body {
            position: relative;
            /* 空间页自带内边距，这里再去掉弹窗的内边距，让它铺满弹窗宽度（否则右侧会被裁掉一截） */
            padding: 0;
        }
    `,
    /**
     * 侧栏「UP主空间」按钮：改成**作者圆形头像**（2026-10-24）
     *
     * - 尺寸：运行时量出**当前那颗按钮**的实际宽度写进 `--adj-up-avatar-size`
     *   （B 站的盒子尺寸可能变，写死数值会跑偏）；量完之后才加 `adj-sidenav-up-avatar-ready`
     *   把盒子固定成正方形并清掉内边距 → 头像与按钮等宽。
     * - 悬浮提示（作者昵称）是**绝对定位**的：既不撑大按钮的盒子，也让它往左展开（侧栏贴着页面右边缘）。
     *
     * ⚠️ 特异性必须压过 B 站的侧栏样式：
     *   B 站写的是 `.fixed-sidenav-storage .fixed-sidenav-storage-item[data-v-6203194a]`（0,3,0）
     *   —— 圆角 8px、内边距 6px、白底、1px 边框都是它给的。我们要的是**圆形**头像，
     *   故规则里带上同样的祖先链并多加一层类（0,4,0）才压得住；
     *   只写 `.adj-sidenav-up-avatar.adj-sidenav-up-avatar-ready`（0,2,0）会被它反超
     *   （2026-10-24 实测：圆角退回 8px、头像图被内边距挤成 26px）。
     */
    sideNavUpAvatar: `
        .adj-sidenav-up-avatar {
            position: relative;
            cursor: pointer;
            transition: var(--adj-motion-fast);
        }
        .fixed-sidenav-storage .fixed-sidenav-storage-item.adj-sidenav-up-avatar.adj-sidenav-up-avatar-ready {
            box-sizing: border-box;
            width: var(--adj-up-avatar-size, 50px);
            height: var(--adj-up-avatar-size, 50px);
            padding: 0;
            border: 1px solid var(--adj-border-strong);
            border-radius: 50%;
            background: var(--adj-bg-surface);
            color: var(--adj-text-soft);
            overflow: visible;
        }
        .fixed-sidenav-storage .fixed-sidenav-storage-item.adj-sidenav-up-avatar.adj-sidenav-up-avatar-ready:hover {
            border-color: var(--adj-brand);
            box-shadow: var(--adj-shadow-float);
        }
        .adj-sidenav-up-avatar-img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
        /* hidden 属性必须显式兜住：上面的 display:block 会盖掉 UA 的 [hidden]{display:none} */
        .adj-sidenav-up-avatar-img[hidden] {
            display: none;
        }
        /* 没有头像时显示默认人形图标（有头像就把它藏掉） */
        .adj-sidenav-up-avatar-fallback {
            display: block;
            width: 55%;
            height: 55%;
            margin: auto;
        }
        .adj-sidenav-up-avatar-has-image .adj-sidenav-up-avatar-fallback {
            display: none;
        }
        /* 悬浮提示（作者昵称）：往左展开（侧栏在页面右边缘），绝对定位不撑大按钮 */
        .adj-sidenav-up-avatar-tip {
            position: absolute;
            top: 50%;
            right: calc(100% + 8px);
            z-index: var(--adj-z-tooltip);
            padding: 6px 10px;
            border: 1px solid var(--adj-border);
            border-radius: var(--adj-radius-xs);
            background: var(--adj-bg-tooltip);
            color: var(--adj-text-secondary);
            box-shadow: var(--adj-shadow-float);
            font-size: var(--adj-font-sm);
            line-height: 1.4;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-50%) translateX(4px);
            transition: var(--adj-motion-fast);
            pointer-events: none;
        }
        .adj-sidenav-up-avatar:hover .adj-sidenav-up-avatar-tip {
            opacity: 1;
            visibility: visible;
            transform: translateY(-50%) translateX(0);
        }
    `,
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
            padding: 0 var(--adj-space-xs);
            height: 22px;
            border: 1px solid;
            border-radius: var(--adj-radius-sm);
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
            gap: var(--adj-space-lg);
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

        .adjustment-popover-back {
            cursor: pointer;
            font-size: 22px;
            color: var(--adj-text-muted);
            line-height: 1;
            padding: 4px 8px;
            border-radius: 6px;
            user-select: none;
            margin-right: 8px;
            font-weight: 300;
        }

        .adjustment-popover-back:hover {
            color: var(--adj-text-strong);
            background: var(--adj-bg-surface-hover);
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
            color: var(--adj-text-soft);
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
            border: 1px solid var(--adj-border-strong);
            border-radius: 8px;
            background: var(--adj-bg-surface);
            color: var(--adj-text-secondary);
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
            color: var(--adj-text-disabled);
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
            color: var(--adj-text-muted);
        }

        .skip-manager-dialog .empty-result { padding: 24px; }
        .skip-manager-dialog .error { color: var(--adj-danger); }
        .skip-manager-dialog .success { color: var(--adj-success); }

        .skip-manager-dialog .cache-info {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px 12px;
            padding: 8px 12px;
            margin-bottom: 12px;
            background: rgba(var(--adj-brand-rgb), 0.08);
            border-radius: 8px;
            border: 1px solid rgba(var(--adj-brand-rgb), 0.15);
        }

        /* 缓存信息压成一行：UID · 更新于 … · vX.Y.Z（原先每项各占一行，占位过大） */
        .skip-manager-dialog .cache-meta-line {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 12px;
            line-height: 1.5;
            color: var(--adj-text-muted);
        }

        .skip-manager-dialog .cache-dot {
            opacity: 0.5;
        }

        .skip-manager-dialog .cache-lock-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0;
        }

        .skip-manager-dialog .segment-count {
            margin: 16px 0;
            color: var(--adj-text-strong);
            font-size: 15px;
        }

        .skip-manager-dialog .segment-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            /* 与上方计数行、下方按钮组留出呼吸间隔 */
            margin: 10px 0 16px;
        }

        .skip-manager-dialog .segment-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 8px;
            background: var(--adj-bg-hover);
            border: 1px solid var(--adj-border-subtle);
            transition: background 0.2s;
        }

        .skip-manager-dialog .segment-item:hover {
            background: var(--adj-bg-hover);
        }

        /* 正在编辑的片段：品牌色描边 + 轻微品牌色底（不使用左侧色条），
           下圆角去掉以便与下方的行内编辑卡片拼成一体 */
        .skip-manager-dialog .segment-item.editing {
            border-color: var(--adj-brand);
            border-radius: 8px 8px 0 0;
            background: rgba(var(--adj-brand-rgb), 0.06);
        }

        /* 行内编辑卡片：负 margin 抵消 .segment-list 的 10px 间距，与所属片段无缝拼接 */
        .skip-manager-dialog .segment-edit-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: -10px;
            padding: 12px 14px;
            border: 1px solid var(--adj-brand);
            border-top: none;
            border-radius: 0 0 8px 8px;
            background: var(--adj-bg-surface);
        }

        .skip-manager-dialog .segment-edit-card .edit-card-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .skip-manager-dialog .segment-edit-card .edit-card-title {
            font-size: 12px;
            font-weight: 500;
            color: var(--adj-brand);
        }

        .skip-manager-dialog .segment-index {
            color: var(--adj-brand);
            font-weight: 600;
            font-size: 14px;
            min-width: 20px;
        }

        .skip-manager-dialog .segment-time {
            color: var(--adj-text-strong);
            font-family: monospace;
            font-size: 14px;
            background: rgba(var(--adj-brand-rgb), 0.15);
            padding: 4px 10px;
            border-radius: 4px;
            flex-shrink: 0;
        }

        .skip-manager-dialog .segment-summary {
            flex: 1;
            min-width: 0;
            color: var(--adj-text-soft);
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
            color: var(--adj-text-muted);
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
            color: var(--adj-danger);
            background: rgba(var(--adj-danger-rgb), 0.15);
        }

        /* 「新增片段」容器：与片段行内编辑卡片同款视觉（描边卡片 + 圆角），与「编辑片段」在视觉上区分 */
        .skip-manager-dialog .manual-entry-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 4px;
            padding: 12px 14px 14px;
            border: 1px solid var(--adj-border-strong);
            border-radius: 10px;
            background: var(--adj-bg-surface);
        }

        .skip-manager-dialog .manual-entry-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .skip-manager-dialog .manual-entry-title {
            font-size: 12px;
            font-weight: 500;
            color: var(--adj-text-strong);
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
            color: var(--adj-warning);
            background: rgba(var(--adj-warning-rgb), 0.1);
            border: 1px solid rgba(var(--adj-warning-rgb), 0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .inline-msg.success {
            color: var(--adj-success);
            background: rgba(var(--adj-success-rgb), 0.1);
            border: 1px solid rgba(var(--adj-success-rgb), 0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .manual-entry-form {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            /* 允许换行：备注（.summary-field）独占一行，避免与时间输入挤在同一行 */
            flex-wrap: wrap;
        }

        /* 备注输入：强制独占一行 */
        .skip-manager-dialog .manual-entry-form .summary-field {
            flex-basis: 100%;
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
            color: var(--adj-text-muted);
        }

        .skip-manager-dialog .time-input {
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            border-radius: 6px;
            color: var(--adj-text-strong);
            padding: 8px 10px;
            font-size: 14px;
            font-family: monospace;
            width: 100%;
            box-sizing: border-box;
        }

        .skip-manager-dialog .time-input:focus {
            border-color: var(--adj-brand);
            outline: none;
        }

        .skip-manager-dialog .time-separator {
            color: var(--adj-text-muted);
            font-size: 14px;
            padding-bottom: 8px;
        }

        .skip-manager-dialog .manual-add-btn {
            padding: 8px 16px;
            white-space: nowrap;
            flex-shrink: 0;
        }

                /* 待提交结果独立区块：标题 + 列表 + 操作按钮成组展示，
           与「手动添加」容器分离，避免手动区收起时看不到识别结果 */
        .skip-manager-dialog .pending-block {
            margin-top: 10px;
            padding: 10px 12px;
            border: 1px solid var(--adj-border-strong);
            border-radius: 8px;
            background: var(--adj-bg-surface);
        }
        .skip-manager-dialog .pending-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .skip-manager-dialog .pending-title { font-weight: 600; }
        .skip-manager-dialog .pending-count { color: var(--adj-text-secondary); font-size: 12px; }
        .skip-manager-dialog .pending-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
            flex-wrap: wrap;
            /* 按钮靠右排列，与上方的结果列表左对齐形成层次 */
            justify-content: flex-end;
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
            background: rgba(var(--adj-brand-rgb), 0.06);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.12);
            font-size: 13px;
        }

        .skip-manager-dialog .pending-item .segment-time {
            background: rgba(var(--adj-brand-rgb), 0.12);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            color: var(--adj-text-strong);
        }

        .skip-manager-dialog .pending-item .pending-delete {
            margin-left: auto;
            cursor: pointer;
            color: var(--adj-text-muted);
            font-size: 14px;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .skip-manager-dialog .pending-item .pending-delete:hover {
            color: var(--adj-danger);
            background: rgba(var(--adj-danger-rgb), 0.15);
        }

        .skip-manager-dialog .input-mode-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
        }

        .skip-manager-dialog .input-mode-btn,
        .skip-manager-dialog .accordion-manual-entry .input-mode-btn {
            background: rgba(var(--adj-brand-rgb), 0.15);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.3);
            border-radius: 6px;
            color: var(--adj-brand);
            padding: 4px 10px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            height: 34px;
            box-sizing: border-box;
        }

        .skip-manager-dialog .input-mode-btn:hover,
        .skip-manager-dialog .accordion-manual-entry .input-mode-btn:hover {
            background: rgba(var(--adj-brand-rgb), 0.25);
        }

        .skip-manager-dialog .adjustment-button.danger {
            background: rgba(var(--adj-danger-rgb), 0.15);
            border: 1px solid rgba(var(--adj-danger-rgb), 0.3);
            color: var(--adj-danger);
        }

        .skip-manager-dialog .adjustment-button.danger:hover {
            background: rgba(var(--adj-danger-rgb), 0.25);
        }

        .skip-manager-dialog .adjustment-button.info {
            background: rgba(var(--adj-brand-rgb), 0.15);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.3);
            color: var(--adj-brand);
        }

        .skip-manager-dialog .adjustment-button.info:hover {
            background: rgba(var(--adj-brand-rgb), 0.25);
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
            border: 1px solid var(--adj-border-subtle);
            border-radius: 8px;
            margin-bottom: 6px;
        }

        .skip-manager-dialog .episode-accordion-item:has(.episode-accordion-body.expanded) {
            border-color: rgba(var(--adj-brand-rgb), 0.3);
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
            background: var(--adj-bg-hover);
        }

        .skip-manager-dialog .episode-accordion-header.active {
            background: rgba(var(--adj-brand-rgb), 0.12);
            border-color: rgba(var(--adj-brand-rgb), 0.4);
        }

        .skip-manager-dialog .episode-accordion-header .episode-index {
            color: var(--adj-brand);
            font-weight: 600;
            font-size: 14px;
            min-width: 24px;
        }

        .skip-manager-dialog .episode-accordion-header .episode-title {
            color: var(--adj-text-secondary);
            font-size: 13px;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .skip-manager-dialog .episode-accordion-header.active .episode-title {
            color: var(--adj-text-strong);
            font-weight: 500;
        }

        .skip-manager-dialog .episode-accordion-header .episode-segment-preview {
            color: var(--adj-text-muted);
            font-size: 12px;
            font-family: monospace;
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .skip-manager-dialog .episode-accordion-header .episode-segment-preview.has-segments {
            color: var(--adj-brand);
        }

        .skip-manager-dialog .episode-accordion-header .accordion-arrow {
            color: var(--adj-text-muted);
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
            background: var(--adj-bg-dim);
            border-radius: 0 0 8px 8px;
            border-top: 1px solid transparent;
        }

        .skip-manager-dialog .episode-accordion-body.expanded {
            border-top-color: rgba(var(--adj-brand-rgb), 0.2);
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
            background: var(--adj-bg-hover);
            border: 1px solid var(--adj-border-subtle);
        }

        .skip-manager-dialog .episode-accordion-body .segment-time {
            color: var(--adj-text-strong);
            font-family: monospace;
            font-size: 12px;
            background: rgba(var(--adj-brand-rgb), 0.12);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .skip-manager-dialog .episode-accordion-body .empty-result {
            color: var(--adj-text-disabled);
            font-size: 13px;
            padding: 12px 0;
        }

        .skip-manager-dialog .episode-accordion-body .accordion-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--adj-border-subtle);
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
            border-top: 1px solid var(--adj-border-subtle);
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
            color: var(--adj-text-muted);
        }

        .skip-manager-dialog .accordion-manual-entry .time-input {
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            border-radius: 6px;
            color: var(--adj-text-strong);
            padding: 8px 10px;
            font-size: 14px;
            font-family: monospace;
            width: 100%;
            box-sizing: border-box;
        }

        .skip-manager-dialog .accordion-manual-entry .time-input:focus {
            border-color: var(--adj-brand);
            outline: none;
        }

        .skip-manager-dialog .accordion-manual-entry .time-separator {
            color: var(--adj-text-muted);
            font-size: 14px;
            padding-bottom: 8px;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-add-btn {
            padding: 8px 14px;
            white-space: nowrap;
            flex-shrink: 0;
            font-size: 12px;
            background: var(--adj-brand);
            color: var(--adj-on-brand);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.4);
            border-radius: 6px;
            cursor: pointer;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-add-btn:hover {
            background: var(--adj-brand-hover);
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-cancel-edit-btn {
            padding: 8px 14px;
            white-space: nowrap;
            flex-shrink: 0;
            font-size: 12px;
            background: var(--adj-bg-surface);
            color: var(--adj-text-secondary);
            border: 1px solid var(--adj-border-strong);
            border-radius: 6px;
            cursor: pointer;
        }

        .skip-manager-dialog .accordion-manual-entry .accordion-cancel-edit-btn:hover {
            background: var(--adj-bg-surface-hover);
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
            background: rgba(var(--adj-brand-rgb), 0.06);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.12);
            font-size: 13px;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .segment-time {
            background: rgba(var(--adj-brand-rgb), 0.12);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            color: var(--adj-text-strong);
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .pending-delete {
            margin-left: auto;
            cursor: pointer;
            color: var(--adj-text-muted);
            font-size: 14px;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .skip-manager-dialog .accordion-pending-list .pending-item .pending-delete:hover {
            color: var(--adj-danger);
            background: rgba(var(--adj-danger-rgb), 0.15);
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
            color: var(--adj-warning);
            background: rgba(var(--adj-warning-rgb), 0.1);
            border: 1px solid rgba(var(--adj-warning-rgb), 0.2);
            padding: 8px 12px;
            max-height: 60px;
        }

        .skip-manager-dialog .accordion-inline-msg.success {
            color: var(--adj-success);
            background: rgba(var(--adj-success-rgb), 0.1);
            border: 1px solid rgba(var(--adj-success-rgb), 0.2);
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
            color: var(--adj-text-muted);
            /* 与下方片段卡片留出呼吸空间，避免标题的下边框看起来紧贴卡片 */
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--adj-border-subtle);
        }

        .skip-manager-dialog .cached-count,
        .skip-manager-dialog .staging-count {
            font-size: 11px;
            padding: 1px 6px;
            border-radius: 3px;
            background: var(--adj-bg-hover);
        }

        .skip-manager-dialog .staging-count {
            background: rgba(var(--adj-brand-rgb), 0.12);
            color: var(--adj-brand);
        }

        .skip-manager-dialog .cached-segment-list .segment-item.cached-item .segment-time {
            background: var(--adj-bg-hover);
            color: var(--adj-text-soft);
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
            background: rgba(var(--adj-brand-rgb), 0.06);
            border: 1px solid rgba(var(--adj-brand-rgb), 0.12);
            transition: all 0.15s;
        }

        .skip-manager-dialog .staging-item:hover {
            background: rgba(var(--adj-brand-rgb), 0.1);
        }

        .skip-manager-dialog .staging-item.editing {
            border-color: var(--adj-brand);
            background: rgba(var(--adj-brand-rgb), 0.12);
        }

        .skip-manager-dialog .staging-item .segment-time {
            font-size: 13px;
            background: rgba(var(--adj-brand-rgb), 0.12);
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
            color: var(--adj-text-muted);
            transition: all 0.15s;
        }

        .skip-manager-dialog .staging-edit:hover {
            color: var(--adj-brand);
            background: rgba(var(--adj-brand-rgb), 0.15);
        }

        .skip-manager-dialog .staging-delete:hover {
            color: var(--adj-danger);
            background: rgba(var(--adj-danger-rgb), 0.15);
        }

        .skip-manager-dialog .form-actions {
            display: flex;
            gap: 6px;
            align-items: flex-end;
        }
    `,
    /**
     * 「鱼塘」弹窗（被识别出来的大肥鱼评论列表）
     *
     * 列表行是**DOM API 拼出来**的（昵称/评论正文是用户可写文本，绝不能进 innerHTML）。
     */
    fishPond: `
        .adj-fish-pond {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 120px;
        }

        .adj-fish-pond-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--adj-border-strong);
        }

        .adj-fish-pond-count {
            font-size: 13px;
            color: var(--adj-text-muted);
        }

        .adj-fish-pond-rescan {
            flex: none;
            padding: 4px 10px;
            font-size: 12px;
            color: var(--adj-text-soft);
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .adj-fish-pond-rescan:hover {
            color: var(--adj-brand);
            border-color: var(--adj-brand);
        }

        .adj-fish-pond-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: min(58vh, 520px);
            overflow-y: auto;
            padding-right: 4px;
        }

        .adj-fish-pond-row {
            display: flex;
            gap: 10px;
            padding: 8px 10px;
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            border-radius: 6px;
        }

        .adj-fish-pond-avatar {
            flex: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            background: var(--adj-bg-page);
        }

        .adj-fish-pond-main {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            flex: 1;
        }

        .adj-fish-pond-head {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .adj-fish-pond-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--adj-text-primary);
            text-decoration: none;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .adj-fish-pond-name:hover {
            color: var(--adj-brand);
        }

        .adj-fish-pond-score {
            flex: none;
            padding: 1px 6px;
            font-size: 11px;
            color: var(--adj-brand);
            background: rgba(var(--adj-brand-rgb), 0.15);
            border-radius: 3px;
            cursor: pointer;
            user-select: none;
        }

        .adj-fish-pond-score:hover,
        .adj-fish-pond-score[aria-expanded="true"] {
            background: rgba(var(--adj-brand-rgb), 0.28);
        }

        .adj-fish-pond-score:focus-visible {
            outline: 2px solid var(--adj-brand);
            outline-offset: 1px;
        }

        .adj-fish-pond-text {
            font-size: 12px;
            line-height: 1.5;
            color: var(--adj-text-soft);
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .adj-fish-pond-meta {
            font-size: 11px;
            color: var(--adj-text-muted);
        }

        /* 分数构成面板：点分数徽章在该行下面就地展开（弹窗是 popover，浮层会被顶层盖住） */
        .adj-fish-pond-tip {
            margin: 6px 0 10px;
            padding: 8px 10px;
            border-radius: 6px;
            background: var(--adj-bg-page);
            border: 1px solid var(--adj-border-strong);
            font-size: 12px;
            line-height: 1.6;
            color: var(--adj-text-secondary);
        }

        .adj-fish-pond-tip-head {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 10px;
            padding-bottom: 6px;
            margin-bottom: 6px;
            border-bottom: 1px solid var(--adj-border-strong);
        }

        .adj-fish-pond-tip-title {
            font-weight: 600;
            color: var(--adj-text-primary);
        }

        .adj-fish-pond-tip-score {
            color: var(--adj-brand);
            font-variant-numeric: tabular-nums;
        }

        .adj-fish-pond-tip-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .adj-fish-pond-tip-row {
            display: grid;
            grid-template-columns: auto 1fr;
            align-items: baseline;
            column-gap: 8px;
        }

        .adj-fish-pond-tip-weight {
            min-width: 34px;
            padding: 0 4px;
            border-radius: 3px;
            text-align: center;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
            color: var(--adj-brand);
            background: rgba(var(--adj-brand-rgb), 0.15);
        }

        .adj-fish-pond-tip-why {
            color: var(--adj-text-soft);
        }

        .adj-fish-pond-tip-hit {
            grid-column: 2;
            font-size: 11px;
            color: var(--adj-text-muted);
            overflow-wrap: anywhere;
        }

        .adj-fish-pond-tip-foot {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid var(--adj-border-strong);
            font-size: 11px;
            color: var(--adj-text-muted);
        }
        .adj-fish-pond-empty {
            padding: 24px 0;
            text-align: center;
            font-size: 13px;
            color: var(--adj-text-muted);
        }
    `
}
/** videoStyles */
export const videoStyles = {
    VideoPageAdjustment: Object.values(videoPageStyles).join(''),
    VideoSettings: videoPageStyles.popoverOverrides,
    UnlockEpisodeSelector: videoPageStyles.episodeSelector
}
