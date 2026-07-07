// ===== scripts/config/settings-config.js =====
window.__biliExt = window.__biliExt || {}

window.__biliExt.settingsConfig = {
  videoSettingsConfig: [
    { id: 'is_vip', type: 'checkbox', label: '是否为大会员', tips: '请如实勾选，否则影响部分设置项', category: 'basic' },
    { id: 'auto_locate', type: 'checkbox', label: '自动定位至播放器', category: 'basic', children: [
      { id: 'auto_locate_video', type: 'checkbox', label: '普通视频' },
      { id: 'auto_locate_bangumi', type: 'checkbox', label: '番剧视频' }
    ], tips: '勾选自动定位至播放器后，video 和 bangumi 两者全选或全不选，默认在这两种类型视频播放页都执行；否则勾选哪种类型，就只在该类型的播放页才执行' },
    { id: 'offset_top', type: 'input', label: '播放器顶部偏移(px)', inputType: 'number', tips: configs => `播放器距离浏览器窗口默认距离为 ${configs.player_offset_top}；请填写小于 ${configs.player_offset_top} 的正整数或 0`, category: 'basic' },
    { id: 'click_player_auto_locate', type: 'checkbox', label: '点击播放器时定位', category: 'basic' },
    { id: 'selected_player_mode', type: 'radio', label: '播放器默认模式', options: [{ value: 'normal', label: '关闭' }, { value: 'wide', label: '宽屏' }, { value: 'web', label: '网页全屏' }], tips: '若遇到不能自动选择播放器模式可尝试刷新页面', category: 'basic' },
    { id: 'webfull_unlock', type: 'checkbox', label: '网页全屏模式解锁', tips: '勾选后网页全屏模式下可以滑动滚动条查看下方评论等内容（番剧播放页不支持）', category: 'basic' },
    { id: 'auto_select_video_highest_quality', type: 'checkbox', label: '自动选择最高画质', tips: '网络条件好时可以启用此项', category: 'basic', children: [
      { id: 'contain_quality4k', type: 'checkbox', label: '包含4K画质', visible: configs => configs.is_vip },
      { id: 'contain_quality8k', type: 'checkbox', label: '包含8K画质', visible: configs => configs.is_vip }
    ]},
    { id: 'auto_hi_res', type: 'checkbox', label: '自动开启「Hi-Res 无损音质」', visible: configs => configs.is_vip, category: 'basic' },
    { id: 'insert_video_description_to_comment', type: 'checkbox', label: '优化视频简介并插入评论区', tips: '将视频简介内容优化后插入评论区或直接替换原简介区内容', category: 'basic' },
    { id: 'pause_video', type: 'checkbox', label: '离开页面自动暂停视频', category: 'basic', children: [
      { id: 'continue_play', type: 'checkbox', label: '返回页面恢复播放' }
    ]},
    { id: 'auto_subtitle', type: 'checkbox', label: '自动开启字幕', tips: '注意：此选项并非控制字幕的开关，而是控制是否自动开启字幕', category: 'basic' },
    { id: 'remove_comment_tags', type: 'checkbox', label: '移除评论标签', tips: '移除评论中「UP主觉得很赞」这类标签', category: 'basic' },
    { id: 'show_comment_location', type: 'checkbox', label: '显示评论IP属地', tips: '显示评论用户的IP属地信息', category: 'basic' },
    { id: 'ai_section', type: 'section', label: 'AI 服务配置', category: 'ai', items: [
      { id: 'auto_skip', type: 'checkbox', label: '自动跳过广告', tips: '通过 AI 识别视频中的广告片段并自动跳过。需要视频带有 AI 字幕才能工作' },
      { id: 'ai_provider', type: 'select', label: 'AI 提供商', options: [{ value: 'siliconflow', label: '硅基流动' }, { value: 'custom', label: '自定义 OpenAI 格式' }], visible: configs => !configs.use_custom_model },
      { id: 'ai_apikey', type: 'input', label: 'AI API Key', inputType: 'password', placeholder: '请输入 API Key', visible: configs => !configs.use_custom_model, hasValidateButton: true, validateButtonText: '验证 Key' },
      { id: 'ai_model', type: 'select', label: 'AI 模型', options: [], visible: configs => !configs.use_custom_model, hasRefreshButton: true, refreshButtonText: '刷新列表' },
      { id: 'use_custom_model', type: 'checkbox', label: '使用自定义模型' },
      { id: 'custom_base_url', type: 'input', label: '自定义 API 地址', placeholder: 'https://api.example.com/v1', visible: configs => !configs.use_custom_model && configs.ai_provider === 'custom' },
      { id: 'custom_model_api_url', type: 'input', label: '自定义 API 地址', placeholder: 'https://api.example.com/v1', visible: configs => configs.use_custom_model },
      { id: 'custom_model_api_key', type: 'input', label: '自定义 API Key', inputType: 'password', placeholder: '请输入自定义 API Key', visible: configs => configs.use_custom_model, hasValidateButton: true, validateButtonText: '验证 Key' },
      { id: 'custom_model_id', type: 'input', label: '自定义模型ID', placeholder: '输入模型ID，如 deepseek-ai/DeepSeek-V3', visible: configs => configs.use_custom_model }
    ]},
    { id: 'update_section', type: 'section', label: '更新配置', category: 'update', items: [
      { id: 'auto_check_update', type: 'checkbox', label: '自动检查更新' },
      { id: 'update_check_frequency', type: 'select', label: '更新检查频率', options: [{ value: 6, label: '6小时' }, { value: 12, label: '12小时' }, { value: 24, label: '24小时' }, { value: 48, label: '48小时' }, { value: 72, label: '72小时' }] },
      { id: 'auto_update', type: 'checkbox', label: '自动更新' },
      { id: 'skip_update_check', type: 'checkbox', label: '跳过更新检查' }
    ]},
    { id: 'log_section', type: 'section', label: '日志配置', category: 'log', items: [
      { id: 'log_level_info', type: 'checkbox', label: '信息', inline: true },
      { id: 'log_level_error', type: 'checkbox', label: '错误', inline: true },
      { id: 'log_level_warn', type: 'checkbox', label: '警告', inline: true },
      { id: 'log_level_debug', type: 'checkbox', label: '调试', inline: true }
    ]},
    { id: 'auto_reload', type: 'checkbox', label: '自动刷新', tips: '（不建议开启）若脚本执行失败是否自动刷新页面重试', category: 'basic' }
  ],

  dynamicSettingsConfig: [
    { id: 'dynamic_video_link', type: 'input', label: '「投稿视频」链接', tips: '点击「投稿视频」选项后，填入当前浏览器地址栏链接，即可自动跳转至该链接' }
  ],

  videoSettingsGroups: [
    { id: 'basic', label: '基础设置' },
    { id: 'ai', label: 'AI 服务' },
    { id: 'update', label: '更新配置' },
    { id: 'log', label: '日志配置' }
  ]
}
