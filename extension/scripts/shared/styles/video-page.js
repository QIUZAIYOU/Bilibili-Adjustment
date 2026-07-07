// ===== scripts/shared/styles/video-page.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.videoPageStyles = `
/* 网页全屏解锁 */
.bpx-player-video-wrap.web-full-screen-unlocked ~ .comment-area {
  display: block !important;
}

.bpx-player-state-web-full .bpx-player-video-wrap {
  position: relative !important;
}

/* 快速跳转评论区按钮 */
.bili-adjustment-jump-to-comment {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.bili-adjustment-jump-to-comment:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.5);
}

/* 视频简介优化样式 */
.bili-adjustment-enhanced-description {
  padding: 12px 16px;
  background: rgba(0,0,0,0.05);
  border-radius: 8px;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.8;
  word-break: break-word;
}

.bili-adjustment-enhanced-description a {
  color: #00a1d6;
  text-decoration: none;
}

.bili-adjustment-enhanced-description a:hover {
  text-decoration: underline;
}

/* 返回播放器按钮 */
.bili-adjustment-return-player {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #00a1d6;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #00a1d6;
  border-radius: 4px;
  background: transparent;
  transition: all 0.2s;
}

.bili-adjustment-return-player:hover {
  background: #00a1d6;
  color: white;
}

/* 付费视频标记 */
.bili-adjustment-paid-mark {
  display: inline-block;
  background: linear-gradient(135deg, #e94560, #ff6b81);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
}
`
