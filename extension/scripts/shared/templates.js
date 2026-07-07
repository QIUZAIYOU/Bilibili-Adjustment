// ===== scripts/shared/templates.js =====
window.__biliExt = window.__biliExt || {}
window.__biliExt.templates = window.__biliExt.templates || {}
window.__biliExt.getTemplates = window.__biliExt.getTemplates || function () { return window.__biliExt.templates }

;(function () {
  const reg = window.__biliExt.templateRegistry

  // ===== 播放器相关 =====
  reg.register('jumpToCommentBtn', '<button class="bili-adjustment-jump-to-comment" title="跳转至评论区">💬 评论</button>')
  reg.register('returnPlayerBtn', '<span class="bili-adjustment-return-player">⬆ 返回播放器</span>')
  reg.register('floatingPlayerBtn', '<button class="bili-adjustment-floating-btn" title="返回播放器">⬆</button>')

  // ===== 设置面板 =====
  reg.register('settingsPanel', `
    <div class="bili-adjustment-popover-overlay" id="biliSettingsOverlay"></div>
    <div class="bili-adjustment-popover" id="biliSettingsPanel">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2a2a4a;">
        <h2 style="font-size:16px;font-weight:600;color:#eaeaea;margin:0;">⚙️ 哔哩哔哩调整设置</h2>
        <button id="biliSettingsClose" style="background:transparent;border:none;color:#8899aa;font-size:20px;cursor:pointer;padding:4px;">✕</button>
      </div>
      <div id="biliSettingsContent" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>
    </div>
  `)

  // ===== 历史记录弹窗 =====
  reg.register('historyPanel', `
    <div class="bili-adjustment-history-overlay" id="biliHistoryOverlay">
      <div class="bili-adjustment-history-panel">
        <div class="bili-adjustment-history-header">
          <h2>📋 推荐视频历史记录</h2>
          <button class="bili-adjustment-history-close" id="biliHistoryClose">✕</button>
        </div>
        <div class="bili-adjustment-history-search">
          <input type="text" id="biliHistorySearch" placeholder="搜索标题或作者...">
        </div>
        <div class="bili-adjustment-history-list" id="biliHistoryList">
          <div class="bili-adjustment-history-empty">暂无记录</div>
        </div>
        <div class="bili-adjustment-history-actions">
          <button class="bili-adjustment-history-btn-refresh" id="biliHistoryRefresh">🔄 刷新</button>
          <button class="bili-adjustment-history-btn-clear" id="biliHistoryClear">🗑️ 清空</button>
        </div>
      </div>
    </div>
  `)

  reg.register('historyItem', `
    <div class="bili-adjustment-history-item" data-url="{url}">
      <img src="{cover}" alt="{title}" loading="lazy" onerror="this.style.display='none'">
      <div class="bili-adjustment-history-item-info">
        <div class="bili-adjustment-history-item-title">{title}</div>
        <div class="bili-adjustment-history-item-author">{author}</div>
      </div>
    </div>
  `)

  // ===== 更新通知 =====
  reg.register('updateNotification', `
    <div class="bili-adjustment-popover-overlay" id="biliUpdateOverlay"></div>
    <div class="bili-adjustment-popover" style="width:380px;" id="biliUpdatePanel">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:600;color:#e94560;margin-bottom:12px;">🎉 发现新版本</div>
        <div id="biliUpdateContent" style="font-size:13px;color:#8899aa;line-height:1.6;margin-bottom:16px;"></div>
        <div style="display:flex;gap:8px;">
          <a id="biliUpdateDownload" href="#" target="_blank" style="flex:1;padding:8px 16px;background:#e94560;color:white;border-radius:6px;text-align:center;text-decoration:none;font-size:13px;">📥 前往下载</a>
          <button id="biliUpdateClose" style="padding:8px 16px;background:#0f3460;color:#eaeaea;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer;">关闭</button>
        </div>
      </div>
    </div>
  `)

  // ===== Tooltip =====
  reg.register('tooltip', `
    <div class="bili-adjustment-tooltip" style="position:fixed;z-index:999999;background:#1a1a2e;color:#eaeaea;border:1px solid #2a2a4a;border-radius:6px;padding:6px 10px;font-size:12px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:none;"></div>
  `)

  // ===== 视频简介增强 =====
  reg.register('enhancedDescription', `
    <div class="bili-adjustment-enhanced-description">
      {content}
    </div>
  `)

  // 导出到 templates 对象
  window.__biliExt.templates = {
    getTemplate: (name) => reg.get(name),
    getTemplateMeta: (name) => reg.getMeta(name),
  }
})()
