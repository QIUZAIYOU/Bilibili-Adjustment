{
  "_README": "元素选择器热更覆盖表。B 站改版导致某个选择器失效时，在这里改一行、跑 HOT_ONLY=1 python scripts/upload.py 即可，无需发版（用户下次打开页面生效）。规则：key 必须是脚本里已注册的选择器名（见 src/shared/element-selectors.ts 的 CSS_MAP），只能覆盖不能新增；值必须是合法 CSS 选择器；非法项会被客户端逐条丢弃并在控制台告警。注意：覆盖值优先级高于内置值，源码里的 CSS_MAP 能改时请一并改掉，改完再把这里的对应条目删除，否则这条远端旧值会一直压住新的内置值。",
  "_example": "例如播放器容器改名时：\"playerContainer\": \"#bilibili-player .bpx-player-container-v2\"",
  "table": "selectors",
  "updatedAt": "",
  "overrides": { "headerMini": "#biliMainHeader .bili-header .bili-header__bar" }
}
