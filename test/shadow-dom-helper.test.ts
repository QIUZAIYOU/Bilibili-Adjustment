import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/**
 * `shadow-dom-helper` 的回归测试。
 *
 * 这个工具是评论相关功能（捞鱼、评论增强、时间戳跳转）唯一的跨 Shadow DOM 入口，
 * 历史上踩过两个真实故障，都必须由用例锁住：
 * 1. **新插入子树内部的 ShadowRoot 不被纳入观察** —— 楼中楼展开后再插入的内容永远收不到回调；
 * 2. **停止监听后仍在回调** —— 模块销毁后定时器还在跑，回调里访问已卸载的 DOM。
 */
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://www.bilibili.com/' })
/** 逐项挂到 globalThis：被测模块直接读全局的 Element/NodeFilter/MutationObserver 等构造器 */
function installJSDOMGlobals (): void {
    const target = globalThis as unknown as Record<string, unknown>
    const source = dom.window as unknown as Record<string, unknown>
    for (const name of ['window', 'document', 'Element', 'Document', 'DocumentFragment', 'Node', 'NodeFilter', 'MutationObserver', 'ShadowRoot', 'HTMLElement']) {
        target[name] = name === 'window' ? dom.window : source[name]
    }
}
installJSDOMGlobals()
const { ShadowDOMHelper, collectShadowRoots, traverseAll, traverseFirst } = await import('@/utils/shadow-dom-helper')
const helper = new ShadowDOMHelper()
/** 等待条件成立（插入监听是「50ms 合并窗口 + 空闲调度」两段异步） */
async function waitFor (predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
        await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
}
/** 造一个「宿主 + open shadow root」组合 */
function createHost (): { host: HTMLElement, shadow: ShadowRoot } {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    return { host, shadow }
}
function createSpan (className: string, text: string): HTMLElement {
    const span = document.createElement('span')
    span.className = className
    span.textContent = text
    return span
}
test('traverseFirst/traverseAll 能穿透 Shadow DOM，且光照 DOM 优先', () => {
    document.body.innerHTML = ''
    const lightNode = createSpan('target', 'light')
    const { host, shadow } = createHost()
    const shadowNode = createSpan('target', 'shadow')
    shadow.append(shadowNode)
    document.body.append(lightNode, host)
    assert.equal(traverseFirst(document.body, '.target'), lightNode)
    assert.deepEqual(traverseAll(document.body, '.target'), [lightNode, shadowNode])
})
test('多层嵌套的 Shadow DOM 也能查到', () => {
    document.body.innerHTML = ''
    const outer = createHost()
    const inner = createHost()
    const deepNode = createSpan('deep', 'deep')
    inner.shadow.append(deepNode)
    outer.shadow.append(inner.host)
    document.body.append(outer.host)
    assert.equal(traverseFirst(document.body, '.deep'), deepNode)
    assert.deepEqual(traverseAll(document.body, '.deep'), [deepNode])
})
test('collectShadowRoots 只返回当前树内的 ShadowRoot，不递归 shadow 内部', () => {
    document.body.innerHTML = ''
    const outer = createHost()
    const inner = createHost()
    outer.shadow.append(inner.host)
    document.body.append(outer.host)
    const roots = collectShadowRoots(document.body)
    assert.equal(roots.length, 1)
    assert.equal(roots[0], outer.shadow)
    assert.deepEqual(collectShadowRoots(outer.shadow), [inner.shadow])
})
test('非法选择器与非法根节点抛 TypeError', () => {
    assert.throws(() => traverseFirst(document.body, ':::bad'), TypeError)
    assert.throws(() => traverseAll(document.body, ''), TypeError)
    assert.throws(() => traverseFirst({} as unknown as Element, '.a'), TypeError)
    assert.throws(() => helper.observeInsertion(':::bad', () => {}), TypeError)
    assert.throws(() => helper.observeInsertion('.a', null as unknown as () => void, document.body), TypeError)
})
test('observeInsertion 会处理已存在的元素', async () => {
    document.body.innerHTML = ''
    const existing = createSpan('hit', 'existing')
    document.body.append(existing)
    const seen: string[] = []
    const stop = helper.observeInsertion('.hit', el => seen.push(el.textContent ?? ''), document.body)
    await waitFor(() => seen.length === 1)
    stop()
    assert.deepEqual(seen, ['existing'])
})
test('observeInsertion 能收到新插入子树内部 ShadowRoot 里的元素（历史故障回归）', async () => {
    document.body.innerHTML = ''
    const seen: string[] = []
    const stop = helper.observeInsertion('.hit', el => seen.push(el.textContent ?? ''), document.body)
    // 新插入的宿主元素在插入那一刻就带着 shadow root 与匹配内容
    const { host, shadow } = createHost()
    shadow.append(createSpan('hit', 'inner-shadow'))
    document.body.append(host)
    await waitFor(() => seen.includes('inner-shadow'))
    // 之后再往同一个 shadow root 里插入也要收到
    shadow.append(createSpan('hit', 'inner-shadow-2'))
    await waitFor(() => seen.includes('inner-shadow-2'))
    stop()
    assert.deepEqual(seen.sort(), ['inner-shadow', 'inner-shadow-2'])
})
test('stop() 之后不再回调，且可以重复调用', async () => {
    document.body.innerHTML = ''
    const seen: string[] = []
    const stop = helper.observeInsertion('.hit', el => seen.push(el.textContent ?? ''), document.body)
    await waitFor(() => true)
    stop()
    stop()
    document.body.append(createSpan('hit', 'after-stop'))
    await new Promise<void>(resolve => setTimeout(resolve, 300))
    assert.deepEqual(seen, [])
})
test('querySelector/querySelectorAll/queryDescendant 三个入口结果一致', () => {
    document.body.innerHTML = ''
    const { host, shadow } = createHost()
    const shadowNode = createSpan('target', 'shadow')
    shadow.append(shadowNode)
    document.body.append(host)
    assert.equal(helper.querySelector('.target'), shadowNode)
    assert.deepEqual(helper.querySelectorAll('.target'), [shadowNode])
    assert.equal(helper.queryDescendant(document.body, '.target'), shadowNode)
    assert.deepEqual(helper.queryDescendant(document.body, '.target', true), [shadowNode])
})
