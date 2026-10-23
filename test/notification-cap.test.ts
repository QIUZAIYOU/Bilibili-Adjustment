import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
/**
 * 通知条数超过上限时不得死循环（2026-10-24 修的真实卡死 bug）
 *
 * 原来 `notification.show` 摘旧通知时只调 `_dismiss()`（加淡出类、300ms 后才移除节点），
 * 而 `while (container.children.length >= 5)` 判的是**当前子节点数** —— 节点没被摘掉，
 * 条件永远成立 → **死循环把整个页面卡死**（100% CPU、标签页无响应）。
 * 触发路径很现实：任何模块连续 5 次 `logger.warn/error`（都会弹通知）就会踩到。
 *
 * 这里必须**跑在子进程里**断言：死循环是同步的，会把事件循环整个卡住，
 * 同进程内的超时定时器根本轮不到触发，测试会变成"挂死"而不是"失败"。
 * 子进程超时由 execFileSync 的 timeout 兜住 → 回归时表现为一条干净的失败。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 通知条数上限（对应 src/components/notification.ts 里的 NOTIFICATION_MAX） */
const MAX = 5
const CHILD = `
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://www.bilibili.com/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0)
const { notification } = await import('@/components/notification')
for (let i = 0; i < 8; i++) notification.show({ level: 'warn', title: 't' + i, message: 'm' })
const container = document.getElementById('ba-notification-container')
console.log('COUNT=' + container.children.length)
`
test('通知超过上限时不会死循环', () => {
    const out = execFileSync(process.execPath, ['--import', './test/alias-loader.js', '--input-type=module', '-e', CHILD], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 10000
    })
    const matched = /COUNT=(\d+)/.exec(out)
    assert.ok(matched, `子进程没有输出统计结果：${out}`)
    const count = Number(matched[1])
    assert.ok(count > 0, '没有生成通知容器')
    assert.ok(count <= MAX, `通知条数应不超过上限 ${MAX}，实际 ${count}`)
})
