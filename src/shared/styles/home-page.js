export const homePageStyles = {
    indexAdjustment: `
        #indexRecommendVideoHistoryOpenButton {
            margin-top: 10px;
        }
        .adjustment-history-popover {
            width: 820px;
            border: 1px solid var(--adj-border-strong);
            outline: 0;
            background: var(--adj-bg-page);
            border-radius: var(--adj-radius-sm);
            color: var(--adj-text-soft);
            padding: var(--adj-space-lg);
            max-height: 80vh;
            overflow: hidden;
        }
        /* display 只在打开时生效：若全局 flex，会覆盖 UA 的 [popover]{display:none}，
           关闭后弹窗将残留显示在文档流中 */
        .adjustment-history-popover:popover-open {
            display: flex;
            flex-direction: column;
        }
        .adjustment-history-popover::backdrop {
            background: var(--adj-bg-scrim);
        }
        #indexRecommendVideoHistoryPopover #indexRecommendVideoHistoryPopoverTitle {
            display: flex;
            box-sizing: border-box;
            padding-bottom: var(--adj-space-lg);
            border-bottom: 1px solid var(--adj-border-strong);
            font-weight: 700;
            font-size: var(--adj-font-xxl);
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        #indexRecommendVideoHistoryPopoverTitle #clearRecommendVideoHistoryButton {
            font-size: var(--adj-font-sm);
            color: var(--adj-danger);
            cursor: pointer;
            padding: 4px 10px;
            border-radius: var(--adj-radius-sm);
            transition: all var(--adj-motion-fast);
        }
        #indexRecommendVideoHistoryPopoverTitle #clearRecommendVideoHistoryButton:hover {
            background: rgba(var(--adj-danger-rgb), 0.1);
        }
        #indexRecommendVideoHistorySearch {
            margin: var(--adj-space-lg) 0;
            flex-shrink: 0;
        }
        #indexRecommendVideoHistorySearchInput {
            width: 100%;
            box-sizing: border-box;
            padding: var(--adj-space-sm) var(--adj-space-md);
            border: 1px solid var(--adj-border-strong);
            border-radius: var(--adj-radius-sm);
            background: var(--adj-bg-page);
            color: var(--adj-text-soft);
            font-size: var(--adj-font-base);
            outline: none;
            transition: all var(--adj-motion-slow);
        }
        #indexRecommendVideoHistorySearchInput:focus {
            border-color: var(--adj-brand);
            background: var(--adj-bg-input);
        }
        #indexRecommendVideoHistorySearchInput::placeholder {
            color: var(--adj-text-disabled);
        }
        #indexRecommendVideoHistoryCategoryV2 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            list-style: none;
            margin: 0;
            padding: 0 12px 0 0;
            align-content: start;
            overflow-y: auto;
            flex-shrink: 0;
            width: 340px;
            border-right: 1px solid var(--adj-border-strong);
        }
        #indexRecommendVideoHistoryCategoryV2 li {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px 6px;
            border: 1px solid var(--adj-border-strong);
            border-radius: 6px;
            font-size: var(--adj-font-sm);
            color: var(--adj-text-soft);
            cursor: pointer;
            transition: all var(--adj-motion-fast);
            line-height: 1.3;
            word-break: break-all;
        }
        #indexRecommendVideoHistoryCategoryV2 li:hover {
            background: var(--adj-bg-hover);
            color: var(--adj-brand);
        }
        #indexRecommendVideoHistoryCategoryV2 li.active {
            background: var(--adj-brand)20;
            color: var(--adj-brand);
            border-color: var(--adj-brand)40;
        }
        .history-body {
            display: flex;
            flex: 1;
            overflow: hidden;
            gap: 8px;
        }
        #indexRecommendVideoHistoryList {
            list-style: none;
            margin: 0;
            padding: 0;
            overflow-y: auto;
            overflow-x: hidden;
            flex: 1;
            min-height: 0;
        }
        #indexRecommendVideoHistoryList li {
            display: flex;
            gap: 12px;
            padding: 10px;
            border-radius: var(--adj-radius-sm);
            transition: background var(--adj-motion-fast);
            cursor: pointer;
            align-items: flex-start;
        }
        #indexRecommendVideoHistoryList li:hover {
            background: var(--adj-bg-hover);
        }
        #indexRecommendVideoHistoryList li > span:first-child {
            width: 120px;
            height: 75px;
            flex-shrink: 0;
            border-radius: var(--adj-radius-sm);
            overflow: hidden;
            background: var(--adj-bg-input);
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
            color: var(--adj-text-primary);
            text-decoration: none;
            font-size: var(--adj-font-base);
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-all;
        }
        #indexRecommendVideoHistoryList li .video-info a:hover {
            color: var(--adj-brand);
        }
        #indexRecommendVideoHistoryList li .video-author {
            color: var(--adj-text-disabled);
            font-size: var(--adj-font-sm);
            margin-top: 6px;
        }
        #indexRecommendVideoHistoryList .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--adj-text-disabled);
            font-size: var(--adj-font-base);
        }
        #indexRecommendVideoHistoryList .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            gap: 12px;
            color: var(--adj-text-disabled);
            font-size: var(--adj-font-sm);
        }
        #indexRecommendVideoHistoryList .loading-state .loading-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--adj-border-strong);
            border-top-color: var(--adj-brand);
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
