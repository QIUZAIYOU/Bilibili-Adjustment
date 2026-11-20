import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 空间页监狱门：UID 解析、临时解锁 TTL、遮罩 DOM 行为 */
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><main>内容</main></div></body></html>', { url: 'https://space.bilibili.com/2' })
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'HTMLElement', 'MutationObserver', 'location', 'sessionStorage', 'HTMLButtonElement']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { getSpaceUid, isJailUnlocked, unlockJail, JAIL_UNLOCK_TTL_MS, showJail } = await import('@/features/up-blocklist/jail')
test('getSpaceUid：只认 space 子域与数字路径', () => {
    assert.equal(getSpaceUid('space.bilibili.com', '/2'), '2')
    assert.equal(getSpaceUid('space.bilibili.com', '/3493118980655263/upload/video'), '3493118980655263')
    assert.equal(getSpaceUid('www.bilibili.com', '/2'), '')
    assert.equal(getSpaceUid('space.bilibili.com', '/'), '')
    assert.equal(getSpaceUid('space.bilibili.com', '/abc'), '')
})
test('unlockJail：TTL 内解锁，过期后重新上锁', () => {
    unlockJail('2')
    assert.equal(isJailUnlocked('2'), true)
    assert.equal(isJailUnlocked('2', Date.now() + JAIL_UNLOCK_TTL_MS + 1000), false)
    assert.equal(isJailUnlocked('3'), false)
})
test('showJail：盖住内容、点临时查看后移除并记录解锁', () => {
    document.body.style.overflow = 'auto'
    const app = document.getElementById('app') as HTMLElement
    const jail = showJail('2', () => jail.destroy())
    assert.ok(document.querySelector('.adj-jail'))
    assert.equal(app.style.visibility, 'hidden')
    assert.equal(document.body.style.overflow, 'hidden')
    ;(document.querySelector('.adj-jail-temp') as HTMLButtonElement).click()
    assert.equal(document.querySelector('.adj-jail'), null)
    assert.equal(app.style.visibility, '')
    assert.equal(document.body.style.overflow, 'auto')
})
