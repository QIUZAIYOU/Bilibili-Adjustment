import { theme } from '../theme'

export const homePageStyles = {
    indexAdjustment: `
        #indexRecommendVideoHistoryOpenButton {
            margin-top: 10px;
        }
        .adjustment-history-popover-wrapper {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.6);
        }
        .adjustment-history-popover {
            width: 520px;
            border: 1px solid ${theme.colors.border};
            outline: 0;
            background: ${theme.colors.backgroundLight};
            border-radius: ${theme.borderRadius.sm};
            color: ${theme.colors.textSecondary};
            padding: ${theme.spacing.lg};
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #indexRecommendVideoHistoryPopover #indexRecommendVideoHistoryPopoverTitle {
            display: flex;
            box-sizing: border-box;
            padding-bottom: ${theme.spacing.lg};
            border-bottom: 1px solid ${theme.colors.border};
            font-weight: 700;
            font-size: ${theme.fontSize.xxl};
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        #indexRecommendVideoHistoryPopoverTitle #clearRecommendVideoHistoryButton {
            font-size: ${theme.fontSize.sm};
            color: ${theme.colors.danger};
            cursor: pointer;
            padding: 4px 10px;
            border-radius: ${theme.borderRadius.sm};
            transition: all ${theme.transitions.fast};
        }
        #indexRecommendVideoHistoryPopoverTitle #clearRecommendVideoHistoryButton:hover {
            background: rgba(255, 71, 87, 0.1);
        }
        #indexRecommendVideoHistorySearch {
            margin: ${theme.spacing.lg} 0;
            flex-shrink: 0;
        }
        #indexRecommendVideoHistorySearchInput {
            width: 100%;
            box-sizing: border-box;
            padding: ${theme.spacing.sm} ${theme.spacing.md};
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.borderRadius.sm};
            background: ${theme.colors.backgroundLight};
            color: ${theme.colors.textSecondary};
            font-size: ${theme.fontSize.base};
            outline: none;
            transition: all ${theme.transitions.slow};
        }
        #indexRecommendVideoHistorySearchInput:focus {
            border-color: ${theme.colors.primary};
            background: ${theme.colors.background};
        }
        #indexRecommendVideoHistorySearchInput::placeholder {
            color: ${theme.colors.textDisabled};
        }
        #indexRecommendVideoHistoryList {
            list-style: none;
            margin: 0;
            padding: 0;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: calc(80vh - 140px);
            flex: 1;
        }
        #indexRecommendVideoHistoryList li {
            display: flex;
            gap: 12px;
            padding: 10px;
            border-radius: ${theme.borderRadius.sm};
            transition: background ${theme.transitions.fast};
            cursor: pointer;
            align-items: flex-start;
        }
        #indexRecommendVideoHistoryList li:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        #indexRecommendVideoHistoryList li > span:first-child {
            width: 120px;
            height: 75px;
            flex-shrink: 0;
            border-radius: ${theme.borderRadius.sm};
            overflow: hidden;
            background: ${theme.colors.background};
        }
        #indexRecommendVideoHistoryList li > span:first-child img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        #indexRecommendVideoHistoryList li .video-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 2px 0;
        }
        #indexRecommendVideoHistoryList li .video-info a {
            color: ${theme.colors.textPrimary};
            text-decoration: none;
            font-size: ${theme.fontSize.base};
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-all;
        }
        #indexRecommendVideoHistoryList li .video-info a:hover {
            color: ${theme.colors.primary};
        }
        #indexRecommendVideoHistoryList li .video-author {
            color: ${theme.colors.textDisabled};
            font-size: ${theme.fontSize.sm};
            margin-top: 6px;
        }
        #indexRecommendVideoHistoryList .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: ${theme.colors.textDisabled};
            font-size: ${theme.fontSize.base};
        }
        #indexRecommendVideoHistoryList .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            gap: 12px;
            color: ${theme.colors.textDisabled};
            font-size: ${theme.fontSize.sm};
        }
        #indexRecommendVideoHistoryList .loading-state .loading-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid ${theme.colors.border};
            border-top-color: ${theme.colors.primary};
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        #indexRecommendVideoHistoryList .sentinel {
            height: 1px;
            width: 100%;
        }
    `
}
