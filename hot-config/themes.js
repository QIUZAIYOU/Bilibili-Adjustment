{
  "_README": "主题色值热更覆盖表。视觉微调、跟随 B 站官方色值调整时改这里、跑 HOT_ONLY=1 python scripts/upload.py 即可，无需发版（用户刷新页面后生效，已注入的变量表会整块重写）。规则：key 只允许 night / light / dark 三个主题；每个主题下 colors 只允许覆盖 src/shared/theme/tokens.ts 里已有的 token（不能新增 —— 这也保证「三主题 token 集合一致」这条不变量不被破坏），值必须是 #hex / rgb()·rgba()·hsl()·hsla() 或 `r,g,b` 裸三元组（*-rgb token 用）；shadows 的 key 取 sm/md/lg/xl/float/dialog/glow/glowStrong/ring。值里出现分号/花括号/注释/url() 等会逃出 CSS 声明或引入外部资源的写法一律被丢弃并在控制台告警。改完记得同步 themes.ts，再把这里的条目删掉。",
  "_example": "例如夜间主题品牌色改成 B 站粉：\"night\": { \"colors\": { \"brand\": \"#FB7299\", \"brand-rgb\": \"251,114,153\" } }",
  "table": "themes",
  "updatedAt": "",
  "overrides": {}
}
