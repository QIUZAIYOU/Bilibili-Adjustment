import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModeDecision } from '@/utils/player-mode-decision'
const base = {
    hasContainer: true,
    currentMode: 'normal',
    targetMode: 'wide',
    movieWide: false,
    preserveActive: false,
    cooldownActive: false
}
test('resolveModeDecision：电影宽屏优先于其它一切', () => {
    assert.deepEqual(resolveModeDecision({ ...base, movieWide: true, preserveActive: true, cooldownActive: true }), { action: 'emit', reason: 'movie-wide' })
})
test('resolveModeDecision：保持模式优先于冷却与已等于目标', () => {
    assert.deepEqual(resolveModeDecision({ ...base, preserveActive: true, cooldownActive: true, currentMode: 'wide' }), { action: 'emit', reason: 'preserve' })
})
test('resolveModeDecision：冷却期不发切换', () => {
    assert.deepEqual(resolveModeDecision({ ...base, cooldownActive: true, currentMode: 'wide' }), { action: 'emit', reason: 'cooldown' })
})
test('resolveModeDecision：没有容器也不阻断事件', () => {
    assert.deepEqual(resolveModeDecision({ ...base, hasContainer: false }), { action: 'emit', reason: 'no-container' })
})
test('resolveModeDecision：已经是目标模式', () => {
    assert.deepEqual(resolveModeDecision({ ...base, currentMode: 'wide' }), { action: 'emit', reason: 'already-target' })
})
test('resolveModeDecision：目标是 normal 时不需要点按钮', () => {
    assert.deepEqual(resolveModeDecision({ ...base, targetMode: 'normal', currentMode: 'wide' }), { action: 'emit', reason: 'target-normal' })
})
test('resolveModeDecision：其余情况才真的切换', () => {
    assert.deepEqual(resolveModeDecision(base), { action: 'switch', reason: 'switch' })
})
