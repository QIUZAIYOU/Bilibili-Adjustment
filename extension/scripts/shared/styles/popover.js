// ===== scripts/shared/styles/popover.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.popoverStyles = `
/* 设置弹窗样式 */
.bili-adjustment-popover-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999998;
}

.bili-adjustment-popover {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999999;
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
`
