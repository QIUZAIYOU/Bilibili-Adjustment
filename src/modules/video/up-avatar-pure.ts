/**
 * 侧栏「UP主空间」头像按钮的纯逻辑（零副作用 → 便于单测）
 *
 * 数据来源有两处，形状不一样（接口返回 / sessionStorage 里的 B 站原始数据），
 * 这里统一收口成一个 `UpOwnerInfo`，调用点就不用各自判空了。
 */
/** UP 主信息（mid / 昵称 / 头像地址） */
export interface UpOwnerInfo {
    /** UP 主 mid（进空间用） */
    mid?: string | number
    /** UP 主昵称（悬浮提示用） */
    name?: string
    /** 头像地址（http(s)） */
    face?: string
}
/**
 * 从任意来源的 UP 主数据里取出 mid / 昵称 / 头像
 *
 * @param raw 接口返回的 `owner` 或 sessionStorage 里 B 站写的 `owner`
 */
export const normalizeUpOwner = (raw: unknown): UpOwnerInfo => {
    if (!raw || typeof raw !== 'object') return {}
    const source = raw as Record<string, unknown>
    const rawMid = source.mid
    const mid = typeof rawMid === 'number'
        ? rawMid
        : typeof rawMid === 'string' && rawMid.trim() ? rawMid.trim() : undefined
    const name = typeof source.name === 'string' ? source.name.replace(/\s+/g, ' ').trim() : ''
    const face = typeof source.face === 'string' ? source.face.trim() : ''
    return {
        mid,
        name: name || undefined,
        face: face || undefined
    }
}
/**
 * 头像直径：与**当前那颗按钮**等宽
 *
 * 侧栏按钮的宽度由 B 站自己的样式决定（同一套类名 → 同一个盒子），
 * 所以直接量那颗按钮的实际渲染宽度即可，不必写死数值（写死就会随 B 站改版跑偏）。
 * @param width 量到的按钮宽度（px）
 * @param fallback 量不到时的兜底宽度
 */
export const resolveAvatarSize = (width: number, fallback = 50): number => {
    const value = typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : fallback
    // 夹一下范围：避免 B 站样式异常时算出离谱的尺寸（太小的头像看不清，太大的会撑破侧栏）
    return Math.min(64, Math.max(24, Math.round(value)))
}
/**
 * 悬浮提示文案：作者昵称（取不到时用「UP主空间」）
 */
export const resolveAvatarTip = (name?: string): string => {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : ''
    return text || 'UP主空间'
}
