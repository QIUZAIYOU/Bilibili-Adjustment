/**
 * 视频卡片预览的样式（**跨页通用**）
 *
 * 为什么单独成文件：预览按钮/弹窗原先写在 home-page.js 里，只有首页会注入 ——
 * 预览功能扩展到所有页型后，样式必须跟着功能走，不能再绑在某个页型的样式块上。
 *
 * 注入时机：功能**开启时**才注入（`insertStyleToDocument({ VideoPreviewStyle: … })`），
 * 关闭时整块移除 —— 默认关闭的情况下，页面上一点预览相关的 CSS 都不留。
 */
export const videoPreviewPageStyles = {
    videoPreview: `
        /* ========== 视频卡片预览按钮（注入卡片封面左上角，与自带「稍后再看」同级） ========== */
        /* 默认隐藏、鼠标悬停卡片时显示（与 B 站自带「稍后再看」一致的行为）；层级用 token，
           压在 B 站自己的 hover 内联预览之上，保证点得到 */
        .adj-video-preview-btn {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: var(--adj-z-popover);
            display: flex;
            align-items: center;
            justify-content: center;
            /* 只放一颗 18px 图标：方形小按钮（原来是「预览」文字胶囊） */
            width: 28px;
            height: 28px;
            padding: 0;
            border-radius: var(--adj-radius-sm);
            background: var(--adj-bg-scrim);
            color: var(--adj-text-strong);
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            user-select: none;
            transition: var(--adj-motion-fast);
        }
        .adj-video-preview-btn svg {
            display: block;
            width: 18px;
            height: 18px;
        }
        /* 显现规则：鼠标悬停**封面容器**时显示预览按钮（与 B 站自带「稍后再看」一致的行为）。
           ⚠️ 主规则用 :has()（不依赖任何标记）：B 站是 Vue 渲染的，重渲染时会把封面的 class
           **整体重置** —— 靠 class 命中就会「按钮注入成功、却永远不显现」（2026-10-24 实测：
           20 个按钮里只有 3 个封面还带着类名）。下面两条是**退路**（不支持 :has() 的旧浏览器）：
           data 属性标记（Vue 不重置 data-*，稳）+ 类名标记。 */
        *:has(> .adj-video-preview-btn):hover .adj-video-preview-btn,
        [data-adj-preview-cover]:hover .adj-video-preview-btn,
        .adj-video-preview-cover:hover .adj-video-preview-btn,
        .adj-video-preview-btn:focus-visible {
            opacity: 1;
            pointer-events: auto;
        }
        .adj-video-preview-btn:hover {
            background: var(--adj-brand);
            color: var(--adj-on-brand);
        }
        /* ========== 预览弹窗：视频贴边铺满，头部右侧放音量与「新标签页打开」 ========== */
        /* 让**视频区（body）**在页面里居中，而不是整个弹窗居中：弹窗是靠 margin:auto + inset:0 居中的，
           那居中的是「header + body」，所以视频会被 header 顶得偏下。这里整体上移 header 的一半高度即可。
           变量由模块在打开/换标题后量出来（header 高度随标题行数变化，写死不可靠） */
        .adjustment-dialog.adj-video-preview-dialog[popover] {
            transform: translateY(calc(var(--adj-preview-header-half, 0px) * -1));
        }
        .adj-video-preview-dialog .adjustment-dialog-body {
            /* 加载遮罩要绝对定位盖在 iframe 上 */
            position: relative;
            padding: 0;
            background: var(--adj-bg-page);
        }
        .adj-video-preview-frame {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            border: 0;
            background: var(--adj-bg-page);
        }
        .adj-video-preview-header-extra {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-left: auto;
            min-width: 0;
            flex-shrink: 1;
        }
        /* 关闭按钮自带 margin-left:auto；这里取消它，让「右对齐」由上面的容器独占，
           否则两个 auto 外边距会平分空白、把自定义控件挤到中间 */
        .adj-video-preview-dialog .adjustment-dialog-close {
            margin-left: 0;
        }
        /* 预览弹窗头部的图标按钮（「新标签页打开」「进入UP主空间」共用）：只留图标，文字改为悬浮提示
           （自绘提示，不用原生 title —— 两者会同时弹出） */
        .adj-video-preview-icon-btn {
            position: relative;
            flex-shrink: 0;
            width: 32px;
            height: 32px;
            padding: 0;
            border-radius: var(--adj-radius-sm);
        }
        .adj-video-preview-icon-btn svg {
            display: block;
            width: 18px;
            height: 18px;
        }
        .adj-video-preview-tip {
            position: absolute;
            top: calc(100% + 8px);
            left: 50%;
            z-index: var(--adj-z-tooltip);
            padding: 6px 10px;
            border: 1px solid var(--adj-border);
            border-radius: var(--adj-radius-xs);
            background: var(--adj-bg-tooltip);
            color: var(--adj-text-secondary);
            box-shadow: var(--adj-shadow-float);
            font-size: var(--adj-font-sm);
            font-weight: 400;
            line-height: 1.4;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transform: translate(-50%, 4px);
            transition: var(--adj-motion-fast);
            pointer-events: none;
        }
        /* 只在悬浮时显示：不加 :focus-visible —— 弹窗打开时会自动聚焦首个可聚焦元素，
           那样提示会一开就挂在头部（无障碍语义由按钮的 aria-label 承担） */
        .adj-video-preview-icon-btn:hover .adj-video-preview-tip {
            opacity: 1;
            visibility: visible;
            transform: translate(-50%, 0);
        }
    `
}
/** videoPreviewStyles */
export const videoPreviewStyles = {
    VideoPreview: videoPreviewPageStyles.videoPreview
}
