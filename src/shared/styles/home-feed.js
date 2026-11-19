/**
 * 首页视频区（重设计）样式
 *
 * 只引用主题 token，不写字面色值；不引入 vh/vw（该区域不在弹窗 zoom 容器内，
 * 但全仓约定仍按 px/百分比写，避免 check:dialog-units 与 4K 缩放互相牵连）。
 */
export const homeFeedStyles = {
    redesign: `
        #adj-home-feed {
            width: 100%;
            box-sizing: border-box;
            padding: var(--adj-space-md) 0 var(--adj-space-xxxl);
            color: var(--adj-text-soft);
        }
        #adj-home-feed .adj-hf-toolbar {
            display: flex;
            align-items: center;
            gap: var(--adj-space-md);
            padding: var(--adj-space-sm) var(--adj-space-xs) var(--adj-space-lg);
        }
        #adj-home-feed .adj-hf-heading {
            margin: 0;
            font-size: var(--adj-font-xxl);
            font-weight: 700;
            color: var(--adj-text-soft);
        }
        #adj-home-feed .adj-hf-status {
            flex: 1;
            font-size: var(--adj-font-sm);
            color: var(--adj-text-muted);
        }
        #adj-home-feed .adj-hf-btn {
            padding: var(--adj-space-sm) var(--adj-space-lg);
            border: 1px solid var(--adj-border-strong);
            border-radius: var(--adj-radius-full);
            background: var(--adj-bg-surface);
            color: var(--adj-text-soft);
            font-size: var(--adj-font-sm);
            cursor: pointer;
            transition: var(--adj-motion-fast);
        }
        #adj-home-feed .adj-hf-btn:hover {
            background: var(--adj-bg-hover);
            border-color: var(--adj-brand);
        }
        #adj-home-feed .adj-hf-btn-small {
            margin-left: var(--adj-space-sm);
            padding: var(--adj-space-xs) var(--adj-space-md);
        }
        #adj-home-feed .adj-hf-notice {
            display: flex;
            align-items: center;
            margin-bottom: var(--adj-space-md);
            padding: var(--adj-space-sm) var(--adj-space-md);
            border-radius: var(--adj-radius-sm);
            background: var(--adj-bg-surface);
            border: 1px solid var(--adj-border-strong);
            font-size: var(--adj-font-sm);
        }
        #adj-home-feed .adj-hf-notice-text {
            flex: 1;
        }
        #adj-home-feed .adj-hf-rail {
            margin-bottom: var(--adj-space-xxl);
        }
        #adj-home-feed .adj-hf-rail-head {
            display: flex;
            align-items: baseline;
            gap: var(--adj-space-sm);
            margin-bottom: var(--adj-space-md);
        }
        #adj-home-feed .adj-hf-rail-title {
            margin: 0;
            font-size: var(--adj-font-lg);
            font-weight: 700;
            color: var(--adj-text-soft);
        }
        #adj-home-feed .adj-hf-rail-count {
            font-size: var(--adj-font-xs);
            color: var(--adj-text-muted);
        }
        #adj-home-feed .adj-hf-track {
            display: grid;
            gap: var(--adj-space-lg);
        }
        #adj-home-feed .adj-hf-track-rail {
            grid-auto-flow: column;
            grid-auto-columns: minmax(200px, 1fr);
            overflow-x: auto;
            padding-bottom: var(--adj-space-sm);
            scroll-snap-type: x proximity;
        }
        #adj-home-feed .adj-hf-track-stream {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        }
        #adj-home-feed .adj-hf-track-rail .adj-hf-card {
            scroll-snap-align: start;
        }
        #adj-home-feed .adj-hf-card {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: var(--adj-space-xs);
            min-width: 0;
        }
        #adj-home-feed .adj-hf-link {
            position: relative;
            display: block;
            color: inherit;
            text-decoration: none;
        }
        #adj-home-feed .adj-hf-cover {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            border-radius: var(--adj-radius-md);
            background: var(--adj-bg-surface);
            transition: var(--adj-motion-fast);
        }
        #adj-home-feed .adj-hf-card:hover .adj-hf-cover {
            filter: brightness(1.06);
        }
        #adj-home-feed .adj-hf-duration {
            position: absolute;
            right: var(--adj-space-xs);
            bottom: var(--adj-space-xs);
            padding: 0 var(--adj-space-xs);
            border-radius: var(--adj-radius-xs);
            background: var(--adj-bg-scrim-strong);
            color: var(--adj-text-strong);
            font-size: var(--adj-font-xs);
            line-height: 18px;
        }
        #adj-home-feed .adj-hf-title {
            margin: 0;
            font-size: var(--adj-font-base);
            font-weight: 600;
            line-height: 1.45;
            color: var(--adj-text-soft);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        #adj-home-feed .adj-hf-meta {
            display: flex;
            align-items: center;
            gap: var(--adj-space-xs);
            min-width: 0;
            font-size: var(--adj-font-xs);
            color: var(--adj-text-muted);
        }
        #adj-home-feed .adj-hf-avatar {
            width: 18px;
            height: 18px;
            border-radius: var(--adj-radius-full);
            flex: none;
        }
        #adj-home-feed .adj-hf-owner {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 46%;
        }
        #adj-home-feed .adj-hf-view {
            margin-left: auto;
            flex: none;
        }
        #adj-home-feed .adj-hf-block {
            position: absolute;
            top: var(--adj-space-xs);
            right: var(--adj-space-xs);
            width: 26px;
            height: 26px;
            border: none;
            border-radius: var(--adj-radius-full);
            background: var(--adj-bg-scrim-strong);
            color: var(--adj-text-strong);
            font-size: var(--adj-font-lg);
            line-height: 1;
            cursor: pointer;
            opacity: 0;
            transition: var(--adj-motion-fast);
        }
        #adj-home-feed .adj-hf-card:hover .adj-hf-block,
        #adj-home-feed .adj-hf-block:focus-visible {
            opacity: 1;
        }
        #adj-home-feed .adj-hf-empty {
            padding: var(--adj-space-xxxl) 0;
            text-align: center;
            font-size: var(--adj-font-sm);
            color: var(--adj-text-muted);
        }
        #adj-home-feed .adj-hf-card-skeleton {
            animation: adj-hf-pulse 1.2s ease-in-out infinite;
        }
        #adj-home-feed .adj-hf-skeleton-cover {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: var(--adj-radius-md);
            background: var(--adj-bg-surface);
        }
        #adj-home-feed .adj-hf-skeleton-line {
            height: 12px;
            margin-top: var(--adj-space-sm);
            border-radius: var(--adj-radius-xs);
            background: var(--adj-bg-surface);
        }
        #adj-home-feed .adj-hf-skeleton-line-short {
            width: 60%;
        }
        #adj-home-feed .adj-hf-sentinel {
            height: 1px;
        }
        @keyframes adj-hf-pulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
        }
    `
}
