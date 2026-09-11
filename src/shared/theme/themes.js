/**
 * 主题定义：night（夜间哔哩·默认）/ light（浅色·官方对齐）/ dark（深色·官方对齐）
 *
 * 色值来源：
 * - night：脚本既有自研配色（重构前全仓核对值，视觉零回归，tokens.js）；
 * - light / dark：完全对齐 B 站官方 @bilibili/bili-theme(v12.0.0) 色值
 *   （src/shared/styles/bili-theme/ 下的官方 CSS，勿改动该目录）。
 *   - dark 模式 = dark.css（无后缀变量）
 *   - light 模式 = light_u.css（*_u 后缀变量）
 *   - 语义对应关系 = map.css（如 text1=Ga10、bg1_float=Ga11、line_regular=Ga2、
 *     brand_blue=Lb5、success_green=Gr5、stress_red=Re5、operate_orange=Or5 等）
 *   每行注释标注对应官方变量，便于后续随官方版本校准。
 *
 * 结构：{ id, label, colors: { <token>: 值 }, shadows: { <key>: 完整 box-shadow } }
 * sharedTokens（spacing/borderRadius/fontSize/transitions/zIndex）三主题一致，不在此重复。
 */
import { sharedTokens, defaultColors, defaultShadows } from './tokens'
export const night = {
    id: 'night',
    label: '夜间哔哩',
    colors: defaultColors,
    shadows: defaultShadows,
    shared: sharedTokens
}
// ==================== light（浅色，对齐官方 light_u.css） ====================
export const light = {
    id: 'light',
    label: '浅色（官方）',
    colors: {
        // 品牌：brand_blue → Lb5_u；hover 取官方更亮一阶 Lb4_u（官方无 hover token）
        brand: '#00AEEC', // light_u.css --Lb5_u
        // 进度条片段染色：官方蓝色系更深一档（浅色下仍保证可辨识）
        'progress-tint': '#008AC5',
        'brand-hover': '#40C5F1', // light_u.css --Lb4_u
        'brand-rgb': '0,174,236', // light_u.css --Lb5_u_rgb
        'on-brand': '#FFFFFF', // map.css text_white → Wh0_u（恒白）
        // B 站官方点缀粉：brand_pink → Pi5_u
        pink: '#FF6699', // light_u.css --Pi5_u
        // 浮层/弹窗背景：bg1_float → Ga11_u
        'bg-page': '#FFFFFF', // light_u.css --Ga11_u
        'bg-surface': '#F1F2F3', // bg2_float → Ga12_u
        'bg-surface-hover': '#E3E5E7', // 官方 light 无 *_s 层级，hover 取 line_regular → Ga2_u
        'bg-input': '#FFFFFF', // Wh0_u（输入框白底）
        'bg-tooltip': '#FFFFFF', // Ga11_u（浅色浮层底）
        'bg-subtle': '#F6F7F8', // Ga0_u（弱行底，light 页面级背景）
        'bg-hover': '#E3E5E7', // Ga2_u
        'bg-active': '#C9CCD0', // Ga3_u（强按压/选中容器）
        'bg-dim': 'rgba(0,0,0,0.05)', // 通道取自官方 shadow=Ba0_rgb(0,0,0)
        'bg-scrim': 'rgba(0,0,0,0.45)',
        'bg-scrim-strong': 'rgba(0,0,0,0.6)',
        // 开关轨道/滚动条滑块：官方灰阶（light 浅色装饰）
        'switch-track': '#C9CCD0', // Ga3_u
        'switch-track-hover': '#AEB3B9', // Ga4_u
        'scrollbar-thumb': '#C9CCD0', // Ga3_u
        'scrollbar-thumb-hover': '#AEB3B9', // Ga4_u
        // 文字：text1~text4 → Ga10_u/Ga7_u/Ga5_u/Ga3_u（官方 4 档灰阶）
        'text-strong': '#18191C', // text1 → Ga10_u
        'text-primary': '#18191C', // text1 → Ga10_u
        'text-secondary': '#61666D', // text2 → Ga7_u
        'text-soft': '#9499A0', // text3 → Ga5_u
        'text-muted': '#9499A0', // 图标/辅助文字，官方 text3 档
        'text-disabled': '#C9CCD0', // text4 → Ga3_u
        'text-faint': '#C9CCD0', // 占位符，text4 档
        // 页面内容正文（插入 B 站页面的内容块）：主文本=text1、副文本=text2
        'text-content': '#18191C', // 正文主文本 → text1 → Ga10_u
        'text-content-secondary': '#61666D', // 正文副文本 → text2 → Ga7_u
        // 边框：line_light/regular/bold → Ga1_u/Ga2_u/Ga3_u（light 无 *_s，逐档对应）
        'border-strong': '#C9CCD0', // line_bold → Ga3_u（主描边/输入框强边）
        'border': '#E3E5E7', // line_regular → Ga2_u（常用分隔）
        'border-hover': '#AEB3B9', // Ga4_u（hover 加深）
        'border-subtle': '#F1F2F3', // line_light → Ga1_u（细分隔，比 line_regular 更弱）
        // 状态：map.css 语义 success_green/operate_orange/stress_red
        success: '#2AC864', // Gr5_u
        'success-rgb': '42,200,100', // Gr5_u_rgb
        warning: '#FF7F24', // Or5_u（operate_orange）
        'warning-rgb': '255,127,36', // Or5_u_rgb
        danger: '#F85A54', // Re5_u（stress_red）
        'danger-rgb': '248,90,84' // Re5_u_rgb
    },
    shadows: {
        // 阴影色通道一律取官方 shadow=Ba0_rgb(0,0,0)；alpha 为浅色观感值
        sm: '0 1px 3px rgba(0,0,0,0.12)',
        md: '0 4px 12px rgba(0,0,0,0.1)',
        lg: '0 8px 24px rgba(0,0,0,0.12)',
        xl: '0 16px 48px rgba(0,0,0,0.14)',
        float: '0 8px 24px rgba(0,0,0,0.12)',
        dialog: '0 24px 48px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
        glow: '0 0 16px rgba(0,174,236,0.3)', // 品牌通道 Lb5_u_rgb
        glowStrong: '0 0 24px rgba(0,174,236,0.35)',
        ring: '0 0 0 3px rgba(0,174,236,0.18)'
    },
    shared: sharedTokens
}
// ==================== dark（深色，对齐官方 dark.css） ====================
export const dark = {
    id: 'dark',
    label: '深色（官方）',
    colors: {
        // 品牌：brand_blue → Lb5；hover 取官方更亮一阶 Lb6（官方无 hover token）
        brand: '#0087BD', // dark.css --Lb5
        // 进度条片段染色：官方蓝色系更深一档
        'progress-tint': '#00699D',
        'brand-hover': '#2C9CC8', // dark.css --Lb6
        'brand-rgb': '0,135,189', // dark.css --Lb5_rgb
        'on-brand': '#FFFFFF', // map.css text_white（恒白）
        pink: '#D44E7D', // dark.css --Pi5
        // 浮层/弹窗背景：bg1_float → Ga11
        'bg-page': '#242628', // dark.css --Ga11
        'bg-surface': '#1F2022', // bg2_float → Ga12
        'bg-surface-hover': '#2B2C2F', // graph_bg_thin_float → Ga12_s
        'bg-input': '#1A1B1D', // bg3_float → Ga13（输入内嵌更深）
        'bg-tooltip': '#2B2C2F', // Ga12_s（浮层提亮）
        'bg-subtle': '#1E2022', // graph_bg_thin → Ga0_s（行/分段底）
        'bg-hover': '#2B2C2F', // Ga12_s
        'bg-active': '#2F3134', // Ga2
        'bg-dim': 'rgba(0,0,0,0.4)', // 通道取自官方 shadow=Ba0_rgb
        'bg-scrim': 'rgba(0,0,0,0.6)',
        'bg-scrim-strong': 'rgba(0,0,0,0.75)',
        'switch-track': '#46494D', // Ga3
        'switch-track-hover': '#5E6267', // Ga4
        'scrollbar-thumb': '#46494D', // Ga3
        'scrollbar-thumb-hover': '#5E6267', // Ga4
        // 文字：text1~text4 → Ga10/Ga7/Ga5/Ga3
        'text-strong': '#E7E9EB', // text1 → Ga10
        'text-primary': '#E7E9EB', // text1 → Ga10
        'text-secondary': '#A2A7AE', // text2 → Ga7
        'text-soft': '#757A81', // text3 → Ga5
        'text-muted': '#757A81', // 官方 text3 档
        'text-disabled': '#46494D', // text4 → Ga3
        'text-faint': '#46494D', // text4 档
        // 页面内容正文（插入 B 站页面的内容块）：主文本=text1、副文本=text2
        'text-content': '#E7E9EB', // 正文主文本 → text1 → Ga10
        'text-content-secondary': '#A2A7AE', // 正文副文本 → text2 → Ga7
        // 边框：line_light/regular/bold → Ga1_s/Ga2/Ga3
        'border-strong': '#46494D', // line_bold → Ga3
        'border': '#2F3134', // line_regular → Ga2
        'border-hover': '#5E6267', // Ga4
        'border-subtle': '#232527', // line_light → Ga1_s
        success: '#1FA251', // Gr5
        'success-rgb': '31,162,81', // Gr5_rgb
        warning: '#D66011', // Or5
        'warning-rgb': '214,96,17', // Or5_rgb
        danger: '#D1403E', // Re5
        'danger-rgb': '209,64,62' // Re5_rgb
    },
    shadows: {
        // 阴影色通道一律取官方 shadow=Ba0_rgb(0,0,0)；alpha 为深色观感值
        sm: '0 1px 3px rgba(0,0,0,0.5)',
        md: '0 4px 12px rgba(0,0,0,0.5)',
        lg: '0 8px 24px rgba(0,0,0,0.6)',
        xl: '0 16px 48px rgba(0,0,0,0.65)',
        float: '0 8px 24px rgba(0,0,0,0.6)',
        dialog: '0 24px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.6)',
        glow: '0 0 16px rgba(0,135,189,0.35)', // 品牌通道 Lb5_rgb
        glowStrong: '0 0 24px rgba(0,135,189,0.5)',
        ring: '0 0 0 3px rgba(0,135,189,0.25)'
    },
    shared: sharedTokens
}
/** 主题注册表（id → theme）；新增主题在此登记 */
export const THEMES = { night, light, dark }
export const THEME_LIST = Object.values(THEMES)
