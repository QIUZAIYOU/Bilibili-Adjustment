import { videoPageStyles } from './video-page'
import { dynamicPageStyles } from './dynamic-page'
import { commonStyles } from './common'
import { homePageStyles } from './home-page'
export const stylesV2 = {
    BilibiliAdjustment: generateBilibiliAdjustmentStyle(),
    VideoPageAdjustment: Object.values(videoPageStyles).join(''),
    DynamicSetting: Object.values(dynamicPageStyles).join(''),
    BodyOverflowHidden: commonStyles.bodyOverflowHidden,
    ResetPlayerLayout: commonStyles.resetPlayerLayout,
    UnlockWebPlayer: commonStyles.unlockWebPlayer,
    FreezeHeaderAndVideoTitle: commonStyles.freezeHeaderAndVideoTitle,
    videoCommentDescription: commonStyles.videoCommentDescription,
    videoSettingsOpenButton: commonStyles.videoSettingsOpenButton,
    IndexAdjustment: Object.values(homePageStyles).join(''),
    VideoSettings: videoPageStyles.popoverOverrides,
    UnlockEpisodeSelector: videoPageStyles.episodeSelector
}
function generateBilibiliAdjustmentStyle () {
    return `
        /* ========== 滚动条 ========== */
        /* 悬停加宽由 JS 驱动（scrollbar-hover.js）：目标元素打 data 属性后逐帧重写宽度规则（伪元素不支持自定义属性与 transition） */
        ::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
        }
        ::-webkit-scrollbar-track {
            background: transparent !important;
        }
        ::-webkit-scrollbar-thumb {
            border-radius: 4px !important;
            background-color: var(--adj-scrollbar-thumb) !important;
            border: 2px solid transparent !important;
            background-clip: padding-box !important;
        }
        ::-webkit-scrollbar-thumb:hover {
            background-color: var(--adj-scrollbar-thumb-hover) !important;
        }
        ::-webkit-scrollbar-corner {
            background: transparent !important;
        }

        /* ========== 弹窗容器 ========== */
        .adjustment-popover {
            position: fixed;
            inset: 0;
            margin: auto;
            box-sizing: border-box;
            padding: 0;
            width: 550px;
            max-height: 88vh;
            border: none;
            border-radius: 16px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            overscroll-behavior: contain;
            background: var(--adj-bg-page);
            overflow-y: auto;
            overflow-x: hidden;
            color: var(--adj-text-primary);
            border: 1px solid var(--adj-border);
            box-shadow: var(--adj-shadow-dialog);
            animation: adjustment-popover-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* 弹窗内不出现浏览器默认聚焦轮廓（深色底上呈白边）：
           脚本为建立焦点陷阱会主动 focus 弹窗容器（tabindex=-1），此时浏览器可能绘制
           默认 outline；统一去掉容器与内部可聚焦元素的 outline。
           脚本自绘的焦点样式（如自绘下拉的品牌色 ring、输入框的校验边框）不受影响。 */
        .adjustment-popover:focus,
        .adjustment-popover:focus-visible,
        .adjustment-popover *:focus,
        .adjustment-popover *:focus-visible,
        .adjustment-dialog:focus,
        .adjustment-dialog:focus-visible,
        .adjustment-dialog *:focus,
        .adjustment-dialog *:focus-visible {
            outline: none;
        }

        /* 浏览器自动填充会以内建 UA 样式覆盖输入框背景与文字色
           （input:-internal-autofill-selected { background-color: … !important }），
           与主题配色冲突。用 inset box-shadow 顶掉背景 + 超长 transition 延缓背景重绘，
           并显式设置文字填充色，使自动填充后的输入框仍遵循主题。 */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 1000px var(--adj-bg-surface) inset !important;
            box-shadow: 0 0 0 1000px var(--adj-bg-surface) inset !important;
            -webkit-text-fill-color: var(--adj-text-primary) !important;
            caret-color: var(--adj-text-primary);
            transition: background-color 9999s ease-in-out 0s !important;
        }

        /* popover 关闭态的隐藏依赖 UA 样式 [popover]:not(:popover-open) { display: none }，
        该规则无 !important，任何作者级 display 设置（例如弹窗元素上直接写 display: flex）
        都会覆盖它导致关闭后弹窗仍可见；必须以 !important 显式兜底，
        弹窗元素上切勿再直接设置 display，如确需 flex 布局应改用内部容器 */
        .adjustment-popover:not(:popover-open) {
            display: none !important;
        }

        @keyframes adjustment-popover-in {
            from {
                opacity: 0;
                transform: scale(0.96) translateY(10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        /* 禁用 UA 默认 backdrop（它天生不接收指针事件，导致穿透），改用真实 DOM 遮罩 */
        .adjustment-popover::backdrop {
            display: none;
        }

        /* 真实 DOM 遮罩：插入在弹窗同级前面，拦截所有指针事件 */
        .adjustment-popover-overlay {
            position: fixed;
            inset: 0;
            z-index: var(--adj-z-overlay);
            background: var(--adj-bg-scrim);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            pointer-events: auto;
            animation: adjustment-overlay-in 0.2s ease;
        }

        @keyframes adjustment-overlay-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .adjustment-popover {
            z-index: var(--adj-z-popover);
        }

        /* ========== 弹窗头部 ========== */
        .adjustment-popover-header {
            position: sticky;
            top: 0;
            z-index: var(--adj-z-header);
            padding: 24px 28px 20px;
            background: var(--adj-bg-page);
            border-bottom: 1px solid var(--adj-border);
        }

        .adjustment-popover-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .adjustment-popover-version-wrap {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            flex-shrink: 0;
        }

        .adjustment-popover-version {
            font-size: 11px;
            color: var(--adj-text-disabled);
            background: var(--adj-bg-surface);
            padding: 3px 10px;
            border-radius: 9999px;
            font-weight: 500;
            letter-spacing: 0.3px;
            border: 1px solid var(--adj-border);
            cursor: pointer;
            user-select: none;
        }

        .adjustment-popover-version:hover {
            color: var(--adj-text-soft);
            border-color: var(--adj-border-hover);
        }

        .adjustment-popover-version-status {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            white-space: nowrap;
            font-size: 11px;
            color: var(--adj-text-soft);
            line-height: 1.4;
            text-align: right;
            opacity: 1;
            transition: opacity 0.3s ease;
        }

        .adjustment-popover-version-status.hidden {
            opacity: 0;
            pointer-events: none;
        }

        .adjustment-popover-version-status.update {
            color: var(--adj-warning);
        }

        .adjustment-popover-version-status.error {
            color: var(--adj-danger);
        }

        .adjustment-popover-title {
            font-weight: 700;
            font-size: 22px;
            color: var(--adj-text-strong);
            letter-spacing: -0.3px;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .adjustment-popover-subtitle {
            font-size: 12px;
            margin-top: 6px;
            color: var(--adj-text-muted);
            font-weight: 400;
            line-height: 1.5;
        }

        /* ========== 推荐横幅 ========== */
        .adjustment-recommend {
            margin: 20px 28px;
            padding: 12px 16px;
            border: 1px solid var(--adj-border);
            border-radius: 8px;
            background: var(--adj-bg-surface);
            font-size: 12px;
            color: var(--adj-text-muted);
            display: flex;
            align-items: center;
            gap: 8px;
            line-height: 1.5;
        }

        .adjustment-recommend::before {
            content: '💡';
            font-size: 14px;
            flex-shrink: 0;
        }

        .adjustment-recommend a {
            color: var(--adj-brand);
            text-decoration: none;
            font-weight: 500;
            transition: all 0.15s ease;
            white-space: nowrap;
        }

        .adjustment-recommend a:hover {
            color: var(--adj-brand-hover);
            text-decoration: underline;
        }

        /* ========== 表单区域 ========== */
        .adjustment-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 0 28px 28px;
        }

        /* ========== 设置分组 ========== */
        .adjustment-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .adjustment-section-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--adj-text-strong);
            padding: 0 0 10px 0;
            border-bottom: 2px solid var(--adj-brand);
            display: flex;
            align-items: center;
            gap: 10px;
            line-height: 1.3;
        }

        .adjustment-section-title::before {
            content: '';
            width: 4px;
            height: 18px;
            background: linear-gradient(180deg, var(--adj-brand) 0%, var(--adj-brand-hover) 100%);
            border-radius: 2px;
            flex-shrink: 0;
        }

        .adjustment-section-content {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        /* 紧凑网格布局：用于日志配置等一行多个开关 */
        .adjustment-section-content.compact-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
        }

        .adjustment-section-content.compact-grid .adjustment-setting-item.inline-checkbox {
            padding: 20px 12px;
        }

        /* ========== 设置项包装器 ========== */
        .adjustment-setting-item-wrapper {
            width: 100%;
            display: block;
        }

        /* ========== 设置项卡片 ========== */
        .adjustment-setting-item {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px 20px;
            border-radius: 10px;
            background: var(--adj-bg-surface);
            border: 1px solid transparent;
            transition: all 0.15s ease;
        }

        .adjustment-setting-item:hover {
            border-color: var(--adj-border-hover);
            background: var(--adj-bg-surface-hover);
        }

        /* 设置项主体：标签+控制 横向排列 */
        .adjustment-setting-main {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            min-height: 32px;
        }

        /* 设置项信息区 */
        .adjustment-setting-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .adjustment-setting-label {
            display: flex;
            align-items: center;
            font-size: 14px;
            color: var(--adj-text-primary);
            font-weight: 500;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .adjustment-setting-desc {
            font-size: 12px;
            color: var(--adj-text-muted);
            line-height: 1.5;
        }

        /* 设置项控制区 */
        .adjustment-setting-control {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        /* ========== 开关组件 ========== */
        .adjustment-switch {
            position: relative;
            width: 48px;
            height: 26px;
            border-radius: 13px;
            background: var(--adj-switch-track);
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
            -webkit-tap-highlight-color: transparent;
        }

        .adjustment-switch:hover {
            background: var(--adj-switch-track-hover);
        }

        .adjustment-switch.on {
            background: var(--adj-brand);
        }

        .adjustment-switch.on:hover {
            background: var(--adj-brand-hover);
        }

        .adjustment-switch input {
            position: absolute;
            opacity: 0;
            width: 100%;
            height: 100%;
            cursor: pointer;
            z-index: 2;
            margin: 0;
        }

        .adjustment-switch-knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--adj-on-brand);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: var(--adj-shadow-sm);
            pointer-events: none;
        }

        .adjustment-switch.on .adjustment-switch-knob {
            left: 24px;
        }

        /* ========== 子设置项容器 ========== */
        .adjustment-setting-children {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: var(--adj-bg-page);
            border-radius: 8px;
            border: 1px solid var(--adj-border);
            overflow-x: auto;
        }

        .adjustment-setting-children .adjustment-setting-item {
            flex: 1 1 auto;
            min-width: 140px;
            padding: 12px 16px;
            margin: 0;
        }

        /* ========== 紧凑开关项（用于日志等） ========== */
        .adjustment-setting-item.inline-checkbox {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 16px;
            min-height: auto;
        }

        .adjustment-setting-item.inline-checkbox .adjustment-setting-label {
            font-size: 13px;
        }

        /* ========== 输入框 ========== */
        .adjustment-input {
            flex: 1;
            min-width: 0;
            box-sizing: border-box;
            padding: 8px 12px;
            border: 1px solid var(--adj-border);
            border-radius: 8px;
            background: var(--adj-bg-page);
            color: var(--adj-text-primary);
            font-size: 14px;
            outline: none;
            transition: all 0.15s ease;
            height: 36px;
            line-height: 1;
        }

        .adjustment-input:focus {
            border-color: var(--adj-brand);
            box-shadow: var(--adj-shadow-ring);
        }

        .adjustment-input::placeholder {
            color: var(--adj-text-faint);
        }

        /* ========== 下拉选择框 ========== */
        .adjustment-select {
            position: relative;
            flex: 1;
        }

        .adjustment-select select {
            width: 100%;
            height: 36px;
            padding: 0 32px 0 12px;
            border: 1px solid var(--adj-border);
            border-radius: 8px;
            background: var(--adj-bg-page);
            color: var(--adj-text-primary);
            font-size: 14px;
            outline: none;
            transition: all 0.15s ease;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            cursor: pointer;
        }

        .adjustment-select select:focus {
            border-color: var(--adj-brand);
            box-shadow: var(--adj-shadow-ring);
        }

        .adjustment-select select option {
            background: var(--adj-bg-surface);
            color: var(--adj-text-primary);
            padding: 8px;
        }

        .adjustment-select::after {
            content: '';
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid var(--adj-text-disabled);
            pointer-events: none;
        }

        /* ========== 单选按钮组 ========== */
        .adjustment-radio-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }

        .adjustment-radio-item {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 6px;
            transition: all 0.15s ease;
            white-space: nowrap;
        }

        .adjustment-radio-item:hover {
            background: var(--adj-bg-surface-hover);
        }

        .adjustment-radio-item input[type="radio"] {
            width: 18px;
            height: 18px;
            margin: 0;
            cursor: pointer;
            accent-color: var(--adj-brand);
            flex-shrink: 0;
        }

        .adjustment-radio-item span {
            color: var(--adj-text-muted);
            font-size: 14px;
        }

        /* ========== 提示图标 ========== */
        .adjustment-tips-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            cursor: help;
            margin-left: 6px;
            vertical-align: middle;
            flex-shrink: 0;
            color: var(--adj-brand);
            transition: all 0.15s ease;
        }

        .adjustment-tips-icon:hover {
            color: var(--adj-brand-hover);
            filter: drop-shadow(0 0 4px rgba(var(--adj-brand-rgb), 0.5));
        }

        .adjustment-tips-icon svg {
            width: 100%;
            height: 100%;
        }

        /* ========== Tooltip ========== */
        .adjustment-tooltip {
            position: fixed;
            z-index: var(--adj-z-tooltip);
            pointer-events: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 320px;
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--adj-bg-tooltip);
            color: var(--adj-text-secondary);
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid var(--adj-border);
            box-shadow: var(--adj-shadow-float);
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .adjustment-tooltip a {
            color: var(--adj-brand);
            text-decoration: underline;
        }

        .adjustment-tooltip a:hover {
            color: var(--adj-brand-hover);
        }

        /* ========== 按钮组 ========== */
        .adjustment-buttonGroup {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px 28px;
            border-top: 1px solid var(--adj-border);
            background: var(--adj-bg-page);
            position: sticky;
            bottom: 0;
        }

        /* ========== 按钮 ========== */
        .adjustment-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            margin: 0;
            padding: 8px 16px;
            outline: none;
            border: 1px solid transparent;
            border-radius: 8px;
            text-align: center;
            white-space: nowrap;
            font-weight: 500;
            font-size: 14px;
            line-height: 1;
            cursor: pointer;
            transition: all 0.15s ease;
            height: 36px;
            -webkit-appearance: none;
            user-select: none;
        }

        .adjustment-button:active {
            transform: scale(0.97);
        }

        .adjustment-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .adjustment-button.primary {
            background: var(--adj-brand);
            color: var(--adj-on-brand);
        }

        .adjustment-button.primary:hover {
            background: var(--adj-brand-hover);
            box-shadow: var(--adj-shadow-glow);
        }

        .adjustment-button.secondary {
            background: var(--adj-bg-surface);
            color: var(--adj-text-primary);
            border-color: var(--adj-border);
        }

        .adjustment-button.secondary:hover {
            background: var(--adj-bg-surface-hover);
            border-color: var(--adj-border-hover);
        }

        .adjustment-button.danger {
            background: rgba(var(--adj-danger-rgb), 0.15);
            border: 1px solid rgba(var(--adj-danger-rgb), 0.3);
            color: var(--adj-danger);
        }

        .adjustment-button.danger:hover {
            background: rgba(var(--adj-danger-rgb), 0.25);
        }

        /* 更新说明内容（update 弹窗组件作用域）：版本徽章 + 内容卡片 */
        .update-dialog .adjustment-update-contents {
            list-style: none;
            margin: 14px 0 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 46vh;
            overflow-y: auto;
        }

        .update-dialog .adjustment-update-item {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid var(--adj-border-strong);
            border-radius: 10px;
            background: var(--adj-bg-surface);
        }

        .update-dialog .adjustment-update-item.is-latest {
            border-color: rgba(var(--adj-brand-rgb), 0.5);
            background: rgba(var(--adj-brand-rgb), 0.08);
        }

        .update-dialog .adj-update-ver {
            flex-shrink: 0;
            font-family: monospace;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.7;
            padding: 5px 6px;
            margin-right: 5px;
            border-radius: 6px;
            background: rgba(var(--adj-brand-rgb), 0.15);
            color: var(--adj-brand);
        }

        .update-dialog .adjustment-update-item.is-latest .adj-update-ver {
            background: var(--adj-brand);
            color: var(--adj-on-brand);
        }

        .update-dialog .adj-update-desc {
            flex: 1;
            min-width: 0;
            font-size: 13px;
            line-height: 1.7;
            color: var(--adj-text-secondary);
            word-break: break-word;
        }

        /* ========== 自定义确认弹窗 ========== */
        .adjustment-confirm-overlay {
            position: fixed;
            inset: 0;
            z-index: var(--adj-z-overlay);
            background: var(--adj-bg-scrim);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.15s ease;
        }

        /* 以原生 popover（top layer）承载时，覆盖 UA 默认的 fit-content 居中为全屏遮罩 */
        .adjustment-confirm-overlay[popover] {
            width: 100vw;
            height: 100vh;
            margin: 0;
            padding: 0;
            border: none;
            border-radius: 0;
            overflow: auto;
        }

        .adjustment-confirm-overlay[popover]::backdrop {
            background: transparent;
        }

        .adjustment-confirm-dialog {
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            border-radius: 12px;
            padding: 24px;
            min-width: 300px;
            max-width: 400px;
            box-shadow: var(--adj-shadow-float);
        }

        .adjustment-confirm-msg {
            color: var(--adj-text-secondary);
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 20px;
        }

        .adjustment-confirm-btns {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .adjustment-confirm-btns .adjustment-button {
            min-width: 72px;
        }

        .adjustment-confirm-dialog.overwrite-select {
            width: min(480px, 82vw);
            max-width: 480px;
        }

        .adjustment-confirm-msg b {
            color: var(--adj-brand);
            font-size: 15px;
        }

        .ow-hint {
            color: var(--adj-text-soft);
            font-size: 12px;
            margin-top: 6px;
            line-height: 1.7;
        }

        .ow-list {
            max-height: 240px;
            overflow-y: auto;
            margin: 12px 0 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ow-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 6px;
            background: var(--adj-bg-hover);
            border: 1px solid var(--adj-border-subtle);
            cursor: pointer;
            font-size: 13px;
            color: var(--adj-text-secondary);
        }

        .ow-item:hover {
            background: var(--adj-bg-hover);
        }

        .ow-item input {
            accent-color: var(--adj-brand);
            flex-shrink: 0;
            cursor: pointer;
        }

        .ow-time {
            font-family: monospace;
            font-size: 12px;
            background: var(--adj-bg-hover);
            padding: 2px 8px;
            border-radius: 4px;
            color: var(--adj-text-strong);
            flex-shrink: 0;
        }

        .ow-summary {
            color: var(--adj-text-soft);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `.replace(/\s+/g, ' ').trim()
}
