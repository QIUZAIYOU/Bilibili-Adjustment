/**
 * 设置弹窗 · 导航落点与 tips 说明框位置探针
 *
 * 用法：ADJ_E2E_HEADLESS=1 node test/e2e/settings-dialog.mjs
 * 分别在 1920×1080（zoom=1）与 3840×2160（zoom=2）下验证。
 */
import { launchBrowser, openWithUserscript, waitFor } from './harness.mjs'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const browser = await launchBrowser()
const openSettings = async (viewport) => {
    const page = await openWithUserscript(browser, 'https://www.bilibili.com/', { config: {}, viewport })
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-palette-settings-btn'))), { timeout: 30000, label: '首页设置按钮' })
    await page.evaluate(() => document.querySelector('.adj-palette-settings-btn')?.click())
    await waitFor(async () => page.evaluate(() => {
        const popover = document.querySelector('.adjustment-popover')
        return Boolean(popover) && popover.matches(':popover-open') && Boolean(document.querySelector('.adjustment-section'))
    }), { timeout: 20000, label: '设置弹窗与分组' })
    await sleep(500)
    return page
}
const runCase = async (width, height) => {
    const page = await openSettings({ width, height })
    const zoom = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.adjustment-popover')).zoom) || 1)
    const expectedZoom = Math.min(2, Math.max(1, width / 1920))
    check(`${width}×${height}：弹窗 zoom=${expectedZoom}`, Math.abs(zoom - expectedZoom) < 0.01, `实测 ${zoom}`)

    // ---- 1. 导航点击落点 ----
    const navResult = await page.evaluate(async () => {
        const popover = document.querySelector('.adjustment-popover')
        const header = document.querySelector('.adjustment-popover-header')
        const buttons = Array.from(document.querySelectorAll('.adjustment-settings-nav-item'))
        const button = buttons.find(item => item.textContent.trim() === '评论区')
        if (!button) return { error: '未找到「评论区」导航项' }
        button.click()
        const before = popover.scrollTop
        let last = before
        let stable = 0
        for (let i = 0; i < 80; i++) {
            await new Promise(resolve => setTimeout(resolve, 50))
            const now = popover.scrollTop
            stable = Math.abs(now - last) < 0.5 ? stable + 1 : 0
            last = now
            if (stable >= 4) break
        }
        const section = document.querySelector('.adjustment-section.comment_section')
        return {
            zoom: parseFloat(getComputedStyle(popover).zoom) || 1,
            headerBottom: header.getBoundingClientRect().bottom,
            sectionTop: section.getBoundingClientRect().top,
            scrollTop: popover.scrollTop
        }
    })
    if (navResult.error) {
        check('导航点击', false, navResult.error)
    } else {
        const gap = navResult.sectionTop - navResult.headerBottom
        const expectedGap = 12 * navResult.zoom
        check(`${width}×${height}：导航跳转落点间距=${expectedGap.toFixed(1)}px`, Math.abs(gap - expectedGap) <= 8, `实测 ${gap.toFixed(1)}px（scrollTop=${navResult.scrollTop.toFixed(1)}）`)
    }

    // ---- 2. tips 说明框位置 ----
    const tip = await page.evaluate(async () => {
        const candidates = Array.from(document.querySelectorAll('.adjustment-section .adjustment-tips-icon[data-tooltip]'))
        const icon = candidates.find(item => {
            const rect = item.getBoundingClientRect()
            return rect.top > 40 && rect.bottom < window.innerHeight - 40
        })
        if (!icon) return { error: '未找到可见的 tips 图标' }
        icon.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 50))
            const tooltip = document.querySelector('.adjustment-tooltip')
            if (tooltip && tooltip.style.display === 'block' && tooltip.style.opacity === '1') break
        }
        const tooltip = document.querySelector('.adjustment-tooltip')
        const iconRect = icon.getBoundingClientRect()
        const tooltipRect = tooltip ? tooltip.getBoundingClientRect() : null
        return {
            zoom: parseFloat(getComputedStyle(document.querySelector('.adjustment-popover')).zoom) || 1,
            icon: { left: iconRect.left, centerX: iconRect.left + iconRect.width / 2, bottom: iconRect.bottom },
            tooltip: tooltipRect ? {
                left: tooltipRect.left,
                top: tooltipRect.top,
                right: tooltipRect.right,
                bottom: tooltipRect.bottom,
                centerX: tooltipRect.left + tooltipRect.width / 2,
                display: tooltip.style.display,
                position: tooltip.style.position
            } : null,
            viewport: { width: window.innerWidth, height: window.innerHeight }
        }
    })
    if (tip.error) {
        check('tips 说明框', false, tip.error)
    } else if (!tip.tooltip) {
        check('tips 说明框', false, '说明框未显示')
    } else {
        const centerDelta = Math.abs(tip.tooltip.centerX - tip.icon.centerX)
        const gap = tip.tooltip.top - tip.icon.bottom
        const expectedGap = 8 * tip.zoom
        check(`${width}×${height}：说明框水平居中（偏差 ≤6px）`, centerDelta <= 6, `实测 ${centerDelta.toFixed(1)}px`)
        check(`${width}×${height}：说明框与图标间距=${expectedGap.toFixed(1)}px`, gap >= expectedGap - 4 * tip.zoom && gap <= expectedGap + 4 * tip.zoom, `实测 ${gap.toFixed(1)}px（top=${tip.tooltip.top.toFixed(1)}）`)
        check(`${width}×${height}：说明框完整落在视口内`, tip.tooltip.left >= 0 && tip.tooltip.right <= tip.viewport.width && tip.tooltip.top >= 0 && tip.tooltip.bottom <= tip.viewport.height,
            `rect=${tip.tooltip.left.toFixed(0)},${tip.tooltip.top.toFixed(0)}→${tip.tooltip.right.toFixed(0)},${tip.tooltip.bottom.toFixed(0)}`)
    }
    await page.close()
}
try {
    await runCase(1920, 1080)
    await runCase(3840, 2160)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n设置弹窗探针全部通过')
