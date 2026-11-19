import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTooltipPosition, TOOLTIP_EDGE, TOOLTIP_GAP } from '../src/utils/tooltip-position'
/** 图标矩形构造（视觉像素） */
const icon = (overrides: Partial<{ top: number, bottom: number, left: number, width: number }> = {}) => ({
    top: 400,
    bottom: 420,
    left: 1000,
    width: 20,
    ...overrides
})
test('zoom=1：说明框在图标下方居中，间距 8px', () => {
    const position = computeTooltipPosition(icon(), { width: 320, height: 80 }, { width: 1920, height: 1080 }, 1)
    assert.equal(position.placement, 'below')
    assert.equal(position.left, 850)
    assert.equal(position.top, 428)
})
test('zoom=2：坐标是布局像素，乘以 zoom 后仍与视觉图标对齐', () => {
    // 4K 下图标被放大一倍：left 2000、width 40、bottom 840
    const position = computeTooltipPosition(
        { top: 800, bottom: 840, left: 2000, width: 40 },
        { width: 640, height: 160 },
        { width: 3840, height: 2160 },
        2
    )
    const visualLeft = position.left * 2
    const visualTop = position.top * 2
    // 视觉上：居中 → 2020 - 320 = 1700；下方 → 840 + 16 = 856
    assert.equal(visualLeft, 1700)
    assert.equal(visualTop, 856)
    assert.equal(position.placement, 'below')
})
test('右侧越界：水平夹取到视口内', () => {
    const position = computeTooltipPosition(icon({ left: 1900 }), { width: 320, height: 80 }, { width: 1920, height: 1080 }, 1)
    assert.equal(position.left, 1920 - 320 - TOOLTIP_EDGE)
})
test('底部放不下：翻转到图标上方，且不越出视口顶部', () => {
    const position = computeTooltipPosition(icon({ top: 1000, bottom: 1020 }), { width: 320, height: 120 }, { width: 1920, height: 1080 }, 1)
    assert.equal(position.placement, 'above')
    assert.equal(position.top, 1000 - 120 - TOOLTIP_GAP)
    const tooHigh = computeTooltipPosition(icon({ top: 20, bottom: 1020 }), { width: 320, height: 60 }, { width: 1920, height: 1080 }, 1)
    if (tooHigh.placement === 'above') assert.ok(tooHigh.top >= TOOLTIP_EDGE)
})
test('非法 zoom 按 1 处理；极端尺寸不产生 NaN', () => {
    const base = computeTooltipPosition(icon(), { width: 320, height: 80 }, { width: 1920, height: 1080 }, Number.NaN)
    assert.deepEqual(base, computeTooltipPosition(icon(), { width: 320, height: 80 }, { width: 1920, height: 1080 }, 1))
    const tiny = computeTooltipPosition(icon({ left: 0, width: 0 }), { width: 5000, height: 5000 }, { width: 1920, height: 1080 }, 1)
    for (const value of Object.values(tiny)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `不应出现 NaN：${String(value)}`)
    }
})
