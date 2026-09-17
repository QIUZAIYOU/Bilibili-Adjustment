{
  "_README": "模板热更覆盖表。只改脚本注入页面的 HTML（按钮/弹窗骨架）时，在这里改、跑 HOT_ONLY=1 python scripts/upload.py 即可，无需发版。规则：key 只允许已注册的 10 个模板名（见 src/shared/templates/index.js 合并的三份模板）；覆盖内容必须**保留内置模板里的全部 [[占位符]] 与 id=\"...\"**（调用点靠它们定位与替换，缺一个就静默失效），且不得含 <script>/内联事件/javascript:，否则整条被客户端丢弃并在控制台告警。注意：comments/video-description 是函数不是模板，不在覆盖范围。",
  "_example": "例如历史记录按钮换文案：\"indexRecommendVideoHistoryOpenButton\": \"<button id=\\\"indexRecommendVideoHistoryOpenButton\\\" class=\\\"primary-btn roll-btn\\\" bilibili-adjustment-element><span>观看历史</span></button>\"",
  "table": "templates",
  "updatedAt": "",
  "overrides": {}
}
