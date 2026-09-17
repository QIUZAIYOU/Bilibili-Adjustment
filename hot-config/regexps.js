{
  "_README": "正则热更覆盖表。B 站改字段/文案格式（BV 号形态、时间串格式、动态页链接等）时，在这里改 source、跑 HOT_ONLY=1 python scripts/upload.py 即可，无需发版。规则：key 用「组.名」，只允许 src/shared/regexps.ts 里已有的 17 个（video.* / dynamic.*）；值只写**正则源串**，不带斜杠、不带 flags —— flags 固定沿用内置值（改 flags 会改变调用点语义，故不允许）；值会被检查灾难性回溯（嵌套量词/可空重复/分支前缀包含）与语法合法性，非法项由客户端逐条丢弃并在控制台告警。改完记得同步源码，再把这里的条目删掉。",
  "_example": "例如 B 站换用新的 BV 号前缀：\"video.videoId\": \"(?<!(>|\\\\/))\\\\bBV[A-Za-z0-9]{10}\\\\b(?!<)\"",
  "table": "regexps",
  "updatedAt": "",
  "overrides": {}
}
