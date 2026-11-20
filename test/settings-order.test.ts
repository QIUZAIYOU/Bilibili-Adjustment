import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { videoSettingsConfig } from '../src/config/settings-config'
test('设置分组顺序：黑名单紧跟在账号之后', () => {
    const ids = videoSettingsConfig.map(section => section.id)
    const account = ids.indexOf('account_section')
    const blocklist = ids.indexOf('up_blocklist_section')
    assert.notEqual(account, -1)
    assert.equal(blocklist, account + 1, `实际顺序：${ids.join(' → ')}`)
    assert.equal(ids[blocklist + 1], 'player_section')
})
