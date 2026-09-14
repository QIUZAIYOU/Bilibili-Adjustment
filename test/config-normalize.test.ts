import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfigValue } from '../src/config/config-normalize'
// issue #27：设置面板存的是字符串（原生 select 的 value 恒为 string），
// 读取方按类型判断就会得到相反结论 —— 这里是该归一化逻辑的回归防线
test('normalizeConfigValue：下拉字符串按默认值类型归一化为数字', () => {
    assert.equal(normalizeConfigValue(24, '72'), 72)
    assert.equal(normalizeConfigValue(24, '6'), 6)
    assert.equal(normalizeConfigValue(24, 12), 12)
    assert.equal(normalizeConfigValue(24, '3.5'), 3.5)
})
test('normalizeConfigValue：复选框字符串归一化为布尔', () => {
    assert.equal(normalizeConfigValue(false, 'true'), true)
    assert.equal(normalizeConfigValue(false, 'false'), false)
    assert.equal(normalizeConfigValue(false, true), true)
    assert.equal(normalizeConfigValue(false, false), false)
    assert.equal(normalizeConfigValue(false, ''), false)
    assert.equal(normalizeConfigValue(false, undefined), false)
    assert.equal(normalizeConfigValue(false, 0), false)
})
test('normalizeConfigValue：不可转换的数字保持原值，缺失值不被打成 0', () => {
    assert.equal(normalizeConfigValue(24, 'abc'), 'abc')
    assert.equal(normalizeConfigValue(24, ''), '')
    assert.equal(normalizeConfigValue(24, null), null)
    assert.equal(normalizeConfigValue(24, undefined), undefined)
})
test('normalizeConfigValue：其它类型默认值原样返回', () => {
    assert.equal(normalizeConfigValue('x', 'y'), 'y')
    assert.equal(normalizeConfigValue(undefined, 5), 5)
    assert.equal(normalizeConfigValue(null, false), false)
})
