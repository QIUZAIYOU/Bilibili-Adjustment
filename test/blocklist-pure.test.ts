import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatFansCount, normalizeBlockedUp, parseUidInput } from '../src/modules/home/blocklist/pure'
test('parseUidInput：纯 UID / 空间链接都能解析，其它返回空串', () => {
    assert.equal(parseUidInput('12345'), '12345')
    assert.equal(parseUidInput(' 12345 '), '12345')
    assert.equal(parseUidInput('https://space.bilibili.com/12345'), '12345')
    assert.equal(parseUidInput('//space.bilibili.com/12345?spm=1'), '12345')
    assert.equal(parseUidInput('space.bilibili.com/12345'), '12345')
    assert.equal(parseUidInput('https://space.bilibili.com/abc'), '')
    assert.equal(parseUidInput('uid=12345'), '')
    assert.equal(parseUidInput('1234567890123'), '')
    assert.equal(parseUidInput(''), '')
    assert.equal(parseUidInput(undefined), '')
})
test('formatFansCount：万/亿口径', () => {
    assert.equal(formatFansCount(999), '999')
    assert.equal(formatFansCount(12345), '1.2万')
    assert.equal(formatFansCount(10000), '1万')
    assert.equal(formatFansCount(123456789), '1.2亿')
    assert.equal(formatFansCount(0), '0')
    assert.equal(formatFansCount('abc'), '0')
})
test('normalizeBlockedUp：脏数据丢弃，缺昵称也丢弃（没有昵称无法匹配卡片）', () => {
    const valid = normalizeBlockedUp({ uid: 12345, name: ' UP ', face: 'http://x/a.jpg', fans: 100, sign: '签名', ts: 1 })
    assert.deepEqual(valid, { uid: '12345', name: 'UP', face: '', fans: 100, sign: '签名', ts: 1 })
    assert.equal(normalizeBlockedUp({ uid: 'abc', name: 'x' }), null)
    assert.equal(normalizeBlockedUp({ uid: '123', name: '' }), null)
    assert.equal(normalizeBlockedUp(null), null)
    assert.equal(normalizeBlockedUp('x'), null)
})
