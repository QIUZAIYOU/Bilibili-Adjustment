import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUpdateItems } from '@/utils/update-items'
test('更新说明：按 ; 分割，保持条目顺序', () => {
    const items = parseUpdateItems('3.30.0：新增A; 3.29.0：修复B;')
    assert.deepEqual(items, [
        { version: '3.30.0', desc: '新增A' },
        { version: '3.29.0', desc: '修复B' }
    ])
})
test('更新说明：无分号时按换行分割，并滤掉纯 -/= 分隔行', () => {
    const items = parseUpdateItems('更新日志\n-------\n3.31.0：新功能\n=======\n3.30.0：修 bug')
    assert.deepEqual(items.map(i => i.desc), ['更新日志', '新功能', '修 bug'])
    assert.deepEqual(items.map(i => i.version), ['', '3.31.0', '3.30.0'])
})
test('更新说明：无版本号的条目 version 为空串（不产生徽章）', () => {
    const items = parseUpdateItems('3.31.0：新功能; 杂项说明')
    assert.equal(items[1].version, '')
    assert.equal(items[1].desc, '杂项说明')
})
test('更新说明：空值/非法输入返回空数组，非字符串数组原样解析', () => {
    assert.deepEqual(parseUpdateItems(''), [])
    assert.deepEqual(parseUpdateItems(null), [])
    assert.deepEqual(parseUpdateItems(undefined), [])
    assert.deepEqual(parseUpdateItems(['1.2.3：来自数组']), [{ version: '1.2.3', desc: '来自数组' }])
})
