import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/**
 * 侧栏按钮去重的纯函数回归。
 *
 * 背景故障：B 站 React 重渲染会把我们插进侧栏的按钮搬到容器外；旧判据只看当前容器，
 * 于是看护定时器每轮都判定「还没插」再插一组，页面左缘堆出十几组「定位/UP/片段/设置」。
 * 这里锁住判定本身：主容器只留一组、容器外副本要清理、网页全屏镜像里的按钮必须豁免。
 */
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    pretendToBeVisual: true
})
function installJSDOMGlobals (): void {
    const target = globalThis as unknown as Record<string, unknown>
    const source = dom.window as unknown as Record<string, unknown>
    const names = ['document', 'Element', 'Document', 'Node', 'MutationObserver', 'HTMLElement', 'getComputedStyle']
    target.window = dom.window
    for (const name of names) target[name] = source[name]
}
installJSDOMGlobals()
const { pickPrimaryFloatNav, planSidenavDedupe } = await import('@/modules/video/sidenav-dedupe')
/** jsdom 不做布局，默认 getClientRects 为空：需要「可见」时显式打桩 */
function markVisible (element: Element): void {
    Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => [{ width: 10, height: 10 }]
    })
}
function makeNav (): HTMLElement {
    const nav = document.createElement('div')
    nav.className = 'fixed-sidenav-storage'
    document.body.appendChild(nav)
    return nav
}
function makeButton (key: string): HTMLElement {
    const button = document.createElement('div')
    button.className = 'bili-adjustment-icon ' + key
    return button
}
const noMirror = (): boolean => false
test('主容器内同 key 只保留第一个，其余视为待清理', () => {
    document.body.innerHTML = ''
    const nav = makeNav()
    const first = makeButton('up')
    const second = makeButton('up')
    nav.append(first, second)
    const plan = planSidenavDedupe({
        navs: [nav],
        candidates: { up: [first, second]},
        isInMirror: noMirror
    })
    assert.equal(plan.primary, nav)
    assert.equal(plan.present.up, first)
    assert.deepEqual(plan.staleCopies, [second])
})
test('多个容器时选可见的那个，旧容器里的副本要清理', () => {
    document.body.innerHTML = ''
    const hiddenNav = makeNav()
    const visibleNav = makeNav()
    markVisible(visibleNav)
    const hiddenButton = makeButton('locate')
    const visibleButton = makeButton('locate')
    hiddenNav.append(hiddenButton)
    visibleNav.append(visibleButton)
    const plan = planSidenavDedupe({
        navs: [hiddenNav, visibleNav],
        candidates: { locate: [hiddenButton, visibleButton]},
        isInMirror: noMirror
    })
    assert.equal(plan.primary, visibleNav)
    assert.equal(plan.present.locate, visibleButton)
    assert.deepEqual(plan.staleCopies, [hiddenButton])
})
test('被搬到容器外的副本进入清理列表，主容器内重新插', () => {
    document.body.innerHTML = ''
    const nav = makeNav()
    const wrapper = document.createElement('div')
    nav.appendChild(wrapper)
    const copy = makeButton('settings')
    document.body.appendChild(copy)
    const plan = planSidenavDedupe({
        navs: [nav],
        candidates: { settings: [copy]},
        isInMirror: noMirror
    })
    assert.equal(plan.present.settings, undefined)
    assert.deepEqual(plan.staleCopies, [copy])
})
test('网页全屏镜像容器里的按钮不算重复', () => {
    document.body.innerHTML = ''
    const nav = makeNav()
    const mirror = document.createElement('div')
    mirror.id = 'mirror-vdcon'
    const mirrorButton = makeButton('skip')
    mirror.appendChild(mirrorButton)
    document.body.appendChild(mirror)
    const plan = planSidenavDedupe({
        navs: [nav],
        candidates: { skip: [mirrorButton]},
        isInMirror: (element: Element) => Boolean(element.closest('#mirror-vdcon'))
    })
    assert.deepEqual(plan.staleCopies, [])
    assert.equal(plan.present.skip, undefined)
})
test('没有容器时返回空计划（交给调用方的有界重试）', () => {
    document.body.innerHTML = ''
    const orphan = makeButton('locate')
    document.body.appendChild(orphan)
    const plan = planSidenavDedupe({
        navs: [],
        candidates: { locate: [orphan]},
        isInMirror: noMirror
    })
    assert.equal(plan.primary, null)
    assert.deepEqual(plan.present, {})
    assert.deepEqual(plan.staleCopies, [])
})
test('pickPrimaryFloatNav：优先可见，其次最后一个仍连着文档的', () => {
    document.body.innerHTML = ''
    const first = makeNav()
    const second = makeNav()
    assert.equal(pickPrimaryFloatNav([first, second]), second)
    markVisible(first)
    assert.equal(pickPrimaryFloatNav([first, second]), first)
    first.remove()
    assert.equal(pickPrimaryFloatNav([first, second]), second)
    assert.equal(pickPrimaryFloatNav([]), null)
})
