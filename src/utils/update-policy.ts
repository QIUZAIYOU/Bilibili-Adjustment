/**
 * 更新提示策略（纯函数，零依赖 → 便于单测）
 *
 * 背景：更新链路完全自建（拉 meta.js/package.json 比版本号 → 弹窗或版本号处常驻提示 → 打开 user.js 由
 * 脚本管理器安装），所以「版本号」既是唯一的发现键，也是用户点安装时脚本管理器比较的依据。
 * 两条结论：
 * 1) 对外发布过内容就应该升版本号（Y 位补丁 / X 位功能），「同版本覆盖发布」只作应急；
 * 2) 小修复不该反复打断用户 —— 弹窗只留给功能级更新，补丁级与「同版本内容已更新」只走常驻提示。
 */
/** 版本号核心段（major / minor / patch）；预发布后缀（-beta.1）不参与 */
export const parseCoreVersion = (version: string): number[] =>
    String(version).split('-')[0].split('.').map(part => parseInt(part, 10) || 0)
/**
 * 是否属于「功能级更新」：major 或 minor（X 位）变化 → 允许弹窗。
 * 仅 patch（Y 位）变化视为小修复 → 不弹窗，只在版本号处常驻提示。
 */
export const isFeatureLevelUpdate = (current: string, latest: string): boolean => {
    const curr = parseCoreVersion(current)
    const last = parseCoreVersion(latest)
    return (last[0] || 0) !== (curr[0] || 0) || (last[1] || 0) !== (curr[1] || 0)
}
/** 本地构建标识是否可用于比对（构建期未注入 / 工作区脏 / 未知时一律不比对，避免误报） */
export const isComparableBuildSha = (sha: unknown): boolean =>
    typeof sha === 'string' && sha.length > 0 && sha !== 'unknown' && !sha.endsWith('-dirty')
/**
 * 同版本但线上构建不同：服务器上的文件被「同版本覆盖发布」过，
 * 此时版本号比对恒为「已是最新」，只能靠构建标识让用户感知到需要重新安装。
 */
export const isSameVersionRebuild = (localSha: unknown, remoteSha: unknown): boolean =>
    isComparableBuildSha(localSha) && isComparableBuildSha(remoteSha) && localSha !== remoteSha
/**
 * 「同版本覆盖发布」的完整判据：**版本号必须真的相同** + 构建标识不同。
 *
 * ⚠️ 只比构建标识会误判（2026-09-18 用户报的形态）：用户刚从 vX-1 升到 vX，而这一轮检查读到的
 * meta.js 是**浏览器 HTTP 缓存里的旧副本**（服务器只给 ETag/Last-Modified，没有 Cache-Control，
 * 浏览器会按启发式规则缓存），于是「线上 vX-1 不比本地新 + 构建标识不同」→ 被当成同版本覆盖发布，
 * **刚升级完的用户反而被提示「内容已更新，点击重新安装」**。
 * 同版本覆盖发布的语义本来就是「版本号没变」，所以版本不等时一律不是。
 */
export const isSameVersionRepublish = (currentVersion: string, latestVersion: string, localSha: unknown, remoteSha: unknown): boolean =>
    currentVersion === latestVersion && isSameVersionRebuild(localSha, remoteSha)
/**
 * 版本号处「常驻提示」的文案（纯函数，便于单测）
 * - 有新版本：`- 有新版本 vX -`，只陈述状态、不写「点击查看」——提示本就挂在可点击的版本号下方；
 * - 同版本覆盖发布：版本号没变，必须明确告诉用户要重新安装（否则用户无从感知）；
 * - 两者都没有 → 空串（调用方不显示提示）。
 */
export const formatPendingUpdateHint = (pendingVersion: string | null | undefined, rebuilt: boolean): string => {
    if (pendingVersion) return `- 有新版本 v${pendingVersion} -`
    return rebuilt ? '内容已更新，点击重新安装' : ''
}
/** package.json 里的发布信息（GitHub raw / 各镜像同源） */
export interface PackageInfo {
    version: string
    updates: string
}
/** 脚本元数据里的发布信息（自有服务器 meta.js：一份文件同时给出三个信号） */
export interface ScriptMetaInfo extends PackageInfo {
    /** 产物元数据 `@build-sha`；同版本覆盖发布检测用，缺失为空串 */
    sha: string
}
/** 解析 package.json 文本 */
export const parsePackageInfo = (text: unknown): PackageInfo | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    try {
        const data = JSON.parse(text) as { version?: unknown; updates?: unknown } | null
        if (!data || typeof data !== 'object') return null
        const version = typeof data.version === 'string' ? data.version.trim() : ''
        if (!version) return null
        return { version, updates: typeof data.updates === 'string' ? data.updates : '' }
    } catch {
        return null
    }
}
/**
 * 解析用户脚本元数据（`// @version` / `// @updates` / `// @build-sha`）
 * 自有服务器 meta.js 与我们自己的产物同构，故只认这几个字段。
 */
export const parseScriptMetaInfo = (text: unknown): ScriptMetaInfo | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    const version = text.match(/\/\/\s*@version\s+([\d.]+)/)?.[1]?.trim() || ''
    if (!version) return null
    return {
        version,
        updates: text.match(/\/\/\s*@updates\s+(.+)/)?.[1]?.trim() || '',
        sha: text.match(/\/\/\s*@build-sha\s+(\S+)/)?.[1]?.trim() || ''
    }
}
/**
 * 解析 Gitee API 的 contents 响应（`/api/v5/repos/{owner}/{repo}/contents/package.json`）
 *
 * Gitee raw **不能**用：既不返回 CORS 头（页面读不到），又以 text/plain 返回 .js（script 标签也被 MIME 拦下）；
 * API 则返回 CORS `*`，代价是文件内容以 base64 放在 `content` 字段，需要自己解码。
 * base64 → 文本必须按 UTF-8 解码（updates 含中文，直接 atob 会乱码）。
 */
export const parseGiteeContentsInfo = (text: unknown): PackageInfo | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    try {
        const data = JSON.parse(text) as { content?: unknown; encoding?: unknown } | null
        if (!data || typeof data !== 'object') return null
        const content = typeof data.content === 'string' ? data.content : ''
        if (!content) return null
        if (data.encoding !== 'base64') return parsePackageInfo(content)
        const binary = atob(content.replace(/\s/g, ''))
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
        return parsePackageInfo(new TextDecoder('utf-8').decode(bytes))
    } catch {
        return null
    }
}
/** 服务器发布的构建信息（version.json，upload.py 生成的完整性记录） */
export interface RemoteBuildInfo {
    version: string
    sha: string
    builtAt: string
}
/**
 * 解析 version.json（发布时由 scripts/upload.py 生成并上传）
 * @param {string} text version.json 内容
 * @returns {RemoteBuildInfo | null} 解析失败或缺少 version 时返回 null（调用方按「拿不到构建信息」处理）
 */
export const parseRemoteBuildInfo = (text: unknown): RemoteBuildInfo | null => {
    if (typeof text !== 'string' || !text.trim()) return null
    try {
        const data = JSON.parse(text) as Record<string, unknown> | null
        if (!data || typeof data !== 'object') return null
        const version = typeof data.version === 'string' ? data.version.trim() : ''
        if (!version) return null
        return {
            version,
            sha: typeof data.sha === 'string' ? data.sha.trim() : '',
            builtAt: typeof data.builtAt === 'string' ? data.builtAt.trim() : ''
        }
    } catch {
        return null
    }
}
