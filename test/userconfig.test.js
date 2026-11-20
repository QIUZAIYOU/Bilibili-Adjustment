import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { buildUserConfigBlock, buildUserConfigYaml } from '../scripts/userconfig.mjs'
import { fromScriptCatValue, toScriptCatValue } from '../src/utils/scriptcat-config-map'
import { dynamicSettingsConfig, videoSettingsConfig } from '../src/config/settings-config'
const collectIds = (schema) => {
    const ids = []
    const walk = items => {
        for (const item of items || []) {
            if (!item) continue
            if (item.type === 'section') { walk(item.items); continue }
            ids.push(item.id)
            if (Array.isArray(item.children)) walk(item.children)
        }
    }
    walk(schema)
    return ids
}
const yamlKeys = (yaml) => (yaml.match(/^ {2}[a-z0-9_]+:/gm) || []).map(line => line.trim().replace(':', ''))
test('buildUserConfigYaml：单个 YAML 文档，覆盖全部设置项（含动态页）', () => {
    const yaml = buildUserConfigYaml([...videoSettingsConfig, ...dynamicSettingsConfig])
    assert.equal(/^---$/m.test(yaml), false, '不能再用 --- 拆多文档')
    const expected = [...collectIds(videoSettingsConfig), ...collectIds(dynamicSettingsConfig)].sort()
    assert.deepEqual(yamlKeys(yaml).sort(), expected)
    assert.equal(yamlKeys(yaml).length, 48)
    assert.match(yaml, /"投稿视频":/)
})
test('buildUserConfigYaml：类型/选项/描述正确', () => {
    const yaml = buildUserConfigYaml(videoSettingsConfig)
    assert.match(yaml, /theme:[\s\S]*?type: select/)
    assert.match(yaml, /values: \["夜间哔哩", "跟随B站"\]/)
    assert.match(yaml, /default: "跟随B站"/)
    assert.match(yaml, /offset_top:[\s\S]*?type: number/)
    assert.match(yaml, /ai_apikey:[\s\S]*?password: true/)
    assert.equal(/<br\s*\/?>|<a\s/i.test(yaml), false)
})
test('buildUserConfigBlock：包裹注释块', () => {
    const block = buildUserConfigBlock()
    assert.ok(block.startsWith('/* ==UserConfig=='))
    assert.ok(block.endsWith('==/UserConfig== */'))
    assert.match(block, /auto_locate_video:/)
    assert.match(block, /dynamic_video_link:/)
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
