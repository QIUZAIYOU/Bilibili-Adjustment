import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 黑名单首页过滤（真实 DOM）：按昵称隐藏/恢复卡片 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://www.bilibili.com/' })
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'MutationObserver', 'HTMLElement', 'location']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { createBlockedCardFilter } = await import('@/modules/home/blocklist/filter')
const createCard = (name: string): HTMLElement => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    const author = document.createElement('span')
    author.className = 'bili-video-card__info--author'
    author.setAttribute('title', name)
    card.appendChild(author)
    document.body.appendChild(card)
    return card
}
test('按昵称隐藏卡片；名单变化后 rescan 恢复/换人隐藏；stop 全部恢复', () => {
    const cardA = createCard('UP-A')
    const cardB = createCard('UP-B')
    let names = new Set(['UP-A'])
    const filter = createBlockedCardFilter(() => names)
    assert.equal(cardA.style.display, 'none')
    assert.equal(cardB.style.display, '')
    names = new Set(['UP-B'])
    filter.rescan()
    assert.equal(cardA.style.display, '')
    assert.equal(cardB.style.display, 'none')
    filter.stop()
    assert.equal(cardB.style.display, '')
    assert.equal(cardB.hasAttribute('data-adj-blocklist-hidden'), false)
})
test('没有作者名的卡片不误伤', () => {
    const card = document.createElement('div')
    card.className = 'bili-video-card'
    document.body.appendChild(card)
    let names = new Set([''])
    const filter = createBlockedCardFilter(() => names)
    assert.equal(card.style.display, '')
    filter.stop()
})
