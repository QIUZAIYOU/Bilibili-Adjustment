import { theme } from '../theme'
import * as styleUtils from '../style-utils'
import { popoverStyles } from './popover'
import { videoPageStyles } from './video-page'
import { dynamicPageStyles } from './dynamic-page'
import { commonStyles } from './common'
import { homePageStyles } from './home-page'

export {
    theme,
    styleUtils,
    popoverStyles,
    videoPageStyles,
    dynamicPageStyles,
    commonStyles,
    homePageStyles
}

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

function generateBilibiliAdjustmentStyle() {
    return `
        /* ========== 滚动条 ========== */
        ::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
        }
        ::-webkit-scrollbar-track {
            background: transparent !important;
        }
        ::-webkit-scrollbar-thumb {
            border-radius: 4px !important;
            background-color: #333 !important;
            border: 2px solid transparent !important;
            background-clip: padding-box !important;
        }
        ::-webkit-scrollbar-thumb:hover {
            background-color: #444 !important;
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
            width: 560px;
            max-height: 88vh;
            border: none;
            border-radius: 16px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            overscroll-behavior: contain;
            background: #212121;
            overflow-y: auto;
            overflow-x: hidden;
            color: #f0f0f0;
            border: 1px solid #333;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(0, 0, 0, 0.5);
            animation: adjustment-popover-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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

        .adjustment-popover::backdrop {
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            background: rgba(0, 0, 0, 0.65);
            animation: adjustment-backdrop-in 0.2s ease;
        }

        @keyframes adjustment-backdrop-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* ========== 弹窗头部 ========== */
        .adjustment-popover-header {
            position: sticky;
            top: 0;
            z-index: 100;
            padding: 24px 28px 20px;
            background: #212121;
            border-bottom: 1px solid #333;
        }

        .adjustment-popover-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .adjustment-popover-version {
            font-size: 11px;
            color: #666;
            background: #2c2c2c;
            padding: 3px 10px;
            border-radius: 9999px;
            font-weight: 500;
            letter-spacing: 0.3px;
            border: 1px solid #333;
            flex-shrink: 0;
        }

        .adjustment-popover-title {
            font-weight: 700;
            font-size: 22px;
            color: #fff;
            letter-spacing: -0.3px;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .adjustment-popover-subtitle {
            font-size: 12px;
            margin-top: 6px;
            color: #888;
            font-weight: 400;
            line-height: 1.5;
        }

        /* ========== 推荐横幅 ========== */
        .adjustment-recommend {
            margin: 20px 28px;
            padding: 12px 16px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2c2c2c;
            font-size: 12px;
            color: #888;
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
            color: #00a1d6;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.15s ease;
            white-space: nowrap;
        }

        .adjustment-recommend a:hover {
            color: #00b8e6;
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
            color: #fff;
            padding: 0 0 10px 0;
            border-bottom: 2px solid #00a1d6;
            display: flex;
            align-items: center;
            gap: 10px;
            line-height: 1.3;
        }

        .adjustment-section-title::before {
            content: '';
            width: 4px;
            height: 18px;
            background: linear-gradient(180deg, #00a1d6 0%, #00b8e6 100%);
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
            background: #2c2c2c;
            border: 1px solid transparent;
            transition: all 0.15s ease;
        }

        .adjustment-setting-item:hover {
            border-color: #3a3a3a;
            background: #323232;
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
            color: #f0f0f0;
            font-weight: 500;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .adjustment-setting-desc {
            font-size: 12px;
            color: #888;
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
            background: #555;
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
            -webkit-tap-highlight-color: transparent;
        }

        .adjustment-switch:hover {
            background: #666;
        }

        .adjustment-switch.on {
            background: #00a1d6;
        }

        .adjustment-switch.on:hover {
            background: #00b8e6;
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
            background: #fff;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
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
            background: #212121;
            border-radius: 8px;
            border: 1px solid #333;
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
            border: 1px solid #333;
            border-radius: 8px;
            background: #212121;
            color: #f0f0f0;
            font-size: 14px;
            outline: none;
            transition: all 0.15s ease;
            height: 36px;
            line-height: 1;
        }

        .adjustment-input:focus {
            border-color: #00a1d6;
            box-shadow: 0 0 0 3px rgba(0, 161, 214, 0.15);
        }

        .adjustment-input::placeholder {
            color: #555;
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
            border: 1px solid #333;
            border-radius: 8px;
            background: #212121;
            color: #f0f0f0;
            font-size: 14px;
            outline: none;
            transition: all 0.15s ease;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            cursor: pointer;
        }

        .adjustment-select select:focus {
            border-color: #00a1d6;
            box-shadow: 0 0 0 3px rgba(0, 161, 214, 0.15);
        }

        .adjustment-select select option {
            background: #2c2c2c;
            color: #f0f0f0;
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
            border-top: 5px solid #666;
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
            background: #333;
        }

        .adjustment-radio-item input[type="radio"] {
            width: 18px;
            height: 18px;
            margin: 0;
            cursor: pointer;
            accent-color: #00a1d6;
            flex-shrink: 0;
        }

        .adjustment-radio-item span {
            color: #888;
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
            color: #00a1d6;
            transition: all 0.15s ease;
        }

        .adjustment-tips-icon:hover {
            color: #00b8e6;
            filter: drop-shadow(0 0 4px rgba(0, 161, 214, 0.5));
        }

        .adjustment-tips-icon svg {
            width: 100%;
            height: 100%;
        }

        /* ========== Tooltip ========== */
        .adjustment-tooltip {
            position: fixed;
            z-index: 999999;
            pointer-events: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 320px;
            padding: 10px 14px;
            border-radius: 8px;
            background: #1a1a1a;
            color: #e0e0e0;
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid #333;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .adjustment-tooltip a {
            color: #00a1d6;
            text-decoration: underline;
        }

        .adjustment-tooltip a:hover {
            color: #00b8e6;
        }

        /* 验证状态消息 */
        .validation-status-message {
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 10;
        }

        /* ========== 按钮组 ========== */
        .adjustment-buttonGroup {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px 28px;
            border-top: 1px solid #333;
            background: #212121;
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
            background: #00a1d6;
            color: #fff;
        }

        .adjustment-button.primary:hover {
            background: #00b8e6;
            box-shadow: 0 0 16px rgba(0, 161, 214, 0.3);
        }

        .adjustment-button.secondary {
            background: #2c2c2c;
            color: #f0f0f0;
            border-color: #333;
        }

        .adjustment-button.secondary:hover {
            background: #323232;
            border-color: #444;
        }

        /* ========== 更新弹窗专用样式 ========== */
        .adjustment-version {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
            padding: 12px 16px;
            background: #2c2c2c;
            border-radius: 8px;
            font-size: 13px;
            color: #888;
        }

        .adjustment-version div:first-child {
            color: #aaa;
        }

        .adjustment-version div:last-child {
            color: #00a1d6;
            font-weight: 500;
        }

        .adjustment-update-contents {
            margin: 0;
            padding: 4px 16px 4px 24px;
            color: #ccc;
            font-size: 13px;
            line-height: 1.8;
            max-height: 400px;
            overflow-y: auto;
        }

        .adjustment-update-contents li {
            margin-bottom: 6px;
            padding-left: 4px;
            word-break: break-word;
        }

        .adjustment-update-contents li::marker {
            color: #00a1d6;
        }

        .adjustment-button-group {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 16px;
            margin-top: 16px;
            border-top: 1px solid #333;
        }

        /* 更新弹窗标题特殊处理 */
        #UpdatePopover .adjustment-popover-title {
            font-size: 18px;
            text-align: center;
        }

        #UpdatePopover .adjustment-popover-subtitle {
            font-size: 12px;
            color: #888;
            margin-top: 4px;
        }
    `.replace(/\s+/g, ' ').trim()
}

export const generateAllStyles = () => {
    return {
        ...stylesV2,
        cssVariables: styleUtils.generateCssVariables()
    }
}
