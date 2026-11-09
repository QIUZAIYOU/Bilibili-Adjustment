import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStableValue } from '@/utils/stable-value'
test('isStableValue：首次采样要连续 stableMs 不变才算稳定', () => {
    assert.equal(isStableValue('wide', 'wide', 1000, 1000, 600), false)
    assert.equal(isStableValue('wide', 'wide', 1000, 1599, 600), false)
    assert.equal(isStableValue('wide', 'wide', 1000, 1600, 600), true)
})
test('isStableValue：值变了就重新计时', () => {
    assert.equal(isStableValue('wide', 'normal', 1000, 2000, 600), false)
})
test('isStableValue：空值与非法时间一律不算稳定', () => {
    assert.equal(isStableValue(null, null, 1000, 2000, 600), false)
    assert.equal(isStableValue('wide', '', 1000, 2000, 600), false)
    assert.equal(isStableValue('wide', 'wide', 1000, Number.NaN, 600), false)
    assert.equal(isStableValue('wide', 'wide', Number.NaN, 2000, 600), false)
})
