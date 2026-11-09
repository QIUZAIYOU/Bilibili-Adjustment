import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/**
 * 侧栏按钮插入的集成回归（jsdom 真实 DOM）。
 *
 * 真实故障：在播放页 A 打开后新开播放页 B，再切回 A 刷新，侧栏「定位/UP/片段/设置」
 * 会无限重复堆叠十几组。原因是 B 站 React 重渲染把已插入的按钮**搬出**了侧栏容器，
 * 而看护逻辑只在容器里查重 → 每轮都判定「还没插」→ 再插一组。
 * 这里覆盖三条：
 * A. 正常情况连续调用只留一组（幂等）；
 * B. 按钮被搬到容器外后，下一次调用要把副本清掉并在容器内重建一组；
 * C. 页面上同时存在两个侧栏容器时，只往可见的那个里插。
 */
const domUi = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    pretendToBeVisual: true
})
function installUiGlobals (): void {
    const target = globalThis as unknown as Record<string, unknown>
    const source = domUi.window as unknown as Record<string, unknown>
    const names = [
        'document',
        'Element',
        'Document',
        'DocumentFragment',
        'Node',
        'MutationObserver',
        'HTMLElement',
        'HTMLAnchorElement',
        'HTMLButtonElement',
        'HTMLImageElement',
        'Event',
        'CustomEvent',
        'location',
        'Image',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'getComputedStyle'
    ]
    target.window = domUi.window
    for (const name of names) target[name] = source[name]
}
installUiGlobals()
const { uiButtonsFeatures } = await import('@/modules/video/ui-buttons')
type FeatureContext = typeof uiButtonsFeatures & Record<string, unknown>
/** 线上侧栏组件的作用域属性：卡片样式规则绑定的是它 */
const SIDENAV_SCOPE = 'data-v-6203194a'
/** 侧栏容器：内部一条 B 站真实项 + 一个包裹层（模拟 B 站的 React 结构） */
function makeSidenav (): { nav: HTMLElement, wrap: HTMLElement } {
    const nav = document.createElement('div')
    nav.className = 'fixed-sidenav-storage'
    // 线上容器同时带两个 data-v：侧栏组件自身 scope + 页面布局容器的 scope
    nav.setAttribute(SIDENAV_SCOPE, '')
    nav.setAttribute('data-v-17d386a9', '')
    const wrap = document.createElement('div')
    wrap.setAttribute(SIDENAV_SCOPE, '')
    const item = document.createElement('div')
    item.className = 'fixed-sidenav-storage-item'
    item.setAttribute(SIDENAV_SCOPE, '')
    // 深层子组件自己的 scope：它才是文档里最后一个带 data-v 的后代，抄它会丢卡片样式
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('data-v-child0001', '')
    item.appendChild(icon)
    wrap.appendChild(item)
    nav.appendChild(wrap)
    document.body.appendChild(nav)
    return { nav, wrap }
}
function makeContext (): FeatureContext {
    return {
        ...uiButtonsFeatures,
        userConfigs: { page_type: 'video', catch_fish: true },
        settingsComponent: { openSettings: async () => {} },
        refreshUpAvatar: async () => {},
        syncSkipSegmentButton: async () => {}
    } as FeatureContext
}
function countButtons (key: string): number {
    return document.querySelectorAll('.bili-adjustment-icon.' + key).length
}
function markVisible (element: Element): void {
    Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => [{ width: 10, height: 10 }]
    })
}
/** 本脚本按钮的类名后缀（用来把元素还原成 key） */
const SIDENAV_KEY_ORDER = ['up', 'skip', 'fishpond', 'settings', 'locate']
/** 侧栏里本脚本按钮的文档顺序（纵向排列，第一个就是最上面那个） */
function ourButtonKeys (): string[] {
    return Array.from(document.querySelectorAll('.fixed-sidenav-storage .bili-adjustment-icon'))
        .map(button => SIDENAV_KEY_ORDER.find(key => button.classList.contains(key)) ?? '?')
}
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
test('同一侧栏连续插入三次也只保留一组按钮', async () => {
    document.body.innerHTML = ''
    const { nav } = makeSidenav()
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    await context.insertSideFloatNavToolsButtons()
    await context.insertSideFloatNavToolsButtons()
    for (const key of ['locate', 'settings', 'up']) assert.equal(countButtons(key), 1, key + ' 应只有 1 个')
    assert.equal(nav.querySelectorAll('.bili-adjustment-icon.locate').length, 1)
    assert.equal(document.querySelectorAll('.bili-adjustment-icon').length, 3)
    for (const key of ['locate', 'settings', 'up']) {
        const button = document.querySelector('.bili-adjustment-icon.' + key) as HTMLElement
        assert.equal(button.hasAttribute(SIDENAV_SCOPE), true, key + ' 必须带侧栏组件 scope（否则 B 站卡片样式不命中）')
        assert.equal(button.hasAttribute('data-v-17d386a9'), false, key + ' 不能抄页面布局 scope')
        assert.equal(button.hasAttribute('data-v-child0001'), false, key + ' 不能抄深层子组件的 scope')
    }
})
test('旧按钮丢了作用域属性时，「已存在」分支要补回（自愈）', async () => {
    document.body.innerHTML = ''
    makeSidenav()
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    for (const button of Array.from(document.querySelectorAll('.bili-adjustment-icon'))) button.removeAttribute(SIDENAV_SCOPE)
    await context.insertSideFloatNavToolsButtons()
    for (const key of ['locate', 'settings', 'up']) {
        const button = document.querySelector('.bili-adjustment-icon.' + key) as HTMLElement
        assert.equal(button.hasAttribute(SIDENAV_SCOPE), true, key + ' 应被补回 scope')
    }
    assert.equal(document.querySelectorAll('.bili-adjustment-icon').length, 3, '自愈不应重复插入')
})
test('侧栏里还没有真实按钮时，用容器自身的 scope 兜底', async () => {
    document.body.innerHTML = ''
    const nav = document.createElement('div')
    nav.className = 'fixed-sidenav-storage'
    nav.setAttribute(SIDENAV_SCOPE, '')
    markVisible(nav)
    document.body.appendChild(nav)
    await makeContext().insertSideFloatNavToolsButtons()
    for (const key of ['locate', 'settings', 'up']) {
        const button = document.querySelector('.bili-adjustment-icon.' + key) as HTMLElement
        assert.equal(button.hasAttribute(SIDENAV_SCOPE), true, key + ' 应带容器 scope')
    }
})
test('按钮被搬出侧栏后不会重复堆叠，而是清掉副本并重建一组', async () => {
    document.body.innerHTML = ''
    const { nav } = makeSidenav()
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    assert.equal(countButtons('locate'), 1)
    // 模拟 B 站重渲染：把装着按钮的包裹层整个搬到 body 上
    const moved = nav.lastElementChild as HTMLElement
    document.body.appendChild(moved)
    await context.insertSideFloatNavToolsButtons()
    await context.insertSideFloatNavToolsButtons()
    await context.insertSideFloatNavToolsButtons()
    assert.equal(countButtons('locate'), 1)
    assert.equal(countButtons('settings'), 1)
    assert.equal(countButtons('up'), 1)
    const locate = document.querySelector('.bili-adjustment-icon.locate') as HTMLElement
    assert.equal(nav.contains(locate), true, '重建的按钮必须回到侧栏容器内')
    assert.equal(document.querySelectorAll('.bili-adjustment-icon').length, 3, '容器外不应留下副本')
    // 让 1200ms 静默看护真正跑一轮：它必须判定「已存在」而不是再插一组
    await sleep(1400)
    assert.equal(countButtons('locate'), 1)
})
test('两个侧栏容器同时存在时只往可见的那个里插', async () => {
    document.body.innerHTML = ''
    const hidden = makeSidenav()
    const visible = makeSidenav()
    markVisible(visible.nav)
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    assert.equal(hidden.nav.querySelectorAll('.bili-adjustment-icon').length, 0)
    assert.equal(visible.nav.querySelectorAll('.bili-adjustment-icon').length, 3)
    assert.equal(document.querySelectorAll('.bili-adjustment-icon').length, 3)
})
test('异步插到头像上方的「片段」按钮，下一次插入会把头像挪回第一位', async () => {
    document.body.innerHTML = ''
    const { wrap } = makeSidenav()
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    assert.deepEqual(ourButtonKeys(), ['up', 'settings', 'locate'], '正常情况下头像就是第一位')
    // 模拟 syncSkipSegmentButton 等字幕探测返回后才插入：prepend 会落到头像上面
    const skip = document.createElement('div')
    skip.className = 'fixed-sidenav-storage-item bili-adjustment-icon skip'
    wrap.prepend(skip)
    assert.deepEqual(ourButtonKeys(), ['skip', 'up', 'settings', 'locate'], '前置条件：片段确实跑到了头像上方')
    await context.insertSideFloatNavToolsButtons()
    assert.deepEqual(ourButtonKeys(), ['up', 'skip', 'settings', 'locate'], '头像必须回到第一位（其余按钮相对顺序不变）')
})
test('旧版本留下的错序头像，在「已存在就跳过插入」分支里自愈', async () => {
    document.body.innerHTML = ''
    const { wrap } = makeSidenav()
    const context = makeContext()
    await context.insertSideFloatNavToolsButtons()
    const skip = document.createElement('div')
    skip.className = 'fixed-sidenav-storage-item bili-adjustment-icon skip'
    wrap.prepend(skip)
    // 三个固定按钮都在 → 不重插，但顺序仍要校正
    await context.insertSideFloatNavToolsButtons()
    assert.equal(ourButtonKeys()[0], 'up')
    for (const key of ['locate', 'settings', 'up', 'skip']) assert.equal(countButtons(key), 1, key + ' 不应重复')
})
