/**
 * 「视频简介君」头像：远程 → localStorage → 内置兜底，三级取值。
 *
 * 为什么不能直接用 <img src="https://…">：B 站页面的 CSP 不允许外域图（v3.23.2 曾因
 * 「外部图片 CSP 违规」改为内联 base64，从此写死、无法跟随后台换图）。故改为运行时
 * fetch 后转 data URI —— data: 已被 CSP 放行（现有内联头像能正常显示即是证明）。
 * fetch 需要该路径返回 CORS 头；任何一步失败都沿用缓存/内置值，绝不置空头像。
 */
import { LoggerService } from '@/services/logger.service'
// 网络瞬时失败/服务器缺 CORS 不该弹通知条打扰用户：失败只进控制台
const logger = new LoggerService('DescriptionAvatar', { notify: false })
/** 远程头像地址（服务器 /Stylish/bilibili/ 下；该路径需带 Access-Control-Allow-Origin 才能 fetch） */
export const DESCRIPTION_AVATAR_URL = 'https://www.asifadeaway.com/Stylish/bilibili/avatar-description.png'
const CACHE_KEY = 'bili-adjustment-description-avatar'
/** 内置兜底头像（64×64 PNG data URI）：首次运行且远程不可用时保证头像不空白 */
export const EMBEDDED_DESCRIPTION_AVATAR = 'data:image/png;base64,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'
let memoryAvatar = ''
let refreshing = false
/**
 * 同步取当前最佳头像：内存 → localStorage → 内置兜底。
 * 插入评论必须同步完成（否则先空白再补图会闪），网络请求一律交给 refreshDescriptionAvatar。
 */
export const getDescriptionAvatarSync = (): string => {
    if (memoryAvatar) return memoryAvatar
    try {
        const stored = localStorage.getItem(CACHE_KEY)
        if (stored && stored.startsWith('data:image/')) {
            memoryAvatar = stored
            return memoryAvatar
        }
    } catch { /* localStorage 不可用：直接回落内置头像 */ }
    memoryAvatar = EMBEDDED_DESCRIPTION_AVATAR
    return memoryAvatar
}
const blobToDataUri = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取头像数据失败'))
    reader.readAsDataURL(blob)
})
/** 后台拉取远程头像；成功后写缓存并回调替换已插入的头像，失败保留当前值（不置空） */
export const refreshDescriptionAvatar = async (apply?: (dataUri: string) => void): Promise<void> => {
    if (refreshing) return
    refreshing = true
    try {
        // no-store：服务器给了 30 天 Cache-Control，但后台换图后应尽快生效
        const response = await fetch(DESCRIPTION_AVATAR_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const blob = await response.blob()
        if (!blob.type.startsWith('image/')) throw new Error('响应不是图片：' + blob.type)
        const dataUri = await blobToDataUri(blob)
        const changed = dataUri !== getDescriptionAvatarSync()
        memoryAvatar = dataUri
        try {
            localStorage.setItem(CACHE_KEY, dataUri)
        } catch { /* 头像较大，超配额时仅本次会话生效 */ }
        if (changed) {
            apply?.(dataUri)
            logger.debug('简介君头像已更新为远程版本')
        }
    } catch (error) {
        logger.warn('远程头像获取失败（沿用缓存/内置头像）:', error instanceof Error ? error.message : String(error))
    } finally {
        refreshing = false
    }
}
