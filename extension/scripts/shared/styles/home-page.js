// ===== scripts/shared/styles/home-page.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.homePageStyles = `
/* 首页推荐视频历史记录弹窗 */
.bili-adjustment-history-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bili-adjustment-history-panel {
  background: #16213e;
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid #2a2a4a;
  overflow: hidden;
}

.bili-adjustment-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a4a;
}

.bili-adjustment-history-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #eaeaea;
  margin: 0;
}

.bili-adjustment-history-close {
  background: transparent;
  border: none;
  color: #8899aa;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.bili-adjustment-history-close:hover {
  color: #eaeaea;
}

.bili-adjustment-history-search {
  padding: 12px 20px;
  border-bottom: 1px solid #2a2a4a;
}

.bili-adjustment-history-search input {
  width: 100%;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #2a2a4a;
  border-radius: 6px;
  color: #eaeaea;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.bili-adjustment-history-search input:focus {
  border-color: #e94560;
}

.bili-adjustment-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.bili-adjustment-history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  cursor: pointer;
  transition: background 0.15s;
}

.bili-adjustment-history-item:hover {
  background: rgba(233, 69, 96, 0.08);
}

.bili-adjustment-history-item img {
  width: 80px;
  height: 50px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.bili-adjustment-history-item-info {
  flex: 1;
  min-width: 0;
}

.bili-adjustment-history-item-title {
  font-size: 13px;
  color: #eaeaea;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.bili-adjustment-history-item-author {
  font-size: 12px;
  color: #8899aa;
}

.bili-adjustment-history-empty {
  text-align: center;
  padding: 40px 20px;
  color: #8899aa;
  font-size: 13px;
}

.bili-adjustment-history-actions {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #2a2a4a;
}

.bili-adjustment-history-actions button {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.bili-adjustment-history-btn-clear {
  background: transparent;
  color: #e94560;
  border: 1px solid #e94560 !important;
}

.bili-adjustment-history-btn-clear:hover {
  background: #e94560;
  color: white;
}

.bili-adjustment-history-btn-refresh {
  background: #0f3460;
  color: #eaeaea;
  border: 1px solid #2a2a4a;
}

/* 付费标记 */
.bili-adjustment-paid-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: linear-gradient(135deg, #e94560, #ff6b81);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 10;
  font-weight: 500;
}
`
