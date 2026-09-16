import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    parseCoreVersion,
    isFeatureLevelUpdate,
    isComparableBuildSha,
    isSameVersionRebuild,
    parseRemoteBuildInfo
} from '@/utils/update-policy'
test('parseCoreVersion：解析核心段，预发布后缀不参与', () => {
    assert.deepEqual(parseCoreVersion('3.34.4'), [3, 34, 4])
    assert.deepEqual(parseCoreVersion('3.35.0-beta.1'), [3, 35, 0])
    assert.deepEqual(parseCoreVersion('3.34'), [3, 34])
})
test('isFeatureLevelUpdate：只有 major/minor（X 位）变化才算功能级（才弹窗）', () => {
    // 补丁级：不弹窗
    assert.equal(isFeatureLevelUpdate('3.34.4', '3.34.5'), false)
    assert.equal(isFeatureLevelUpdate('3.34.4', '3.34.10'), false)
    // 功能级：弹窗
    assert.equal(isFeatureLevelUpdate('3.34.4', '3.35.0'), true)
    assert.equal(isFeatureLevelUpdate('3.34.4', '4.0.0'), true)
    assert.equal(isFeatureLevelUpdate('3.34.4', '3.35.0-beta.1'), true)
})
test('isComparableBuildSha：未注入 / unknown / 工作区脏 一律不参与比对', () => {
    assert.equal(isComparableBuildSha('a1b2c3d'), true)
    assert.equal(isComparableBuildSha(''), false)
    assert.equal(isComparableBuildSha('unknown'), false)
    assert.equal(isComparableBuildSha('a1b2c3d-dirty'), false)
    assert.equal(isComparableBuildSha(undefined), false)
    assert.equal(isComparableBuildSha(null), false)
})
test('isSameVersionRebuild：本地与线上构建标识不一致才算「同版本覆盖发布」', () => {
    assert.equal(isSameVersionRebuild('a1b2c3d', 'e4f5g6h'), true)
    assert.equal(isSameVersionRebuild('a1b2c3d', 'a1b2c3d'), false)
    // 任一侧不可比 → 不提示（避免本地开发 / 拿不到 version.json 时误报）
    assert.equal(isSameVersionRebuild('a1b2c3d-dirty', 'e4f5g6h'), false)
    assert.equal(isSameVersionRebuild('a1b2c3d', ''), false)
    assert.equal(isSameVersionRebuild('', 'e4f5g6h'), false)
    assert.equal(isSameVersionRebuild('unknown', 'e4f5g6h'), false)
})
test('parseRemoteBuildInfo：解析 version.json，坏数据一律返回 null', () => {
    assert.deepEqual(
        parseRemoteBuildInfo('{"version":"3.34.4","sha":"a1b2c3d","builtAt":"2026-09-16T11:40:00+08:00","size":1,"sha256":"x"}'),
        { version: '3.34.4', sha: 'a1b2c3d', builtAt: '2026-09-16T11:40:00+08:00' }
    )
    // 缺 sha / 缺 builtAt 时容忍（只用 version + sha 做判断）
    assert.deepEqual(parseRemoteBuildInfo('{"version":"3.35.0"}'), { version: '3.35.0', sha: '', builtAt: '' })
    assert.equal(parseRemoteBuildInfo('{"sha":"a1b2c3d"}'), null)
    assert.equal(parseRemoteBuildInfo('not json'), null)
    assert.equal(parseRemoteBuildInfo(''), null)
    assert.equal(parseRemoteBuildInfo(null), null)
    assert.equal(parseRemoteBuildInfo('[]'), null)
})
