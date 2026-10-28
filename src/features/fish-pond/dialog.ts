/**
 * 「鱼塘」弹窗：把本页被识别出来的大肥鱼评论列出来
 *
 * 列表行一律用 DOM API 拼（昵称 / 评论正文是用户可写文本），
 * 头像地址走 `sanitizeHttpUrl`（配置与远端数据都可能塞 `javascript:`）。
 */
import { LoggerService } from '@/services/logger.service'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { getTemplates } from '@/shared/templates'
import { videoPageStyles } from '@/shared/styles/video-page'
import { insertStyleToDocument, createElementAndInsert, sanitizeHttpUrl } from '@/utils/common'
import { countHiddenComments, getLastScan, scanFishComments } from './collect'
import type { FishComment } from './collect'
import { createScoreTip } from './score-tip'
const logger = new LoggerService('VideoModule')
/** 当前弹窗的悬浮说明实例（整张列表共用一个，弹窗销毁时一起收掉） */
let activeTip: ReturnType<typeof createScoreTip> | null = null
/** 弹窗内容里各段的 `data-adj-field` 标记 */
const FIELD = {
    count: '[data-adj-field="count"]',
    list: '[data-adj-field="list"]',
    empty: '[data-adj-field="empty"]',
    rescan: '[data-adj-field="rescan"]'
} as const
/**
 * 把一条命中评论建成列表行
 * @param item 命中评论
 */
const createRow = (item: FishComment): HTMLElement => {
    const row = document.createElement('div')
    row.className = 'adj-fish-pond-row'
    const avatar = document.createElement('img')
    avatar.className = 'adj-fish-pond-avatar'
    avatar.alt = ''
    avatar.loading = 'lazy'
    avatar.referrerPolicy = 'no-referrer'
    const avatarUrl = sanitizeHttpUrl(item.avatar)
    if (avatarUrl) avatar.src = avatarUrl
    row.appendChild(avatar)
    const main = document.createElement('div')
    main.className = 'adj-fish-pond-main'
    const head = document.createElement('div')
    head.className = 'adj-fish-pond-head'
    const name = document.createElement(item.mid ? 'a' : 'span')
    name.className = 'adj-fish-pond-name'
    name.textContent = item.uname || '未知用户'
    if (item.mid && name instanceof HTMLAnchorElement) {
        name.href = `https://space.bilibili.com/${item.mid}`
        name.target = '_blank'
        name.rel = 'noopener noreferrer'
    }
    head.appendChild(name)
    const score = document.createElement('span')
    score.className = 'adj-fish-pond-score'
    score.textContent = `${item.score} 分`
    // 悬浮说明「为什么认它是鱼」：自绘卡片（原生 title 出现慢、长理由挤一行读不动）
    activeTip?.attach(score, item)
    head.appendChild(score)
    main.appendChild(head)
    const text = document.createElement('div')
    text.className = 'adj-fish-pond-text'
    text.textContent = item.text || '（这条评论没有正文）'
    main.appendChild(text)
    const meta = document.createElement('div')
    meta.className = 'adj-fish-pond-meta'
    const parts = [`Lv${item.level || 0}`]
    if (item.isReply) parts.push('楼中楼')
    if (item.ctime) parts.push(new Date(item.ctime * 1000).toLocaleDateString('zh-CN'))
    if (item.like) parts.push(`赞 ${item.like}`)
    parts.push(`mid ${item.mid}`)
    meta.textContent = parts.join(' · ')
    main.appendChild(meta)
    row.appendChild(main)
    return row
}
/**
 * 用最近一次扫描结果刷新弹窗内容
 * @param root 弹窗内容根节点
 */
const renderPond = (root: HTMLElement): void => {
    const scan = getLastScan()
    const count = root.querySelector(FIELD.count) as HTMLElement | null
    const list = root.querySelector(FIELD.list) as HTMLElement | null
    const empty = root.querySelector(FIELD.empty) as HTMLElement | null
    if (!count || !list || !empty) return
    const hidden = countHiddenComments()
    const summary = `本页 ${scan.accounts} 个账号 / ${scan.comments} 条评论 · 命中 ${scan.items.length} 条`
    count.textContent = hidden > 0 ? `${summary}（已移除 ${hidden} 条）` : summary
    list.textContent = ''
    if (!scan.items.length) {
        empty.hidden = false
        return
    }
    empty.hidden = true
    const fragment = document.createDocumentFragment()
    for (const item of scan.items) fragment.appendChild(createRow(item))
    list.appendChild(fragment)
}
/** 扫描 + 刷新（按钮与首次打开共用） */
const rescan = async (root: HTMLElement): Promise<void> => {
    const count = root.querySelector(FIELD.count) as HTMLElement | null
    if (count) count.textContent = '正在扫描…'
    try {
        await scanFishComments()
    } catch (error) {
        logger.error('鱼塘丨扫描失败:', error)
        if (count) count.textContent = '扫描失败，可稍后重试'
        return
    }
    renderPond(root)
}
/**
 * 打开「鱼塘」弹窗
 *
 * 同 key 单例：重复点侧栏按钮不会叠出多个弹窗（`openAdjustmentDialog` 内置）。
 */
export const openFishPondDialog = (): void => {
    insertStyleToDocument({ 'FishPondStyle': videoPageStyles.fishPond })
    const dialog = openAdjustmentDialog({
        key: 'fish-pond',
        title: '鱼塘',
        subtitle: '本页被识别出来的大肥鱼评论',
        width: 'min(560px, 92vw)',
        className: 'fish-pond-dialog',
        content: body => {
            activeTip?.destroy()
            activeTip = createScoreTip()
            const root = createElementAndInsert(getTemplates.fishPondDialog, body) as HTMLElement | null
            if (!root) return undefined
            const rescanButton = root.querySelector(FIELD.rescan) as HTMLButtonElement | null
            rescanButton?.addEventListener('click', () => { void rescan(root) })
            renderPond(root)
            void rescan(root)
            return () => {
                activeTip?.destroy()
                activeTip = null
            }
        }
    })
    logger.debug(`鱼塘丨已打开${dialog ? '' : '（弹窗未创建）'}`)
}
