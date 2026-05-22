import { theme } from '../theme'

export const homePageStyles = {
    indexAdjustment: `
        #indexRecommendVideoHistoryOpenButton {
            margin-top: 10px;
        }
        #indexRecommendVideoHistoryPopover {
            width: fit-content;
            border: 1px solid ${theme.colors.border};
            outline: 0;
            background: ${theme.colors.backgroundLight};
            border-radius: ${theme.borderRadius.sm};
            color: ${theme.colors.textSecondary};
            position: fixed;
            inset: 0;
            margin: auto;
            padding: ${theme.spacing.lg};
            max-height: 805px;
            overflow: hidden;
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
        }
        #indexRecommendVideoHistorySearch {
            margin: ${theme.spacing.lg} 0;
            border-bottom: 1px solid ${theme.colors.border};
            padding-bottom: ${theme.spacing.lg};
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
        #indexRecommendVideoHistoryPopover ul {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #indexRecommendVideohistoryContents {
            display: flex;
            gap: 10px;
        }
        #indexRecommendVideohistoryCategories {
            width: 440px;
            border-right: 1px solid ${theme.colors.border};
            padding-right: 10px;
            max-height: 650px;
            overflow: auto;
            overscroll-behavior: contain;
        }
        #indexRecommendVideohistoryCategories hr {
            height: 1px;
            background: ${theme.colors.border};
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: unset;
        }
        #indexRecommendVideohistoryCategories hr:before {
            width: fit-content;
            content: "以下是 V2 版本分区";
            color: ${theme.colors.textSecondary};
            background: ${theme.colors.backgroundLight};
            text-align: center;
            padding: 0 5px;
            font-size: ${theme.fontSize.sm};
        }
        ul#indexRecommendVideoHistoryCategory,
        ul#indexRecommendVideoHistoryCategoryV2 {
            display: grid;
            margin: 10px 0 0;
            padding: 0 0 10px 0;
            border-bottom: none !important;
            gap: 5px;
            grid-template-columns: repeat(3, 1fr);
            align-items: center;
            justify-content: center;
        }
        ul#indexRecommendVideoHistoryCategory {
            border: none !important;
            margin: 0 0 15px;
            padding: 0;
        }
        ul#indexRecommendVideoHistoryCategoryV2 {
            margin: 0;
            padding: 0;
        }
    `
}
