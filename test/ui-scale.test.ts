import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeUiZoom, UI_SCALE_MAX, UI_SCALE_MIN } from '../src/shared/ui-scale.ts'
test('1920 宽是基准，缩放为 1', () => {
    assert.equal(computeUiZoom(1920), 1)
})
test('窄屏不缩小（下限 1）', () => {
    assert.equal(computeUiZoom(1280), UI_SCALE_MIN)
    assert.equal(computeUiZoom(960), UI_SCALE_MIN)
})
test('4K 放大到 2 倍（上限 2）', () => {
    assert.equal(computeUiZoom(3840), UI_SCALE_MAX)
    assert.equal(computeUiZoom(5120), UI_SCALE_MAX)
})
test('2560 这类常见宽度按比例放大且保留三位小数', () => {
    assert.equal(computeUiZoom(2560), 1.333)
    assert.equal(computeUiZoom(2880), 1.5)
})
test('非法输入回落到 1', () => {
    for (const value of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(computeUiZoom(value), 1)
    }
})
