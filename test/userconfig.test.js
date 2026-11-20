import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { buildUserConfigBlock, buildUserConfigYaml } from '../scripts/userconfig.mjs'
import { fromScriptCatValue, toScriptCatValue } from '../src/utils/scriptcat-config-map'
import { videoSettingsConfig } from '../src/config/settings-config'
test('buildUserConfigYaml：覆盖各分组、类型正确、选项用 label', () => {
    const yaml = buildUserConfigYaml(videoSettingsConfig)
    assert.match(yaml, /"界面与播放器":/)
    assert.match(yaml, /theme:[\s\S]*?type: select/)
    assert.match(yaml, /values: \["夜间哔哩", "跟随B站"\]/)
    assert.match(yaml, /default: "跟随B站"/)
    assert.match(yaml, /home_video_preview:[\s\S]*?type: checkbox/)
    assert.match(yaml, /offset_top:[\s\S]*?type: number/)
    assert.match(yaml, /ai_apikey:[\s\S]*?password: true/)
    // 描述里不能留 HTML 标签
    assert.equal(/<br\s*\/?>|<a\s/i.test(yaml), false)
})
test('buildUserConfigBlock：包裹注释块，且 sub-section 与动态页也包含', () => {
    const block = buildUserConfigBlock()
    assert.ok(block.startsWith('/* ==UserConfig=='))
    assert.ok(block.endsWith('==/UserConfig== */'))
    assert.match(block, /auto_locate_video:/)
    assert.match(block, /"投稿视频":/)
})
test('脚本猫面板值 ↔ 内部值：label 互转、布尔、数字', () => {
    const theme = videoSettingsConfig
        .flatMap(section => section.items || [])
        .find(item => item.id === 'theme')
    assert.equal(toScriptCatValue(theme, 'night'), '夜间哔哩')
    assert.equal(fromScriptCatValue(theme, '夜间哔哩'), 'night')
    assert.equal(fromScriptCatValue(theme, 'night'), 'night')
    const checkbox = { id: 'x', type: 'checkbox', defaultValue: false }
    assert.equal(toScriptCatValue(checkbox, 1), true)
    assert.equal(fromScriptCatValue(checkbox, 'true'), true)
    assert.equal(fromScriptCatValue(checkbox, false), false)
    const number = { id: 'n', type: 'input', inputType: 'number', defaultValue: 8 }
    assert.equal(toScriptCatValue(number, '12'), 12)
    assert.equal(fromScriptCatValue(number, '12'), 12)
    assert.equal(fromScriptCatValue(number, 'abc'), undefined)
})
