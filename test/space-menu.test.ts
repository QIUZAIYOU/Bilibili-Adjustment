import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import './browser-stubs.js'
import { isOfficialBlockItem, injectSpaceBlockItem, SPACE_BLOCK_ATTR } from '../src/features/up-blocklist/space-menu-pure'
test('isOfficialBlockItem：只认官方「加入黑名单」', () => {
    assert.equal(isOfficialBlockItem('加入黑名单'), true)
    assert.equal(isOfficialBlockItem('  加入 黑名单 '), true)
    assert.equal(isOfficialBlockItem('举报'), false)
    assert.equal(isOfficialBlockItem('取消关注'), false)
    assert.equal(isOfficialBlockItem(null), false)
})
test('空间菜单注入：插在官方项之前、复制 data-v、防重复、点击不冒泡', () => {
    const dom = new JSDOM('<!DOCTYPE html><body><div class="menu-popover__panel"><div data-v-a2606a0d class="menu-popover__panel-item">加入黑名单</div><div data-v-a2606a0d class="menu-popover__panel-item">举报</div></div></body>')
    const doc = dom.window.document
    const panel = doc.querySelector('.menu-popover__panel') as HTMLElement
    let clicked = ''
    const item = injectSpaceBlockItem(panel, '12345', uid => { clicked = uid })
    assert.ok(item)
    assert.equal(panel.firstElementChild, item, '应插在官方项之前')
    assert.equal(item?.textContent, '加入黑名单（脚本）')
    assert.equal(item?.getAttribute('data-v-a2606a0d'), '', '必须复制官方项的 scoped 属性')
    assert.equal(item?.getAttribute(SPACE_BLOCK_ATTR), '1')
    let bubbled = false
    panel.addEventListener('click', () => { bubbled = true })
    item?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(clicked, '12345')
    assert.equal(bubbled, false, '点击不应冒泡到官方菜单')
    const again = injectSpaceBlockItem(panel, '12345', () => {})
    assert.equal(again, item, '重复注入应复用已有项')
    assert.equal(panel.querySelectorAll(`[${SPACE_BLOCK_ATTR}]`).length, 1)
})
test('没有官方项时不插入', () => {
    const dom = new JSDOM('<!DOCTYPE html><body><div class="menu-popover__panel"><div class="menu-popover__panel-item">举报</div></div></body>')
    const panel = dom.window.document.querySelector('.menu-popover__panel') as HTMLElement
    assert.equal(injectSpaceBlockItem(panel, '1', () => {}), null)
    assert.equal(panel.querySelector(`[${SPACE_BLOCK_ATTR}]`), null)
})
