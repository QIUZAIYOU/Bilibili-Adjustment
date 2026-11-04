import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
/**
 * 「鱼塘」弹窗「重新扫描」的可见反馈回归。
 *
 * 真实故障：扫描命中判定/头像缓存后是**同步完成**的，列表内容又常常和上次一模一样，
 * 于是点「重新扫描」既不出现「扫描中…」也没有任何完成提示 —— 用户完全看不出它跑过，
 * 只能报「点了没反应」。这里锁住三件事：
 * 1. 点击后**同步**进入「扫描中」状态（按钮禁用 + 文案），保证下一帧一定画得出来；
 * 2. 扫描结束（无论结果变没变）展示带时间戳的「已刷新」提示；
 * 3. 状态位在 DOM 里真实存在且每次重扫都会重新显示。
 */
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    pretendToBeVisual: true
})
/** 逐项挂到 globalThis：被测模块直接读全局的 window/document/Element 等 */
function installJSDOMGlobals (): void {
    const target = globalThis as unknown as Record<string, unknown>
    const source = dom.window as unknown as Record<string, unknown>
    const names = [
        'document',
        'Element',
        'Document',
        'DocumentFragment',
        'Node',
        'NodeFilter',
        'MutationObserver',
        'ShadowRoot',
        'HTMLElement',
        'HTMLAnchorElement',
        'HTMLButtonElement',
        'HTMLImageElement',
        'Event',
        'KeyboardEvent',
        'CustomEvent',
        'location',
        'Image',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'getComputedStyle'
    ]
    target.window = dom.window
    for (const name of names) target[name] = source[name]
}
installJSDOMGlobals()
/** 等条件成立（首轮扫描要跨一帧） */
async function waitFor (predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
        await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
}
test('点「重新扫描」会同步进入扫描中，并在结束后给出可见的「已刷新」提示', async () => {
    document.body.innerHTML = ''
    const { openFishPondDialog } = await import('@/features/fish-pond/dialog')
    openFishPondDialog()
    const root = document.querySelector('.adj-fish-pond') as HTMLElement | null
    assert.ok(root, '弹窗内容没渲染出来')
    const button = root.querySelector('[data-adj-field="rescan"]') as HTMLButtonElement
    const hint = root.querySelector('[data-adj-field="updated"]') as HTMLElement
    assert.ok(button && hint, '「重新扫描」按钮或状态位缺失')
    // 打开即扫一次：扫描中状态必须同步生效（否则用户点完看不到任何变化）
    assert.equal(button.disabled, true)
    assert.equal(button.textContent, '扫描中…')
    await waitFor(() => !button.disabled)
    assert.equal(button.textContent, '重新扫描')
    assert.match(hint.textContent ?? '', /^已刷新 \d{2}:\d{2}:\d{2}$/)
    assert.equal(hint.hidden, false, '扫描完成后没有可见的「已刷新」提示')
    assert.equal(root.getAttribute('aria-busy'), 'false')
    // 再点一次：即使结果完全没变，也必须重新给出状态与提示
    hint.hidden = true
    hint.classList.remove('is-visible')
    button.click()
    assert.equal(button.disabled, true, '点击后按钮没有进入扫描中状态')
    assert.equal(button.textContent, '扫描中…')
    assert.equal(root.getAttribute('aria-busy'), 'true')
    await waitFor(() => !button.disabled)
    assert.equal(hint.hidden, false, '重扫完成后「已刷新」提示没有重新出现')
    assert.match(hint.textContent ?? '', /^已刷新 \d{2}:\d{2}:\d{2}$/)
    assert.equal(hint.classList.contains('is-visible'), true)
    // 收尾：移除弹窗，避免测试进程被提示定时器拖住
    ;(root.closest('.adjustment-dialog') as HTMLElement | null)?.remove()
})
