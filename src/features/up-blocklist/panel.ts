/**
 * UP 主黑名单弹窗（纯 DOM）
 *
 * 入口是首页右下角的屏蔽按钮；弹窗负责「按 UID/空间链接添加 + 展示昵称/头像/粉丝/签名 + 移除」。
 * 打开弹窗才读库、添加才请求名片接口，关闭状态零开销。
 */
import { enablePopoverLightDismiss } from '@/utils/common'
import { LoggerService } from '@/services/logger.service'
import { listBlockedUps, fetchUpCard, saveBlockedUp, removeBlockedUp } from './store'
import { parseUidInput, formatFansCount } from './pure'
import type { BlockedUp } from './pure'
const logger = new LoggerService('UpBlocklist', { notify: false })
export interface BlocklistPanelOptions {
    /** 名单变化（添加/移除）后回调：刷新过滤用的昵称集合并重新扫描 */
    onChange: () => void
    /** 弹窗关闭后回调（从设置页进入时用它恢复设置状态） */
    onClose?: () => void
    /** 是否自带遮罩：从设置进入时传 false，复用设置弹窗那层，避免遮罩闪烁 */
    showOverlay?: boolean
}
export interface BlocklistPanelHandle {
    show: () => void
    destroy: () => void
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}
export const createBlocklistPanel = (options: BlocklistPanelOptions): BlocklistPanelHandle => {
    const popover = el('div', 'adj-blocklist-popover')
    popover.setAttribute('popover', '')
    popover.setAttribute('aria-label', 'UP 主黑名单')
    // 模板级开关：data-adj-overlay="false" 时不自带遮罩（与 createBlocklistPanel 的 showOverlay 等价）
    if (options.showOverlay === false) popover.setAttribute('data-adj-overlay', 'false')
    const header = el('div', 'adj-blocklist-header')
    const titleWrap = el('div', 'adj-blocklist-title-wrap')
    const back = el('button', 'adj-blocklist-back', '← 返回设置')
    back.type = 'button'
    back.addEventListener('click', () => popover.hidePopover())
    const title = el('h3', 'adj-blocklist-title', 'UP 主黑名单')
    titleWrap.append(back, title)
    header.appendChild(titleWrap)
    const close = el('button', 'adj-blocklist-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭黑名单弹窗')
    header.appendChild(close)
    const form = el('form', 'adj-blocklist-add')
    const input = el('input', 'adj-blocklist-input')
    input.type = 'text'
    input.placeholder = '输入 UID 或空间链接，例如 12345'
    input.setAttribute('aria-label', 'UP 主 UID 或空间链接')
    const submit = el('button', 'adj-blocklist-add-btn', '添加')
    submit.type = 'submit'
    form.append(input, submit)
    const hint = el('p', 'adj-blocklist-hint', '开启黑名单后，首页推荐里不再显示这些 UP 主的视频。卡片按昵称匹配，添加时会自动读取昵称与头像。')
    const search = el('input', 'adj-blocklist-input adj-blocklist-search')
    search.type = 'search'
    search.placeholder = '按昵称或 UID 筛选'
    search.setAttribute('aria-label', '筛选黑名单')
    search.hidden = true
    const status = el('div', 'adj-blocklist-status')
    status.setAttribute('role', 'status')
    const list = el('div', 'adj-blocklist-list')
    popover.append(header, form, hint, search, status, list)
    document.body.appendChild(popover)
    let lightDismissCleanup: (() => void) | null = null
    const setStatus = (text: string): void => {
        status.textContent = text
        status.hidden = !text
    }
    const renderItem = (up: BlockedUp): HTMLElement => {
        const item = el('div', 'adj-blocklist-item')
        item.dataset.uid = up.uid
        if (up.face) {
            const avatar = el('img', 'adj-blocklist-avatar')
            avatar.src = up.face
            avatar.alt = ''
            avatar.loading = 'lazy'
            item.appendChild(avatar)
        } else {
            item.appendChild(el('div', 'adj-blocklist-avatar adj-blocklist-avatar-empty', up.name.slice(0, 1)))
        }
        const main = el('div', 'adj-blocklist-main')
        main.appendChild(el('div', 'adj-blocklist-name', up.name))
        const meta = el('div', 'adj-blocklist-meta')
        meta.textContent = `UID ${up.uid} · ${formatFansCount(up.fans)} 粉丝`
        main.appendChild(meta)
        if (up.sign) main.appendChild(el('div', 'adj-blocklist-sign', up.sign))
        item.appendChild(main)
        const remove = el('button', 'adj-blocklist-remove', '移除')
        remove.type = 'button'
        remove.dataset.action = 'remove'
        remove.setAttribute('aria-label', `移除 ${up.name}`)
        item.appendChild(remove)
        return item
    }
    let current: BlockedUp[] = []
    const paint = (): void => {
        const keyword = search.value.trim().toLowerCase()
        const visible = keyword
            ? current.filter(up => up.name.toLowerCase().includes(keyword) || up.uid.includes(keyword))
            : current
        list.textContent = ''
        if (!current.length) {
            list.appendChild(el('div', 'adj-blocklist-empty', '名单是空的。粘贴 UP 主 UID 或空间链接，点「添加」。'))
            return
        }
        if (!visible.length) {
            list.appendChild(el('div', 'adj-blocklist-empty', '没有匹配的 UP 主'))
            return
        }
        for (const up of visible) list.appendChild(renderItem(up))
    }
    const refresh = async (): Promise<void> => {
        try {
            current = await listBlockedUps()
            title.textContent = current.length ? `UP 主黑名单（${current.length}）` : 'UP 主黑名单'
            search.hidden = current.length <= 8
            if (search.hidden) search.value = ''
            paint()
        } catch (error) {
            logger.warn('黑名单丨读取名单失败', error)
            setStatus('读取名单失败，稍后重试')
        }
    }
    const add = async (): Promise<void> => {
        const uid = parseUidInput(input.value)
        if (!uid) {
            setStatus('请输入有效的 UID 或 UP 主空间链接')
            return
        }
        const existing = await listBlockedUps()
        if (existing.some(up => up.uid === uid)) {
            setStatus('这位 UP 已经在名单里了')
            return
        }
        submit.disabled = true
        submit.textContent = '添加中…'
        setStatus('正在读取 UP 主信息…')
        try {
            const info = await fetchUpCard(uid)
            if (!info) {
                setStatus('没查到这位 UP，检查 UID 是否正确')
                return
            }
            await saveBlockedUp(info)
            input.value = ''
            setStatus(`已添加：${info.name}`)
            await refresh()
            options.onChange()
        } catch (error) {
            logger.warn('黑名单丨添加失败', error)
            setStatus('添加失败，请稍后再试')
        } finally {
            submit.disabled = false
            submit.textContent = '添加'
        }
    }
    form.addEventListener('submit', (event: Event) => {
        event.preventDefault()
        void add()
    })
    search.addEventListener('input', paint)
    list.addEventListener('click', (event: Event) => {
        const target = event.target as Element | null
        const button = target?.closest('[data-action="remove"]')
        if (!(button instanceof HTMLElement)) return
        const uid = (button.closest('.adj-blocklist-item') as HTMLElement | null)?.dataset.uid
        if (!uid) return
        void removeBlockedUp(uid).then(async () => {
            setStatus('已移除')
            await refresh()
            options.onChange()
        }).catch(error => {
            logger.warn('黑名单丨移除失败', error)
            setStatus('移除失败，请稍后再试')
        })
    })
    close.addEventListener('click', () => popover.hidePopover())
    let destroyed = false
    popover.addEventListener('toggle', (event: Event) => {
        if ((event as ToggleEvent).newState !== 'closed') return
        if (destroyed) return
        options.onClose?.()
    })
    return {
        show: (): void => {
            destroyed = false
            if (!popover.isConnected) document.body.appendChild(popover)
            if (!popover.matches(':popover-open')) {
                try { popover.showPopover() } catch { /* 浏览器不支持时退回普通显示 */ }
            }
            if (!lightDismissCleanup) lightDismissCleanup = enablePopoverLightDismiss(popover, { showOverlay: options.showOverlay })
            void refresh()
        },
        destroy: (): void => {
            destroyed = true
            lightDismissCleanup?.()
            lightDismissCleanup = null
            popover.remove()
        }
    }
}
