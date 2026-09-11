import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    createCacheEntry,
    validateSegment,
    mergeSegments,
    canUpdateCache,
    formatTime,
    parseTime,
    parseDuration
} from '@/modules/video/skip-manager/pure'
// ============ mergeSegments ============
test('mergeSegments：空数组返回空数组', () => {
    assert.deepEqual(mergeSegments([]), [])
})
test('mergeSegments：单片段值不变（实现会浅拷贝，避免污染入参）', () => {
    const segs = [{ start: 1, end: 5 }]
    const out = mergeSegments(segs)
    assert.deepEqual(out, segs) // 值相同
    assert.notEqual(out, segs) // 但不是同一引用：防止调用方数组被就地改写
    assert.notEqual(out[0], segs[0])
})
test('mergeSegments：重叠片段合并', () => {
    const merged = mergeSegments([{ start: 10, end: 20 }, { start: 15, end: 30 }])
    assert.deepEqual(merged, [{ start: 10, end: 30 }])
})
test('mergeSegments：无序输入按 start 排序后合并', () => {
    const merged = mergeSegments([{ start: 30, end: 40 }, { start: 5, end: 12 }, { start: 12, end: 18 }])
    assert.deepEqual(merged, [{ start: 5, end: 18 }, { start: 30, end: 40 }])
})
test('mergeSegments：相邻不重叠保持多个', () => {
    const merged = mergeSegments([{ start: 0, end: 10 }, { start: 20, end: 30 }])
    assert.deepEqual(merged, [{ start: 0, end: 10 }, { start: 20, end: 30 }])
})
// ============ validateSegment ============
test('validateSegment：完全重复冲突', () => {
    assert.ok(validateSegment({ start: 5, end: 10 }, [{ start: 5, end: 10 }]))
})
test('validateSegment：被包含冲突', () => {
    assert.ok(validateSegment({ start: 6, end: 9 }, [{ start: 5, end: 10 }]))
})
test('validateSegment：开始落在已有区间内冲突', () => {
    assert.ok(validateSegment({ start: 7, end: 15 }, [{ start: 5, end: 10 }]))
})
test('validateSegment：结束落在已有区间内冲突', () => {
    assert.ok(validateSegment({ start: 1, end: 6 }, [{ start: 5, end: 10 }]))
})
test('validateSegment：无冲突返回 null', () => {
    assert.equal(validateSegment({ start: 11, end: 15 }, [{ start: 5, end: 10 }]), null)
})
// ============ parseTime / parseDuration ============
test('parseTime：M:SS 与秒数', () => {
    assert.equal(parseTime('2:05'), 125)
    assert.equal(parseTime('90'), 90)
    assert.equal(parseTime('abc'), null)
})
test('parseDuration：30s / 1m30s / 纯数字', () => {
    assert.equal(parseDuration('30s'), 30)
    assert.equal(parseDuration('1m30s'), 90)
    assert.equal(parseDuration('90'), 90)
    assert.equal(parseDuration('x'), null)
})
// ============ formatTime ============
test('formatTime：秒转 M:SS', () => {
    assert.equal(formatTime(65), '1:05')
    assert.equal(formatTime(5), '0:05')
})
// ============ canUpdateCache ============
test('canUpdateCache：无缓存可更新', () => {
    assert.equal(canUpdateCache(null, 1), true)
})
test('canUpdateCache：锁定不可更新', () => {
    assert.equal(canUpdateCache({ locked: true }, 1), false)
})
test('canUpdateCache：未登录可更新', () => {
    assert.equal(canUpdateCache({ locked: false, uploader_uid: 5 }, null), true)
})
test('canUpdateCache：本人可更新', () => {
    assert.equal(canUpdateCache({ locked: false, uploader_uid: 5 }, 5), true)
})
test('canUpdateCache：他人可更新（locked 才是唯一保护机制）', () => {
    // 旧行为要求"必须是本人上传"，导致他人上传但未锁定的片段连编辑按钮都不显示，
    // 与锁定功能的设计意图矛盾。现在未锁定即人人可改（提交时 version 自增）。
    assert.equal(canUpdateCache({ locked: false, uploader_uid: 5 }, 6), true)
})
test('canUpdateCache：未锁定时上传者未知也可更新', () => {
    assert.equal(canUpdateCache({ locked: false, uploader_uid: null }, 6), true)
})
// ============ createCacheEntry ============
test('createCacheEntry：结构完整', () => {
    const entry = createCacheEntry('BV1xx', [{ start: 1, end: 2 }], 42)
    assert.equal(entry.bvid, 'BV1xx')
    assert.deepEqual(entry.segments, [{ start: 1, end: 2 }])
    assert.equal(entry.uploader_uid, 42)
    assert.equal(entry.version, 1)
    assert.equal(entry.locked, false)
    assert.equal(entry.last_updated > 0, true)
})
// ============ mergeSegments：备注保留与入参隔离 ============
test('mergeSegments：合并重叠时保留备注（新片段的 summary 不应被丢弃）', () => {
    // 复现该 bug：已有片段无备注，新识别出的片段有备注，二者重叠
    const out = mergeSegments([
        { start: 29, end: 54 },
        { start: 52, end: 74, summary: '徐师傅流量卡与内裤推广' }
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].start, 29)
    assert.equal(out[0].end, 74)
    assert.equal(out[0].summary, '徐师傅流量卡与内裤推广')
})
test('mergeSegments：两段都有备注时取更长的', () => {
    const out = mergeSegments([
        { start: 0, end: 10, summary: '推广' },
        { start: 5, end: 20, summary: '某品牌推广，附优惠码' }
    ])
    assert.equal(out[0].summary, '某品牌推广，附优惠码')
})
test('mergeSegments：已有备注非空时不被空备注覆盖', () => {
    const out = mergeSegments([
        { start: 0, end: 10, summary: '保留这条' },
        { start: 5, end: 20 }
    ])
    assert.equal(out[0].summary, '保留这条')
})
test('mergeSegments：不污染传入数组（就地改写 bug 的回归保护）', () => {
    const input = [{ start: 0, end: 10 }, { start: 5, end: 20 }]
    const snapshot = JSON.stringify(input)
    mergeSegments(input)
    assert.equal(JSON.stringify(input), snapshot)
})
