import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldAcceptPlayerLocateClick } from '@/utils/player-click'
test('shouldAcceptPlayerLocateClick：真实点击画面区才定位', () => {
    assert.equal(shouldAcceptPlayerLocateClick({ isTrusted: true, insideControls: false }), true)
})
test('shouldAcceptPlayerLocateClick：脚本合成的点击（宽屏/静音/清晰度按钮）不算', () => {
    assert.equal(shouldAcceptPlayerLocateClick({ isTrusted: false, insideControls: false }), false)
})
test('shouldAcceptPlayerLocateClick：真实点击控制条不算', () => {
    assert.equal(shouldAcceptPlayerLocateClick({ isTrusted: true, insideControls: true }), false)
})
test('shouldAcceptPlayerLocateClick：合成点击控制条也不算', () => {
    assert.equal(shouldAcceptPlayerLocateClick({ isTrusted: false, insideControls: true }), false)
})
