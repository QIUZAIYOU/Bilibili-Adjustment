import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { documentScrollTo } from '@/utils/common'
/**
 * documentScrollTo 的重试口径回归（2026-09-24 改）
 *
 * 旧实现写死「最多 3 次」，网络差时页面滚动锁解除得慢，3 次用完就放弃（调用点只能拿到失败）；
 * 现改为「预算内一直重试」（默认 3 秒，退避 300ms→…封顶 1.5s）。
 */
const installStubs = (): { attempts: () => number } => {
    let attempts = 0
    const win = globalThis.window as unknown as { scrollY: number, scrollTo: () => void }
    win.scrollY = 0
    win.scrollTo = () => { attempts++ }
    ;(globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => void }).requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
    return { attempts: () => attempts }
}
test('滚动未落位时按预算重试，不按次数（旧实现 3 次就放弃）', async () => {
    const counter = installStubs()
    const startedAt = Date.now()
    await assert.rejects(documentScrollTo(500, { retryBudgetMs: 300, retryDelay: 10 }), /滚动未到位/)
    assert.ok(counter.attempts() > 3, `预算内应远超 3 次，实际 ${counter.attempts()} 次`)
    assert.ok(Date.now() - startedAt >= 300, '应确实等到预算用尽才放弃')
})
test('落位成功即结束，不重试', async () => {
    let attempts = 0
    const win = globalThis.window as unknown as { scrollY: number, scrollTo: () => void }
    win.scrollY = 0
    win.scrollTo = () => { attempts++; win.scrollY = 500 }
    ;(globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => void }).requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
    await documentScrollTo(500, { retryBudgetMs: 300, retryDelay: 10 })
    assert.equal(attempts, 1, '一次就到位，不应重试')
})
test('预算 ≤ 0 时不重试（只尝试一次就放弃）', async () => {
    const counter = installStubs()
    await assert.rejects(documentScrollTo(500, { retryBudgetMs: 0 }), /滚动未到位/)
    assert.equal(counter.attempts(), 1)
})
