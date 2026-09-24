/**
 * 设置项配置定义
 * 所有设置项在此集中定义，渲染器根据此配置动态生成 UI
 */
// 基础设置项类型定义
// type: 'checkbox' | 'input' | 'select' | 'radio' | 'section' | 'custom'
// dependsOn: { field: string, value: any } - 当指定字段等于指定值时显示
// visible: boolean | (configs) => boolean - 控制显示条件
/** 设置项类型（schema 的 type 字段） */
export type SettingItemType = 'checkbox' | 'input' | 'select' | 'radio' | 'section' | 'custom'
/** select / radio 的选项 */
export interface SettingOption {
    value: string | number
    label: string
}
/** 设置项 schema（V3 设置面板消费的字段契约；本文件即类型事实源） */
export interface SettingItemSchema {
    id: string
    type: SettingItemType
    label?: string
    category?: string
    /** 原生 input 的 type（如 number / password） */
    inputType?: string
    placeholder?: string
    /** 紧凑布局（标签 + 开关一行）；inline 项不渲染 children */
    inline?: boolean
    /** 提示文案：字符串或按当前配置生成 */
    tips?: string | ((configs: Record<string, unknown>) => string)
    /** 设置项说明 */
    description?: string
    /** select / radio 的静态选项 */
    options?: SettingOption[]
    /** section 的子项 */
    items?: SettingItemSchema[]
    defaultValue?: unknown | (() => unknown)
    /** 可见性：布尔或按当前配置计算 */
    visible?: boolean | ((configs: Record<string, unknown>) => boolean)
    /** 依赖条件（渲染器据此做联动） */
    dependsOn?: { field: string; value: unknown }
    children?: SettingItemSchema[]
    hasValidateButton?: boolean
    hasRefreshButton?: boolean
    validateButtonText?: string
    refreshButtonText?: string
}
export const videoSettingsConfig: SettingItemSchema[] = [
    {
        id: 'account_section',
        type: 'section',
        label: '账号',
        items: [
            {
                id: 'is_vip',
                type: 'checkbox',
                label: '是否为大会员',
                tips: '请如实勾选，否则影响部分设置项',
                category: 'basic',
                defaultValue: true
            }
        ]
    },
    {
        id: 'player_section',
        type: 'section',
        label: '界面与播放器',
        items: [
            {
                id: 'theme',
                type: 'select',
                label: '界面主题',
                tips: '默认「跟随B站」，脚本界面配色随 B 站当前模式自动匹配（html.night-mode → 官方深色，否则官方浅色）；「夜间哔哩」为脚本自带深色外观，检测到 Stylus「夜间哔哩」样式时也会自动切换为它',
                options: [
                    { value: 'night', label: '夜间哔哩' },
                    { value: 'follow', label: '跟随B站' }
                ],
                category: 'basic',
                defaultValue: 'follow'
            },
            {
                id: 'selected_player_mode',
                type: 'radio',
                label: '播放器默认模式',
                options: [
                    { value: 'normal', label: '关闭' },
                    { value: 'wide', label: '宽屏' },
                    { value: 'web', label: '网页全屏' }
                ],
                defaultValue: 'wide',
                tips: '若遇到不能自动选择播放器模式可尝试刷新页面',
                category: 'basic'
            },
            {
                id: 'webfull_unlock',
                type: 'checkbox',
                label: '网页全屏模式解锁',
                tips: '勾选后网页全屏模式下可以滑动滚动条查看下方评论等内容（番剧播放页不支持）',
                category: 'basic',
                defaultValue: false,
                // 仅在默认播放器模式为网页全屏时显示
                visible: configs => configs.selected_player_mode === 'web'
            },
            {
                id: 'preserve_player_mode',
                type: 'checkbox',
                label: '上下集切换时保持当前屏幕模式',
                tips: '切换上下集时不切换回默认模式，保持当前选择的屏幕模式',
                category: 'basic',
                defaultValue: true,
                children: [
                    {
                        id: 'preserve_mode_wide',
                        type: 'checkbox',
                        label: '宽屏',
                        defaultValue: true
                    },
                    {
                        id: 'preserve_mode_web',
                        type: 'checkbox',
                        label: '网页全屏',
                        defaultValue: true
                    },
                    {
                        id: 'preserve_mode_full',
                        type: 'checkbox',
                        label: '全屏',
                        defaultValue: true
                    }
                ]
            },
            {
                id: 'open_author_space_mode',
                type: 'radio',
                label: '打开UP主主页方式',
                options: [
                    { value: 'tab', label: '新标签页' },
                    { value: 'popup', label: '弹窗' }
                ],
                defaultValue: 'tab',
                tips: '点击「UP主空间」或「主页」按钮时打开UP主主页的方式；弹窗方式在当前页面内展示主页，不打断浏览',
                category: 'basic'
            },
            {
                id: 'pause_video',
                type: 'checkbox',
                label: '离开页面自动暂停视频',
                category: 'basic',
                defaultValue: false,
                children: [
                    {
                        id: 'continue_play',
                        type: 'checkbox',
                        label: '返回页面恢复播放',
                        defaultValue: false
                    }
                ]
            }
        ]
    },
    {
        id: 'locate_section',
        type: 'section',
        label: '自动定位与记忆',
        items: [
            {
                id: 'auto_locate',
                type: 'checkbox',
                label: '自动定位至播放器',
                category: 'basic',
                defaultValue: true,
                children: [
                    {
                        id: 'auto_locate_video',
                        type: 'checkbox',
                        label: '普通视频',
                        defaultValue: true
                    },
                    {
                        id: 'auto_locate_bangumi',
                        type: 'checkbox',
                        label: '番剧视频',
                        defaultValue: true
                    }
                ],
                tips: '勾选自动定位至播放器后，video 和 bangumi 两者全选或全不选，默认在这两种类型视频播放页都执行；否则勾选哪种类型，就只在这种类型的播放页才执行'
            },
            {
                id: 'offset_top',
                type: 'input',
                label: '播放器顶部偏移(px)',
                inputType: 'number',
                defaultValue: 5,
                tips: configs => `播放器距离浏览器窗口默认距离为 ${configs.player_offset_top}；请填写小于 ${configs.player_offset_top} 的正整数或 0；当值为 0 时，播放器上沿将紧贴浏览器窗口上沿;值为 ${configs.player_offset_top} 时，将保持B站默认`,
                category: 'basic'
            },
            {
                id: 'click_player_auto_locate',
                type: 'checkbox',
                label: '点击播放器时定位',
                category: 'basic',
                defaultValue: true
            },
            {
                id: 'playback_memory',
                type: 'checkbox',
                label: '记忆播放进度',
                tips: '切换选集或关闭页面时记住播放位置，回到页面或选集时自动恢复。仅作为 B站 官方进度记忆失效时的兜底保障，不与官方功能冲突',
                category: 'basic',
                defaultValue: true
            }
        ]
    },
    {
        id: 'quality_section',
        type: 'section',
        label: '画质、音质与字幕',
        items: [
            {
                id: 'auto_select_video_highest_quality',
                type: 'checkbox',
                label: '自动选择最高画质',
                tips: '网络条件好时可以启用此项，勾哪项选哪项，都勾选8k，否则选择4k及8k外最高画质',
                category: 'basic',
                defaultValue: true,
                children: [
                    {
                        id: 'contain_quality4k',
                        type: 'checkbox',
                        label: '包含4K画质',
                        defaultValue: false,
                        visible: configs => Boolean(configs.is_vip)
                    },
                    {
                        id: 'contain_quality8k',
                        type: 'checkbox',
                        label: '包含8K画质',
                        defaultValue: false,
                        visible: configs => Boolean(configs.is_vip)
                    }
                ]
            },
            {
                id: 'auto_hi_res',
                type: 'checkbox',
                label: '自动开启「Hi-Res 无损音质」',
                visible: configs => Boolean(configs.is_vip),
                category: 'basic',
                defaultValue: true
            },
            {
                id: 'auto_subtitle',
                type: 'checkbox',
                label: '自动开启字幕',
                tips: '注意：此选项并非控制字幕的开关，而是控制是否自动开启字幕，开启此选项后每个视频都会尝试自动开启字幕<br>此选项的开启与关闭不会对「视频本身（UP主）」设置的字幕开关状态产生影响',
                category: 'basic',
                defaultValue: false,
                children: [
                    {
                        id: 'preserve_subtitle_state',
                        type: 'checkbox',
                        label: '切换选集时保持字幕开关状态',
                        tips: '开启后手动关闭字幕时，切换选集/视频不会自动重新开启字幕',
                        defaultValue: false
                    }
                ]
            },
            {
                id: 'auto_cancel_mute',
                type: 'checkbox',
                label: '自动取消静音',
                tips: '进入视频页面时如果处于静音状态则自动取消静音',
                category: 'basic',
                defaultValue: true
            }
        ]
    },
    {
        id: 'comment_section',
        type: 'section',
        label: '评论区',
        items: [
            {
                id: 'insert_video_description_to_comment',
                type: 'checkbox',
                label: '优化视频简介并插入评论区',
                tips: '将视频简介内容优化后插入评论区或直接替换原简介区内容(替换原简介中固定格式的静态内容为跳转链接)',
                category: 'basic',
                defaultValue: true
            },
            {
                id: 'remove_comment_tags',
                type: 'checkbox',
                label: '移除评论标签',
                tips: '移除评论中「UP主觉得很赞」这类标签',
                category: 'basic',
                defaultValue: true
            },
            {
                id: 'show_comment_location',
                type: 'checkbox',
                label: '显示评论IP属地',
                tips: '显示评论用户的IP属地信息',
                category: 'basic',
                defaultValue: true
            }
        ]
    },
    {
        id: 'ai_section',
        type: 'section',
        label: '跳过片段',
        category: 'ai',
        items: [
            {
                id: 'progress_segment_tint',
                type: 'checkbox',
                label: '进度条片段染色',
                tips: '在官方进度条上把跳过片段的区间染成深一档的蓝色，便于看出哪些部分会被跳过（不影响官方进度条本身的拖拽）',
                defaultValue: true
            },
            {
                id: 'auto_skip',
                type: 'checkbox',
                label: '跳过片段',
                tips: '总开关：进入播放页时自动应用该视频已有的跳过片段（手动添加的片头片尾、共享缓存、AI 识别结果）。关闭后完全不再跳过。片段数据可通过播放器侧边栏「管理」维护，与开关相互独立。',
                defaultValue: false
            }
        ]
    },
    {
        id: 'ai_identify_section',
        type: 'section',
        label: 'AI 识别',
        category: 'ai',
        // 「跳过片段」关闭时整块隐藏（含标题），而不是只隐藏里面的开关
        visible: configs => Boolean(configs.auto_skip),
        items: [
            {
                id: 'ai_auto_identify',
                type: 'checkbox',
                label: 'AI 自动识别广告',
                tips: '开启后，无缓存片段时会调用 AI 识别视频中的广告片段并自动跳过，需要视频带有 AI 字幕 才能工作，无字幕时自动跳过识别。识别精度取决于所选 AI 模型，<a href="https://siliconflow.cn/pricing" target="_blank">查看计费</a>。API Key 请妥善保管，不要在公共设备上保存。仅使用手动片段或共享缓存时无需开启，可保持关闭以节省流量与 Key 配额。',
                defaultValue: false,
                visible: configs => Boolean(configs.auto_skip),
                children: [
                    {
                        id: 'ai_provider',
                        type: 'select',
                        label: 'AI 提供商',
                        options: [
                            { value: 'siliconflow', label: '硅基流动' },
                            { value: 'deepseek', label: 'DeepSeek 官方' },
                            { value: 'kimi', label: 'Kimi（月之暗面）' },
                            { value: 'zhipu', label: '智谱 AI' },
                            { value: 'openai', label: 'OpenAI' }
                        ],
                        defaultValue: 'siliconflow',
                        visible: configs => !configs.use_custom_model,
                        tips: '选择 AI 服务提供商'
                    },
                    {
                        id: 'ai_apikey',
                        type: 'input',
                        label: 'AI API Key',
                        inputType: 'password',
                        placeholder: '请输入 API Key',
                        defaultValue: '',
                        visible: configs => !configs.use_custom_model,
                        hasValidateButton: true,
                        validateButtonText: '验证 Key'
                    },
                    {
                        id: 'ai_model',
                        type: 'select',
                        label: 'AI 模型',
                        options: [], // 动态加载
                        defaultValue: 'deepseek-ai/DeepSeek-V3',
                        visible: configs => !configs.use_custom_model,
                        hasRefreshButton: true,
                        refreshButtonText: '刷新列表'
                    },
                    {
                        id: 'use_custom_model',
                        type: 'checkbox',
                        label: '使用自定义模型',
                        defaultValue: false
                    },
                    {
                        id: 'custom_base_url',
                        type: 'input',
                        label: '自定义 API 地址',
                        placeholder: 'https://api.example.com/v1',
                        defaultValue: '',
                        visible: configs => !configs.use_custom_model && configs.ai_provider === 'custom'
                    },
                    {
                        id: 'custom_model_api_url',
                        type: 'input',
                        label: '自定义 API 地址',
                        placeholder: 'https://api.example.com/v1',
                        defaultValue: '',
                        visible: configs => Boolean(configs.use_custom_model)
                    },
                    {
                        id: 'custom_model_api_key',
                        type: 'input',
                        label: '自定义 API Key',
                        inputType: 'password',
                        placeholder: '请输入自定义 API Key',
                        defaultValue: '',
                        visible: configs => Boolean(configs.use_custom_model),
                        hasValidateButton: true,
                        validateButtonText: '验证 Key'
                    },
                    {
                        id: 'custom_model_id',
                        type: 'input',
                        label: '自定义模型ID',
                        placeholder: '输入模型ID，如 deepseek-ai/DeepSeek-V3',
                        defaultValue: '',
                        visible: configs => Boolean(configs.use_custom_model)
                    }
                ]
            }
        ]
    },
    {
        id: 'update_section',
        type: 'section',
        label: '更新配置',
        category: 'update',
        items: [
            {
                id: 'update_mode',
                type: 'radio',
                label: '更新方式',
                options: [
                    { value: 'auto', label: '自动' },
                    { value: 'manual', label: '手动' }
                ],
                defaultValue: 'auto',
                tips: '自动：功能级更新（版本号 X 位变化）弹窗提示，每个版本只弹一次；小修复（Y 位）与「同版本内容已更新」只在版本号处提示\n手动：一律不弹窗，仅在设置面板右上角版本号处提示，点击版本号可查看详情'
            }
        ]
    },
    {
        id: 'log_section',
        type: 'section',
        label: '日志配置',
        category: 'log',
        items: [
            {
                id: 'log_level_info',
                type: 'checkbox',
                label: '信息',
                inline: true,
                defaultValue: true
            },
            {
                id: 'log_level_error',
                type: 'checkbox',
                label: '错误',
                inline: true,
                defaultValue: true
            },
            {
                id: 'log_level_warn',
                type: 'checkbox',
                label: '警告',
                inline: true,
                defaultValue: true
            },
            {
                id: 'log_level_debug',
                type: 'checkbox',
                label: '调试',
                inline: true,
                // 开发模式默认开启调试日志，生产默认关闭
                // 用可选链访问 import.meta.env：Node（单测环境）下 import.meta.env 为 undefined 时不抛错
                defaultValue: () => Boolean(import.meta.env?.DEV)
            }
        ]
    }
]
// 动态页设置配置
export const dynamicSettingsConfig: SettingItemSchema[] = [
    {
        id: 'dynamic_section',
        type: 'section',
        label: '投稿视频',
        items: [
            {
                id: 'dynamic_video_link',
                type: 'input',
                label: '「投稿视频」链接',
                tips: '点击「投稿视频」选项后，填入当前浏览器地址栏链接，即可自动跳转至该链接',
                defaultValue: 'https://t.bilibili.com/?tab=video'
            }
        ]
    }
]
