/**
 * UP 主黑名单的全局样式：管理弹窗 + 空间页监狱门遮罩
 *
 * 只引用主题 token，不写字面色值；遮罩挂在 body 顶层层级，按视口铺满。
 */
export const upBlocklistStyles = `
    /* ===== 管理弹窗 ===== */
    /* 子弹窗打开时父弹窗只做背景：压暗 + 禁止交互（inert 由脚本加） */
    .adjustment-popover.is-subdialog-open {
        opacity: 0.45;
        transition: opacity 0.2s ease;
    }
    .adj-blocklist-popover {
        position: fixed;
        inset: 0;
        margin: auto;
        box-sizing: border-box;
        width: min(520px, calc(92vw * var(--adj-ui-zoom-inv, 1)));
        max-height: calc(80vh * var(--adj-ui-zoom-inv, 1));
        height: auto;
        padding: 20px 22px;
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-lg);
        background: var(--adj-bg-page);
        color: var(--adj-text-primary);
        zoom: var(--adj-ui-zoom, 1);
        overflow: hidden;
    }
    .adj-blocklist-popover:popover-open {
        display: flex;
        flex-direction: column;
    }
    .adj-blocklist-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--adj-border);
        flex: none;
    }
    .adj-blocklist-title {
        margin: 0;
        font-size: var(--adj-font-lg);
        font-weight: 700;
        color: var(--adj-text-primary);
    }
    .adj-blocklist-title-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }
    .adj-blocklist-back {
        padding: 2px 8px;
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-full);
        background: transparent;
        color: var(--adj-text-soft);
        font-size: var(--adj-font-xs);
        cursor: pointer;
        white-space: nowrap;
    }
    .adj-blocklist-back:hover {
        border-color: var(--adj-brand);
        color: var(--adj-brand);
    }
    .adj-blocklist-close {
        border: none;
        background: transparent;
        color: var(--adj-text-soft);
        font-size: var(--adj-font-xxl);
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
    }
    .adj-blocklist-close:hover {
        color: var(--adj-text-primary);
    }
    .adj-blocklist-add {
        display: flex;
        gap: 8px;
        margin-top: 14px;
        flex: none;
    }
    .adj-blocklist-input {
        flex: 1;
        min-width: 0;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-sm);
        background: var(--adj-bg-input);
        color: var(--adj-text-primary);
        font-size: var(--adj-font-base);
    }
    .adj-blocklist-input:focus {
        outline: none;
        border-color: var(--adj-brand);
    }
    .adj-blocklist-add-btn {
        flex: none;
        padding: 8px 16px;
        border: 1px solid var(--adj-brand);
        border-radius: var(--adj-radius-sm);
        background: var(--adj-brand);
        color: var(--adj-on-brand);
        font-size: var(--adj-font-base);
        cursor: pointer;
    }
    .adj-blocklist-add-btn:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .adj-blocklist-hint {
        margin: 10px 0 0;
        font-size: var(--adj-font-xs);
        line-height: 1.6;
        color: var(--adj-text-soft);
        flex: none;
    }
    .adj-blocklist-state {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex: none;
        margin-top: 10px;
        padding: 8px 10px;
        border: 1px solid var(--adj-warning);
        border-radius: var(--adj-radius-sm);
        background: var(--adj-bg-page);
        font-size: var(--adj-font-xs);
    }
    .adj-blocklist-state[hidden] {
        display: none;
    }
    .adj-blocklist-state-text {
        color: var(--adj-text-soft);
        line-height: 1.5;
    }
    .adj-blocklist-enable {
        flex: none;
        padding: 4px 10px;
        border: 1px solid var(--adj-warning);
        border-radius: var(--adj-radius-sm);
        background: transparent;
        color: var(--adj-warning);
        font-size: var(--adj-font-xs);
        cursor: pointer;
    }
    .adj-blocklist-enable:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .adj-blocklist-search {
        margin-top: 10px;
        flex: none;
    }
    .adj-blocklist-status {
        margin-top: 8px;
        font-size: var(--adj-font-sm);
        color: var(--adj-brand);
        flex: none;
    }
    .adj-blocklist-list {
        flex: 1 1 auto;
        min-height: 0;
        max-height: calc(46vh * var(--adj-ui-zoom-inv, 1));
        margin-top: 12px;
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    .adj-blocklist-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--adj-border);
    }
    .adj-blocklist-avatar {
        flex: none;
        width: 40px;
        height: 40px;
        border-radius: var(--adj-radius-full);
        object-fit: cover;
        background: var(--adj-bg-surface);
    }
    .adj-blocklist-avatar-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--adj-text-soft);
        font-size: var(--adj-font-lg);
    }
    .adj-blocklist-main {
        flex: 1;
        min-width: 0;
    }
    .adj-blocklist-name {
        font-size: var(--adj-font-base);
        font-weight: 600;
        color: var(--adj-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .adj-blocklist-self-badge {
        display: inline-block;
        margin-left: 6px;
        padding: 0 6px;
        border: 1px solid var(--adj-brand);
        border-radius: var(--adj-radius-full);
        color: var(--adj-brand);
        font-size: var(--adj-font-xs);
        font-weight: 500;
        vertical-align: 1px;
    }
    .adj-blocklist-meta {
        margin-top: 2px;
        font-size: var(--adj-font-xs);
        color: var(--adj-text-soft);
    }
    .adj-blocklist-sign {
        margin-top: 2px;
        font-size: var(--adj-font-xs);
        color: var(--adj-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .adj-blocklist-remove {
        flex: none;
        padding: 4px 10px;
        border: 1px solid var(--adj-border-strong);
        border-radius: var(--adj-radius-sm);
        background: transparent;
        color: var(--adj-danger);
        font-size: var(--adj-font-sm);
        cursor: pointer;
    }
    .adj-blocklist-remove:hover {
        background: rgba(var(--adj-danger-rgb), 0.1);
    }
    .adj-blocklist-empty {
        padding: 32px 0;
        text-align: center;
        font-size: var(--adj-font-sm);
        color: var(--adj-text-soft);
    }
    /* ===== 空间页：监狱铁门遮罩 ===== */
    .adj-jail {
        position: fixed;
        inset: 0;
        /* 盖住 B 站所有层级，包括播放器与头部 */
        z-index: var(--adj-z-tooltip);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--adj-jail-bg);
        overflow: hidden;
        cursor: default;
    }
    .adj-jail-door {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background:
            radial-gradient(ellipse at 50% 10%, var(--adj-jail-metal-light) 0%, transparent 58%),
            linear-gradient(180deg, var(--adj-jail-metal) 0%, var(--adj-jail-bg) 52%, var(--adj-jail-metal-dark) 100%);
    }
    /* 铁栏杆：主栅 + 高光 + 两道横梁，靠 token 的深浅叠出金属感 */
    .adj-jail-bars {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
            repeating-linear-gradient(90deg, transparent 0 104px, var(--adj-jail-metal-light) 104px 114px),
            repeating-linear-gradient(90deg, transparent 0 104px, var(--adj-jail-metal) 104px 108px),
            repeating-linear-gradient(0deg, transparent 0 34%, var(--adj-jail-metal) 34% calc(34% + 12px)),
            repeating-linear-gradient(0deg, transparent 0 66%, var(--adj-jail-metal) 66% calc(66% + 12px)),
            repeating-linear-gradient(0deg, transparent 0 34%, var(--adj-jail-metal-light) 34% calc(34% + 4px));
        box-shadow: inset 0 0 200px var(--adj-jail-bg);
    }
    .adj-jail-door::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 0 18px var(--adj-jail-metal-dark), inset 0 0 0 20px var(--adj-jail-metal-light), inset 0 0 120px var(--adj-jail-bg);
    }
    .adj-jail-plate {
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        width: min(400px, calc(80vw * var(--adj-ui-zoom-inv, 1)));
        padding: 34px 30px 28px;
        text-align: center;
        border: 1px solid var(--adj-jail-metal-light);
        border-radius: var(--adj-radius-md);
        background: linear-gradient(180deg, var(--adj-jail-metal), var(--adj-jail-metal-dark));
        box-shadow: var(--adj-shadow-lg), inset 0 1px 0 var(--adj-jail-metal-light);
        zoom: var(--adj-ui-zoom, 1);
    }
    .adj-jail-bolt {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--adj-jail-metal-light);
        box-shadow: inset 0 1px 0 var(--adj-jail-metal-dark);
    }
    .adj-jail-lock {
        display: flex;
        justify-content: center;
        color: var(--adj-jail-accent);
        margin-bottom: 14px;
    }
    .adj-jail-title {
        margin: 0;
        font-size: var(--adj-font-xxl);
        font-weight: 700;
        letter-spacing: 2px;
        line-height: 1.35;
        color: var(--adj-jail-text);
    }
    .adj-jail-desc {
        margin: 10px 0 0;
        font-size: var(--adj-font-sm);
        line-height: 1.6;
        color: var(--adj-jail-text-dim);
    }
    .adj-jail-temp {
        margin-top: 22px;
        padding: 7px 20px;
        border: 1px solid var(--adj-jail-metal-light);
        border-radius: var(--adj-radius-full);
        background: transparent;
        color: var(--adj-jail-text-dim);
        font-size: var(--adj-font-sm);
        cursor: pointer;
        transition: var(--adj-motion-fast);
    }
    .adj-jail-temp:hover,
    .adj-jail-temp:focus-visible {
        outline: none;
        border-color: var(--adj-jail-accent);
        color: var(--adj-jail-accent);
    }
    .adj-jail-hint {
        margin: 22px 0 0;
        padding-top: 14px;
        border-top: 1px solid var(--adj-jail-metal);
        font-size: var(--adj-font-xs);
        line-height: 1.7;
        color: var(--adj-jail-text-dim);
    }
    .adj-jail-hint-sub {
        margin-top: 6px;
        padding-top: 0;
        border-top: none;
        opacity: 0.78;
    }
`
