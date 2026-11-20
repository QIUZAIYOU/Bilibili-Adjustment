/**
 * UP 主黑名单（全站）入口
 *
 * 由 main.ts 在 APP_READY 前按配置初始化：
 * - 全站视频卡片按「空间链接 UID → 作者昵称」过滤；
 * - 空间页命中名单时盖上监狱门遮罩，临时查看写 sessionStorage（30 分钟）；
 * - 管理弹窗由设置页「管理名单」按钮打开，关闭功能也能打开（用于预先维护名单）。
 */
import { insertStyleToDocument } from '@/utils/common'
import { upBlocklistStyles } from '@/shared/styles/up-blocklist'
import { listBlockedUps } from './store'
import { createBlockedCardFilter } from './filter'
import type { CardFilterHandle } from './filter'
import { createBlocklistPanel } from './panel'
import type { BlocklistPanelHandle } from './panel'
import { getSpaceUid, isJailUnlocked, showJail } from './jail'
import type { JailHandle } from './jail'
interface BlocklistState {
    uids: Set<string>
    names: Set<string>
    filter: CardFilterHandle
    jail: JailHandle | null
}
let state: BlocklistState | null = null
let panel: BlocklistPanelHandle | null = null
let stylesInjected = false
const ensureStyles = (): void => {
    if (stylesInjected) return
    stylesInjected = true
    insertStyleToDocument({ UpBlocklistStyle: upBlocklistStyles })
}
/** 重新读库并刷新过滤集合；空间门禁同时按新名单重算 */
const reloadBlocked = async (): Promise<void> => {
    const ups = await listBlockedUps()
    if (!state) return
    state.uids = new Set(ups.map(up => up.uid))
    state.names = new Set(ups.map(up => up.name))
    state.filter.rescan()
    applyJail()
}
/** 当前页若是命中黑名单的空间页（且未临时解锁），就上锁 */
const applyJail = (): void => {
    if (!state) return
    const uid = getSpaceUid(location.hostname, location.pathname)
    if (!uid || !state.uids.has(uid) || isJailUnlocked(uid)) return
    if (state.jail) return
    state.jail = showJail(uid, () => {
        state?.jail?.destroy()
        if (state) state.jail = null
    })
}
/** 设置页「管理名单」按钮调用；功能关闭时也可打开 */
let panelOnClose: (() => void) | null = null
export const openUpBlocklistPanel = (options: { onClose?: () => void, showOverlay?: boolean } = {}): void => {
    ensureStyles()
    panelOnClose = options.onClose ?? null
    if (!panel) {
        panel = createBlocklistPanel({
            showOverlay: options.showOverlay,
            onChange: () => { void reloadBlocked() },
            onClose: () => {
                const callback = panelOnClose
                panelOnClose = null
                callback?.()
            }
        })
    }
    panel.show()
}
/** 按配置启用/停用全站黑名单 */
export const initUpBlocklistFeature = async (): Promise<void> => {
    ensureStyles()
    destroyUpBlocklistFeature()
    const ups = await listBlockedUps()
    const next = {
        uids: new Set(ups.map(up => up.uid)),
        names: new Set(ups.map(up => up.name)),
        filter: null as unknown as CardFilterHandle,
        jail: null as JailHandle | null
    }
    next.filter = createBlockedCardFilter(() => ({ uids: next.uids, names: next.names }))
    state = next
    next.filter.rescan()
    applyJail()
}
export const destroyUpBlocklistFeature = (): void => {
    state?.filter.stop()
    state?.jail?.destroy()
    state = null
}
