import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/** 首页视频区渲染层（真实 DOM）：文本安全、结构、交互挂点 */
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.bilibili.com/'
})
const g = globalThis as unknown as Record<string, unknown>
for (const key of ['document', 'Element', 'Node', 'HTMLElement', 'location']) {
    g[key] = (dom.window as unknown as Record<string, unknown>)[key]
}
g.window = dom.window
const { createFeedShell, renderEmpty, renderFeedView, renderNotice, renderSkeleton } = await import('@/modules/home/feed/render')
const item = (overrides: Record<string, unknown> = {}) => ({
    bvid: 'BV1xx411c7mD',
    aid: 1,
    cid: 2,
    title: '正常标题',
    pic: 'https://i0.hdslb.com/a.jpg',
    duration: 125,
    pubdate: 1,
    owner: { mid: '12345', name: 'UP主', face: 'https://i0.hdslb.com/f.jpg' },
    stat: { view: 12345, danmaku: 1, like: 2 },
    tid: 21,
    tname: '',
    rcmdReason: '',
    ...overrides
})
test('renderFeedView：泳道结构 + 卡片字段 + 屏蔽按钮', () => {
    const body = document.createElement('div')
    renderFeedView(body, { layout: 'rails', rails: [{ name: '游戏', items: [item({ pubdate: Math.floor(Date.now() / 1000) - 3600 }), item({ bvid: 'BV1yy411c7mD' })] }], rest: [] })
    assert.equal(body.querySelectorAll('.adj-hf-rail').length, 1)
    assert.equal(body.querySelectorAll('.adj-hf-grid').length, 1)
    assert.equal(body.querySelectorAll('.adj-hf-card').length, 2)
    const card = body.querySelector('.adj-hf-card') as HTMLElement
    assert.equal(card.dataset.uid, '12345')
    assert.equal(card.querySelector('.adj-hf-title')?.textContent, '正常标题')
    assert.equal(card.querySelector('.adj-hf-view')?.textContent, '1.2万 播放')
    assert.equal(card.querySelector('.adj-hf-play')?.textContent, '▶')
    assert.equal(card.querySelector('.adj-hf-time')?.textContent, '1 小时前')
    const link = card.querySelector('a') as HTMLAnchorElement
    assert.equal(link.getAttribute('href'), '//www.bilibili.com/video/BV1xx411c7mD')
    const block = card.querySelector('[data-action="block"]') as HTMLButtonElement
    assert.equal(block.getAttribute('aria-label'), '不看 UP主')
})
test('renderFeedView：标题里的标签只当文本，不注入元素', () => {
    const body = document.createElement('div')
    renderFeedView(body, {
        layout: 'stream',
        rails: [],
        rest: [item({ title: '<img src=x onerror=alert(1)>' })]
    })
    assert.equal(body.querySelectorAll('img[src="x"]').length, 0)
    assert.equal(body.querySelector('.adj-hf-title')?.textContent, '<img src=x onerror=alert(1)>')
})
test('createFeedShell / 空态 / 骨架 / 提示条', () => {
    const shell = createFeedShell()
    assert.equal(shell.root.id, 'adj-home-feed')
    assert.equal(shell.refreshButton.textContent, '换一批')
    renderSkeleton(shell.body, 2)
    assert.equal(shell.body.querySelectorAll('.adj-hf-card-skeleton').length, 2)
    renderEmpty(shell.body, '空')
    assert.equal(shell.body.textContent, '空')
    renderNotice(shell.notice, '失败了', { retry: () => {} })
    assert.equal(shell.notice.hidden, false)
    assert.equal(shell.notice.querySelector('.adj-hf-btn-small')?.textContent, '重试')
})
