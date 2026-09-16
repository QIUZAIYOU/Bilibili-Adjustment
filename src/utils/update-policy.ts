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
/** 服务器发布的构建信息（version.json） */
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
