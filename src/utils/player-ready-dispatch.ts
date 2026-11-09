/** 同一视频元素、同一 src 的重复「可播放」派发去重窗口 */
export const PLAYER_READY_DEDUPE_MS = 5000
export interface PlayerReadyDispatch {
    video: unknown
    src: string
    at: number
}
/**
 * 是否派发「视频可播放」
 *
 * B 站清理 URL、重新赋值 src 时会连发多次 canplaythrough；每派发一次就开新代次，
 * 模式与定位会跟着重跑一遍。同一元素、同一 src 在窗口内只认第一次，
 * 元素或 src 变了（切集/换视频）则立即允许。
 */
export const shouldDispatchPlayerReady = (previous: PlayerReadyDispatch | null | undefined, next: PlayerReadyDispatch, now = Date.now(), windowMs = PLAYER_READY_DEDUPE_MS): boolean => {
    if (!previous || !previous.video || !next.video) return true
    if (previous.video !== next.video) return true
    if (previous.src !== next.src) return true
    if (!Number.isFinite(previous.at) || !Number.isFinite(now)) return true
    return now - previous.at >= windowMs
}
