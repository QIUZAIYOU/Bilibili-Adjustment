/**
 * 分数构成面板（「为什么判它是大肥鱼」）。
 *
 * 为什么不是悬浮卡片：鱼塘弹窗是 `popover`，浏览器会把弹窗放进**顶层（top layer）**，
 * 任何追加到 `document.body` 的 `position: fixed` 浮层都会被弹窗盖住（实测卡片上半截
 * 直接被弹窗吃掉）。放进弹窗内部又会被 560px 宽、300 多高的框夹住。所以改成
 * 「点分数徽章、在该行下面就地展开」：不遮挡、不裁切，也不影响其它行。
 *
 * 一条徽章只建一次面板、复用同一个元素（列表重扫后重新挂载）。
 */
import type { FishComment } from './collect'
import type { DetectionReason } from './rules'
/** 面板里最多列几条依据，其余折成「另有 N 条」 */
const REASON_LIMIT = 6
/** 卡片上 `aria-label` 里最多带几条理由（屏幕阅读器不会读太长） */
const ARIA_REASON_LIMIT = 2
/**
 * 把一条依据渲染成一行：权重徽章 + 依据文案 + 命中片段
 * @param reason 判定依据
 */
const createReasonRow = (reason: DetectionReason): HTMLLIElement => {
    const row = document.createElement('li')
    row.className = 'adj-fish-pond-tip-row'
    const weight = document.createElement('span')
    weight.className = 'adj-fish-pond-tip-weight'
    weight.textContent = `${reason.w > 0 ? '+' : ''}${reason.w}`
    row.appendChild(weight)
    const why = document.createElement('span')
    why.className = 'adj-fish-pond-tip-why'
    why.textContent = reason.why
    row.appendChild(why)
    if (reason.hit) {
        const hit = document.createElement('span')
        hit.className = 'adj-fish-pond-tip-hit'
        hit.textContent = reason.hit
        row.appendChild(hit)
    }
    return row
}
/**
 * 建一块分数构成面板
 * @param item 命中评论
 */
const createCard = (item: FishComment): HTMLDivElement => {
    const card = document.createElement('div')
    card.className = 'adj-fish-pond-tip'
    const head = document.createElement('div')
    head.className = 'adj-fish-pond-tip-head'
    const title = document.createElement('span')
    title.className = 'adj-fish-pond-tip-title'
    title.textContent = item.verdict === 'fish' ? '判定为大肥鱼' : '疑似大肥鱼'
    head.appendChild(title)
    const score = document.createElement('span')
    score.className = 'adj-fish-pond-tip-score'
    score.textContent = `${item.score} 分`
    head.appendChild(score)
    card.appendChild(head)
    const list = document.createElement('ul')
    list.className = 'adj-fish-pond-tip-list'
    const reasons = [...item.reasons].sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    for (const reason of reasons.slice(0, REASON_LIMIT)) list.appendChild(createReasonRow(reason))
    card.appendChild(list)
    const rest = reasons.length - REASON_LIMIT
    const foot = document.createElement('div')
    foot.className = 'adj-fish-pond-tip-foot'
    foot.textContent = rest > 0 ? `共 ${reasons.length} 条依据，另有 ${rest} 条未列出` : `共 ${reasons.length} 条依据`
    card.appendChild(foot)
    return card
}
/**
 * 创建一个分数构成面板管理实例（整张鱼塘列表共用一个）
 * @returns `attach` 给徽章绑定数据与点击展开，`destroy` 解绑并移除面板
 */
export const createScoreTip = (): {
    attach: (badge: HTMLElement, item: FishComment) => void
    destroy: () => void
} => {
    const items = new WeakMap<HTMLElement, FishComment>()
    const cards = new WeakMap<HTMLElement, HTMLDivElement>()
    const bound = new WeakSet<HTMLElement>()
    let opened: HTMLElement | null = null
    const close = (): void => {
        if (!opened) return
        cards.get(opened)?.remove()
        opened.setAttribute('aria-expanded', 'false')
        opened = null
    }
    const toggle = (badge: HTMLElement): void => {
        if (opened === badge) {
            close()
            return
        }
        close()
        const item = items.get(badge)
        if (!item) return
        const row = badge.closest('.adj-fish-pond-row') ?? badge.parentElement
        if (!row) return
        let card = cards.get(badge)
        if (!card) {
            card = createCard(item)
            cards.set(badge, card)
        }
        row.insertAdjacentElement('afterend', card)
        badge.setAttribute('aria-expanded', 'true')
        opened = badge
    }
    const onClick = (event: Event): void => {
        const badge = event.currentTarget as HTMLElement
        event.preventDefault()
        toggle(badge)
    }
    const onKeydown = (event: Event): void => {
        const key = (event as KeyboardEvent).key
        if (key !== 'Enter' && key !== ' ') return
        event.preventDefault()
        toggle(event.currentTarget as HTMLElement)
    }
    // Esc 收起：面板展开时键盘用户要能退出来
    const onEsc = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onEsc)
    return {
        attach: (badge, item) => {
            items.set(badge, item)
            badge.setAttribute('role', 'button')
            badge.setAttribute('tabindex', '0')
            if (!badge.hasAttribute('aria-expanded')) badge.setAttribute('aria-expanded', 'false')
            badge.setAttribute(
                'aria-label',
                `${item.score} 分，${item.verdict === 'fish' ? '判定为大肥鱼' : '疑似大肥鱼'}：` +
                item.reasons.slice(0, ARIA_REASON_LIMIT).map(reason => reason.why).join('；') +
                '。按回车展开分数构成'
            )
            if (bound.has(badge)) return
            bound.add(badge)
            badge.addEventListener('click', onClick)
            badge.addEventListener('keydown', onKeydown)
        },
        destroy: () => {
            close()
            document.removeEventListener('keydown', onEsc)
        }
    }
}
