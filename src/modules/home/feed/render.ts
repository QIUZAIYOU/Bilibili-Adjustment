/**
 * 首页视频区渲染层（纯 DOM，不引入 Vue：首页是首屏路径）
 *
 * 所有来自接口的文本一律走 textContent，绝不做 HTML 拼接；图片与链接只接受 https。
 */
import { formatCount, formatDuration } from './pure'
import type { HomeFeedItem, HomeFeedRail } from './pure'
/** 渲染所需的视图状态 */
export interface HomeFeedView {
    layout: 'rails' | 'stream'
    rails: HomeFeedRail[]
    rest: HomeFeedItem[]
}
/** 卡片上的交互回调 */
export interface HomeFeedHandlers {
    onBlock: (item: HomeFeedItem) => void
    onRetry: () => void
    onRefresh: () => void
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}
/** 生成一张视频卡（不挂事件，交给容器委托） */
const createCard = (item: HomeFeedItem): HTMLElement => {
    const card = el('article', 'adj-hf-card')
    card.dataset.bvid = item.bvid
    card.dataset.uid = item.owner.mid
    const link = el('a', 'adj-hf-link')
    link.href = `//www.bilibili.com/video/${item.bvid}`
    link.setAttribute('aria-label', item.title)
    const cover = el('img', 'adj-hf-cover')
    cover.src = item.pic
    cover.alt = ''
    cover.loading = 'lazy'
    cover.decoding = 'async'
    link.appendChild(cover)
    if (item.duration > 0) link.appendChild(el('span', 'adj-hf-duration', formatDuration(item.duration)))
    const title = el('h3', 'adj-hf-title', item.title)
    const meta = el('div', 'adj-hf-meta')
    if (item.owner.face) {
        const avatar = el('img', 'adj-hf-avatar')
        avatar.src = item.owner.face
        avatar.alt = ''
        avatar.loading = 'lazy'
        meta.appendChild(avatar)
    }
    meta.appendChild(el('span', 'adj-hf-owner', item.owner.name))
    meta.appendChild(el('span', 'adj-hf-view', `${formatCount(item.stat.view)} 播放`))
    const block = el('button', 'adj-hf-block')
    block.type = 'button'
    block.textContent = '×'
    block.title = '不看此 UP'
    block.setAttribute('aria-label', `不看 ${item.owner.name}`)
    block.dataset.action = 'block'
    card.append(link, title, meta, block)
    return card
}
/** 分区泳道：横向滚动，标题右侧显示条数 */
const createRail = (rail: HomeFeedRail): HTMLElement => {
    const section = el('section', 'adj-hf-rail')
    const head = el('div', 'adj-hf-rail-head')
    head.appendChild(el('h2', 'adj-hf-rail-title', rail.name))
    head.appendChild(el('span', 'adj-hf-rail-count', String(rail.items.length)))
    const track = el('div', 'adj-hf-track adj-hf-track-rail')
    for (const item of rail.items) track.appendChild(createCard(item))
    section.append(head, track)
    return section
}
/** 单列铺排：自适应列宽 */
const createStream = (items: HomeFeedItem[]): HTMLElement => {
    const track = el('div', 'adj-hf-track adj-hf-track-stream')
    for (const item of items) track.appendChild(createCard(item))
    return track
}
/** 创建视频区骨架（工具条 + 内容区 + 底部哨兵 + 提示条） */
export const createFeedShell = (): {
    root: HTMLElement
    title: HTMLElement
    status: HTMLElement
    body: HTMLElement
    notice: HTMLElement
    sentinel: HTMLElement
    refreshButton: HTMLButtonElement
} => {
    const root = el('section', 'adj-hf-root')
    root.id = 'adj-home-feed'
    root.setAttribute('aria-label', '首页视频区（脚本增强）')
    const toolbar = el('div', 'adj-hf-toolbar')
    const title = el('h2', 'adj-hf-heading', '视频')
    const status = el('span', 'adj-hf-status')
    const refreshButton = el('button', 'adj-hf-btn')
    refreshButton.type = 'button'
    refreshButton.textContent = '换一批'
    toolbar.append(title, status, refreshButton)
    const notice = el('div', 'adj-hf-notice')
    notice.hidden = true
    const body = el('div', 'adj-hf-body')
    const sentinel = el('div', 'adj-hf-sentinel')
    sentinel.setAttribute('aria-hidden', 'true')
    root.append(toolbar, notice, body, sentinel)
    return { root, title, status, body, notice, sentinel, refreshButton }
}
/** 渲染列表：rails 走泳道 + 更多推荐，stream 走单列 */
export const renderFeedView = (body: HTMLElement, view: HomeFeedView): void => {
    body.textContent = ''
    if (view.layout === 'stream') {
        body.appendChild(createStream([...view.rails.flatMap(rail => rail.items), ...view.rest]))
        return
    }
    for (const rail of view.rails) body.appendChild(createRail(rail))
    if (view.rest.length) {
        const section = el('section', 'adj-hf-rail')
        const head = el('div', 'adj-hf-rail-head')
        head.appendChild(el('h2', 'adj-hf-rail-title', '更多推荐'))
        head.appendChild(el('span', 'adj-hf-rail-count', String(view.rest.length)))
        section.append(head, createStream(view.rest))
        body.appendChild(section)
    }
}
/** 骨架屏：加载首屏时占位，避免空白 */
export const renderSkeleton = (body: HTMLElement, count = 8): void => {
    body.textContent = ''
    const grid = el('div', 'adj-hf-track adj-hf-track-stream')
    for (let i = 0; i < count; i++) {
        const card = el('div', 'adj-hf-card adj-hf-card-skeleton')
        card.append(el('div', 'adj-hf-skeleton-cover'), el('div', 'adj-hf-skeleton-line'), el('div', 'adj-hf-skeleton-line adj-hf-skeleton-line-short'))
        grid.appendChild(card)
    }
    body.appendChild(grid)
}
/** 空态 */
export const renderEmpty = (body: HTMLElement, text: string): void => {
    body.textContent = ''
    body.appendChild(el('div', 'adj-hf-empty', text))
}
/** 提示条（错误可重试；info 只显示一句话） */
export const renderNotice = (notice: HTMLElement, text: string, options: { retry?: () => void } = {}): void => {
    notice.textContent = ''
    notice.hidden = false
    notice.appendChild(el('span', 'adj-hf-notice-text', text))
    if (options.retry) {
        const retry = el('button', 'adj-hf-btn adj-hf-btn-small')
        retry.type = 'button'
        retry.textContent = '重试'
        retry.addEventListener('click', options.retry, { once: true })
        notice.appendChild(retry)
    }
}
export const hideNotice = (notice: HTMLElement): void => {
    notice.hidden = true
    notice.textContent = ''
}
export { createCard }
