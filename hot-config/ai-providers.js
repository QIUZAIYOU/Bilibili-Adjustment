{
  "_README": "AI 提供商端点与默认模型的热更覆盖表。厂商上新模型/换端点时改这里并跑 HOT_ONLY=1 python scripts/upload.py 即可，无需发版。规则：key 必须是已内置的 provider（siliconflow / deepseek / kimi / zhipu / openai / custom），只能覆盖 baseURL / defaultModel 两个字段，不能新增 provider；非法项会被客户端逐条丢弃。",
  "_example": "例如 DeepSeek 上新模型：\"deepseek\": { \"defaultModel\": \"deepseek-chat-v4\" }",
  "table": "ai-providers",
  "updatedAt": "",
  "overrides": {}
}
