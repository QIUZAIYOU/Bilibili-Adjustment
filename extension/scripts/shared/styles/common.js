// ===== scripts/shared/styles/common.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.commonStyles = `
/* Bilibili Adjustment - 通用样式 */
.bili-adjustment-settings,
.bili-adjustment-overlay,
.bili-adjustment-history,
.bili-adjustment-tooltip,
.bili-adjustment-update-notification {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
}

.bili-adjustment-floating-btn {
  position: fixed;
  right: 20px;
  bottom: 100px;
  z-index: 99999;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e94560;
  color: white;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(233, 69, 96, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: transform 0.2s, box-shadow 0.2s;
  opacity: 0;
  pointer-events: none;
}

.bili-adjustment-floating-btn.visible {
  opacity: 1;
  pointer-events: auto;
}

.bili-adjustment-floating-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 20px rgba(233, 69, 96, 0.6);
}

/* Toast 消息 */
.bili-adjustment-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  padding: 10px 20px;
  color: #eaeaea;
  font-size: 13px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}

.bili-adjustment-toast.show {
  opacity: 1;
}
`
