import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { documentScrollTo } from '@/utils/common'
import { noteUserIntent, resetUserScrollIntent } from '@/utils/user-scroll-intent'
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
/**
 * 让位给用户（2026-11-06「定位还在跟用户抢滚动」）
 *
 * 自动滚动必须在用户开口滚动的**那一刻**停手：动画立刻停帧、重试立刻放弃，
 * 并且以 resolve（而不是 reject）收尾 —— 让位不是失败，调用点不该打 warn。
 */
test('yieldToUser：滚动中途用户动手 → 立刻让位并 resolve', async () => {
    const counter = installStubs()
    resetUserScrollIntent()
    let abortedWith: string | null = null
    const scrolling = documentScrollTo(500, {
        retryBudgetMs: 1000,
        retryDelay: 20,
        yieldToUser: true,
        label: '自动定位',
        onAborted: reason => {
            abortedWith = reason
        }
    })
    await new Promise(resolve => setTimeout(resolve, 60))
    noteUserIntent()
    await scrolling
    const attemptsAtAbort = counter.attempts()
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(counter.attempts(), attemptsAtAbort, '让位后不许再写滚动')
    assert.equal(abortedWith, 'user-scroll')
    resetUserScrollIntent()
})
test('yieldToUser：用户已经滚动过时一次都不滚', async () => {
    const counter = installStubs()
    resetUserScrollIntent()
    noteUserIntent()
    await documentScrollTo(500, { retryBudgetMs: 1000, retryDelay: 20, yieldToUser: true })
    assert.equal(counter.attempts(), 0)
    resetUserScrollIntent()
})
test('默认不让位：不带 yieldToUser 时行为与旧版一致', async () => {
    const counter = installStubs()
    resetUserScrollIntent()
    noteUserIntent()
    await assert.rejects(documentScrollTo(500, { retryBudgetMs: 100 }), /滚动未到位/)
    assert.ok(counter.attempts() > 0, '用户刚滚过也必须照旧重试（显式定位等场景靠这条）')
    resetUserScrollIntent()
})
test('显式定位（yieldToUser:false）在意图窗口内也照常滚过去', async () => {
    let attempts = 0
    const win = globalThis.window as unknown as { scrollY: number, scrollTo: () => void }
    win.scrollY = 0
    win.scrollTo = () => {
        attempts++
        win.scrollY = 500
    }
    ;(globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => void }).requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
    resetUserScrollIntent()
    noteUserIntent() // 刚滚动过（用户点了「定位」按钮/播放器画面）
    await documentScrollTo(500, { retryBudgetMs: 300, retryDelay: 10, label: '显式定位' })
    assert.equal(attempts, 1, '显式定位不受让位窗口影响')
    resetUserScrollIntent()
})
