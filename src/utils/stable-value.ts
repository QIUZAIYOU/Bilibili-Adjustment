/**
 * 判断一个值是否已经稳定：与上一拍相同，且距上次变化已满 stableMs
 *
 * 用于「等 data-screen 稳定」这类轮询：第一次采样时变化时长为 0，
 * 只有连续 stableMs 没再变过才算可信（B 站水合阶段会先渲染旧模式再重置）。
 */
export const isStableValue = (previous: string | null, current: string | null, sinceChangeAt: number, now: number, stableMs: number): boolean => {
    if (current === null || current === '') return false
    if (previous !== current) return false
    if (!Number.isFinite(now) || !Number.isFinite(sinceChangeAt)) return false
    return now - sinceChangeAt >= stableMs
}
