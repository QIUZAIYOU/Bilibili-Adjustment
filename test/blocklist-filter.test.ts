import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 黑名单首页过滤（真实 DOM）：按昵称隐藏卡片，优先隐藏最外层网格占位 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://www.bilibili.com/' })
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'MutationObserver', 'HTMLElement', 'location']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { createBlockedCardFilter } = await import('@/modules/home/blocklist/filter')
interface Built {
    card: HTMLElement
    inner: HTMLElement | null
    outer: HTMLElement | null
}
/** 按首页真实结构造卡：outer(.feed-card) > inner(.bili-feed-card) > 卡片 */
const createCard = (name: string, options: { outer?: boolean, inner?: boolean } = {}): Built => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    const author = document.createElement('span')
    author.className = 'bili-video-card__info--author'
    author.setAttribute('title', name)
    card.appendChild(author)
    let inner: HTMLElement | null = null
    let outer: HTMLElement | null = null
    let parent = card
    if (options.inner !== false) {
        inner = document.createElement('div')
        inner.className = 'bili-feed-card'
        inner.appendChild(card)
        parent = inner
    }
    if (options.outer) {
        outer = document.createElement('div')
        outer.className = 'feed-card'
        outer.appendChild(parent)
        parent = outer
    }
    document.body.appendChild(parent)
    return { card, inner, outer }
}
test('有 .feed-card 外层时优先隐藏外层，内层与卡片保持可见', () => {
    const built = createCard('UP-A', { outer: true })
    const filter = createBlockedCardFilter(() => new Set(['UP-A']))
    assert.equal(built.outer?.style.display, 'none')
    assert.equal(built.inner?.style.display, '')
    assert.equal(built.card.style.display, '')
    filter.stop()
    assert.equal(built.outer?.style.display, '')
    assert.equal(built.outer?.hasAttribute('data-adj-blocklist-hidden'), false)
})
test('无限流只有 .bili-feed-card 时隐藏它，没有外层则退化为卡片', () => {
    const onlyInner = createCard('UP-B')
    const bare = createCard('UP-C', { inner: false })
    const filter = createBlockedCardFilter(() => new Set(['UP-B', 'UP-C']))
    assert.equal(onlyInner.inner?.style.display, 'none')
    assert.equal(bare.card.style.display, 'none')
    filter.stop()
    assert.equal(onlyInner.inner?.style.display, '')
    assert.equal(bare.card.style.display, '')
})
test('名单变化后 rescan 换人隐藏；没有作者名的卡片不误伤', () => {
    const built = createCard('UP-A', { outer: true })
    let names = new Set(['UP-A'])
    const filter = createBlockedCardFilter(() => names)
    assert.equal(built.outer?.style.display, 'none')
    names = new Set(['UP-B'])
    filter.rescan()
    assert.equal(built.outer?.style.display, '')
    const blank = document.createElement('div')
    blank.className = 'bili-video-card'
    document.body.appendChild(blank)
    filter.rescan()
    assert.equal(blank.style.display, '')
    filter.stop()
})
