/**
 * 主题 token 词典（单一事实来源）
 *
 * 设计约定（详见 docs/theme-system.md）：
 * - 所有样式代码只引用 CSS 变量 var(--adj-*)，禁止出现字面色值；
 * - 颜色 token 按「语义」命名，不写物理色名；变量名前缀统一 --adj-，避免与 B 站官方变量冲突；
 * - colors 组生成 --adj-<name>；其余组生成 --adj-<group>-<key>（space/radius/font/shadow/motion/z）；
 * - 品牌/状态色附带 *-rgb 通道 token，供 rgba(var(--adj-brand-rgb), 0.x) 拼透明叠加；
 * - 浮白/浮黑叠加（hover 提亮、内嵌底）语义化为 bg-subtle/bg-hover/bg-active，随主题反转；
 * - 空间/圆角/字号/过渡/层级三主题一致（不变），颜色随主题切换。
 */
/**
 * 公共（不随主题变化）token：间距/圆角/字号/过渡/层级
 * 阴影值在主题间可微调（浅色主题阴影透明度通常更低），因此归入颜色主题文件
 */
export const sharedTokens = {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', xxl: '24px', xxxl: '32px' },
    borderRadius: {
        xs: '4px', // 小徽标/删除钮等（原 3/4px 归并）
        sm: '6px',
        md: '8px',
        card: '10px', // 设置卡片/更新条目等（原 10px）
        lg: '12px',
        xl: '16px',
        full: '9999px'
    },
    fontSize: {
        xs: '11px',
        sm: '12px',
        base: '14px',
        md: '15px',
        lg: '16px',
        xl: '18px',
        xxl: '20px',
        xxxl: '24px'
    },
    transitions: {
        fast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        normal: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        slow: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        bounce: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    },
    zIndex: {
        overlay: 9,
        popover: 10,
        header: 100,
        tooltip: 999999,
        notification: 999999
    }
}
/**
 * 夜间哔哩（night）：现有样式的语义化整理 —— 色值 = 重构前全仓核对值，视觉零回归
 * 此为默认主题，也是 light/dark 的取值基准
 */
export const defaultColors = {
    // 品牌
    brand: '#00a1d6',
    'brand-hover': '#00b8e6',
    'brand-rgb': '0, 161, 214',
    'on-brand': '#fff',
    // B 站官方点缀粉（付费标等，三主题一致；官方 css 到位后可校准）
    pink: '#fb7299',
    // 背景层级（自建 UI）
    'bg-page': '#212121', // 弹窗/浮层最外层底
    'bg-surface': '#2c2c2c', // 卡片/控件面
    'bg-surface-hover': '#333', // 卡片/简单 hover 提亮（原 #323232/#333 归并）
    'bg-input': '#212121', // 输入框/内嵌底（叠在卡片上更深）
    'bg-tooltip': '#1a1a1a', // tooltip/浮动提示底
    // 浮层叠加（浅色主题下反转）
    'bg-subtle': 'rgba(255,255,255,0.04)', // 弱内嵌底/分段底
    'bg-hover': 'rgba(255,255,255,0.08)', // 常规 hover 高亮
    'bg-active': 'rgba(255,255,255,0.12)', // 强 hover/选中高亮
    // 滚动条滑块（伪元素不继承自定义属性，故主题值取实色）
    'scrollbar-thumb': '#333',
    'scrollbar-thumb-hover': '#444',
    'bg-dim': 'rgba(0,0,0,0.15)', // 折叠面板收起底等
    // 遮罩
    'bg-scrim': 'rgba(0,0,0,0.55)', // 全屏遮罩（原 0.5/0.55/0.6 归并）
    'bg-scrim-strong': 'rgba(0,0,0,0.7)', // 深遮罩/弹窗阴影
    // 开关轨道（关闭态底色，随主题适配）
    'switch-track': '#555',
    'switch-track-hover': '#666',
    // 文字阶梯
    'text-strong': '#fff', // 标题/强调/徽标字
    'text-primary': '#f0f0f0', // 主文字
    'text-secondary': '#ccc', // 次级正文（原 #ccc/#ddd/#e0e0e0 归并）
    'text-soft': '#999', // 弱说明（原 #999/#aaa 归并）
    'text-muted': '#888', // 图标/辅助（原 #888/#868686 归并）
    'text-disabled': '#666', // 禁用/占位
    'text-faint': '#555', // 更弱
    // 边框
    'border-strong': '#424242', // 常规元素边框（theme.colors.border）
    'border': '#333', // 浅分隔/内嵌边
    'border-hover': '#444',
    'border-subtle': 'rgba(255,255,255,0.06)', // 弱分隔线（header/footer 边界等）
    // 状态（element-plus 系统一板，见方案 §4.2/R4 归并记录）
    success: '#2ed573',
    'success-rgb': '46, 213, 115',
    warning: '#e6a23c',
    'warning-rgb': '230, 162, 60',
    danger: '#f56c6c', // 危险操作/删除/错误（原 #f56c6c/#ff4757/#e56b6b 归并）
    'danger-rgb': '245, 108, 108'
}
/** 各主题阴影（浅色主题可降低黑色透明度；night 沿用现状） */
export const defaultShadows = {
    sm: '0 1px 3px rgba(0,0,0,0.3)',
    md: '0 4px 12px rgba(0,0,0,0.4)',
    lg: '0 8px 24px rgba(0,0,0,0.5)',
    xl: '0 16px 48px rgba(0,0,0,0.6)',
    float: '0 8px 24px rgba(0,0,0,0.6)', // tooltip/浮动提示等
    dialog: '0 24px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)',
    glow: '0 0 16px rgba(0,161,214,0.3)',
    glowStrong: '0 0 24px rgba(0,161,214,0.5)',
    ring: '0 0 0 3px rgba(0,161,214,0.15)'
}
/** 校验：颜色 token 键清单（新增 token 必须同步注册） */
export const colorTokenKeys = Object.keys(defaultColors)
