import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 黑名单首页过滤（真实 DOM）：按昵称隐藏/恢复卡片；隐藏的是外层网格占位 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://www.bilibili.com/' })
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'MutationObserver', 'HTMLElement', 'location']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { createBlockedCardFilter } = await import('@/modules/home/blocklist/filter')
const createCard = (name: string, withWrapper = true): { card: HTMLElement, wrapper: HTMLElement | null } => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    const author = document.createElement('span')
    author.className = 'bili-video-card__info--author'
    author.setAttribute('title', name)
    card.appendChild(author)
    if (!withWrapper) {
        document.body.appendChild(card)
        return { card, wrapper: null }
    }
    const wrapper = document.createElement('div')
    wrapper.className = 'feed-card'
    wrapper.appendChild(card)
    document.body.appendChild(wrapper)
    return { card, wrapper }
}
test('隐藏外层 .feed-card 而不是只藏 .bili-video-card；名单变化后恢复', () => {
    const a = createCard('UP-A')
    const b = createCard('UP-B')
    let names = new Set(['UP-A'])
    const filter = createBlockedCardFilter(() => names)
    assert.equal(a.wrapper!.style.display, 'none')
    assert.equal(a.card.style.display, '')
    assert.equal(b.wrapper!.style.display, '')
    names = new Set(['UP-B'])
    filter.rescan()
    assert.equal(a.wrapper!.style.display, '')
    assert.equal(b.wrapper!.style.display, 'none')
    filter.stop()
    assert.equal(b.wrapper!.style.display, '')
    assert.equal(b.wrapper!.hasAttribute('data-adj-blocklist-hidden'), false)
})
test('没有外层占位时退回隐藏卡片自身', () => {
    const { card } = createCard('UP-C', false)
    const filter = createBlockedCardFilter(() => new Set(['UP-C']))
    assert.equal(card.style.display, 'none')
    filter.stop()
    assert.equal(card.style.display, '')
})
test('没有作者名的卡片不误伤', () => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    document.body.appendChild(card)
    const filter = createBlockedCardFilter(() => new Set(['']))
    assert.equal(card.style.display, '')
    filter.stop()
})
