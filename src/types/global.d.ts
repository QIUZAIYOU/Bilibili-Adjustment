/**
 * 全局类型补丁
 *
 * 本文件是**非模块 d.ts**（不含顶层 import/export），其中所有声明均视为全局声明。
 * 用途：为「源码无法自行推导、由运行环境注入」的东西提供最小可用类型，
 * 避免迁移到 .ts 时靠满仓 `as any` 绕过编译错误。
 * 新增声明前请确认：该值确实由外部注入（B 站页面 / 用户脚本管理器 / 构建工具），
 * 而不是本项目自己在 src 内定义的类型（后者应放在定义处或用 `export type` 导出）。
 */
/** B 站页面注入的初始状态对象（window.__INITIAL_STATE__） */
interface BiliInitialState {
    /** 普通视频页数据；官方结构随版本变化，业务侧按需收窄 */
    videoData?: Record<string, unknown>
    /** 番剧页剧集信息；官方结构随版本变化，业务侧按需收窄 */
    epInfo?: Record<string, unknown>
    /** 官方可能注入的其它字段，勿依赖具体形状 */
    [key: string]: unknown
}
interface Window {
    /** 播放页/番剧页由 B 站服务端注入的初始状态（读不到时为 undefined） */
    __INITIAL_STATE__?: BiliInitialState
    /** 开发模式（import.meta.env.DEV）下由 template-registry 暴露的调试句柄，生产环境不存在 */
    __TemplateRegistry__?: {
        registry: Map<string, unknown>
        usageStats: Map<string, unknown>
        templateVersions: Map<string, number>
        exportRegistry: () => unknown
        getUsageReport: () => unknown
        getUnusedTemplates: () => unknown
    }
    /** 开发模式（import.meta.env.DEV）下由 src/shared/perf.ts 暴露的埋点入口，生产环境不存在 */
    BA_PERF?: {
        getPerfRecords: () => unknown[]
        getPerfSummary: () => unknown[]
    }
}
/** 用户脚本管理器提供的原生页面 window（vite.config.js userscript.grant 含 unsafeWindow） */
declare const unsafeWindow: Window & typeof globalThis
/** vite 注入的环境变量 */
interface ImportMetaEnv {
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
    readonly BASE_URL: string
}
/**
 * vite 用 `import.meta.env` 注入环境变量，但 Node 单测环境下 `import.meta.env` 为 undefined
 * （见 src/services/logger.service.js、src/shared/perf.js 的可选链访问），故声明为可选。
 */
interface ImportMeta {
    readonly env?: ImportMetaEnv
}
