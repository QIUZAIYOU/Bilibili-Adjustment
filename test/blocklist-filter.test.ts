import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 全站黑名单卡片过滤（真实 DOM）：UID 链接优先、昵称兜底、外层占位、恢复 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://www.bilibili.com/' })
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'MutationObserver', 'HTMLElement', 'location']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { createBlockedCardFilter } = await import('@/features/up-blocklist/filter')
const uids = new Set(['123456'])
const names = new Set(['UP-A'])
const startFilter = () => createBlockedCardFilter(() => ({ uids, names }))
interface CardOptions {
    name?: string
    uid?: string
    wrapper?: boolean
}
const createCard = ({ name = '', uid = '', wrapper = false }: CardOptions): { card: HTMLElement, wrapper: HTMLElement | null } => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    if (name) {
        const author = document.createElement('span')
        author.className = 'bili-video-card__info--author'
        author.setAttribute('title', name)
        card.appendChild(author)
    }
    if (uid) {
        const link = document.createElement('a')
        link.setAttribute('href', `//space.bilibili.com/${uid}`)
        card.appendChild(link)
    }
    if (wrapper) {
        const outer = document.createElement('div')
        outer.className = 'feed-card'
        outer.appendChild(card)
        document.body.appendChild(outer)
        return { card, wrapper: outer }
    }
    document.body.appendChild(card)
    return { card, wrapper: null }
}
test('卡片带空间链接时按 UID 精确隐藏', () => {
    const { card } = createCard({ name: '随便什么名字', uid: '123456' })
    const filter = startFilter()
    assert.equal(card.style.display, 'none')
    filter.stop()
})
test('没有空间链接时按昵称兜底', () => {
    const { card } = createCard({ name: 'UP-A' })
    const filter = startFilter()
    assert.equal(card.style.display, 'none')
    filter.stop()
})
test('同名但 UID 不同：有链接时以 UID 为准，不误杀', () => {
    const { card } = createCard({ name: 'UP-A', uid: '999' })
    const filter = startFilter()
    assert.equal(card.style.display, '')
    filter.stop()
})
test('首页外层 .feed-card 占位一起隐藏，stop 全量恢复', () => {
    const { wrapper } = createCard({ name: 'UP-A', wrapper: true })
    const filter = startFilter()
    assert.equal(wrapper?.style.display, 'none')
    filter.stop()
    assert.equal(wrapper?.style.display, '')
    assert.equal(wrapper?.hasAttribute('data-adj-blocklist-hidden'), false)
})
test('没有作者名也没有链接的卡片不误伤', () => {
    const { card } = createCard({})
    const filter = startFilter()
    assert.equal(card.style.display, '')
    filter.stop()
})

test('清空名单后 rescan 恢复已隐藏卡片，重新加入再次隐藏', () => {
    const mutableUids = new Set(['123456'])
    const mutableNames = new Set<string>()
    const { card } = createCard({ uid: '123456' })
    const filter = createBlockedCardFilter(() => ({ uids: mutableUids, names: mutableNames }))
    assert.equal(card.style.display, 'none')
    mutableUids.clear()
    filter.rescan()
    assert.equal(card.style.display, '')
    assert.equal(card.hasAttribute('data-adj-blocklist-hidden'), false)
    mutableUids.add('123456')
    filter.rescan()
    assert.equal(card.style.display, 'none')
    filter.stop()
})
