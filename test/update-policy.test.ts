import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    parseCoreVersion,
    isFeatureLevelUpdate,
    isComparableBuildSha,
    isSameVersionRebuild,
    isSameVersionRepublish,
    formatPendingUpdateHint,
    parseRemoteBuildInfo,
    parsePackageInfo,
    parseScriptMetaInfo,
    parseGiteeContentsInfo
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
test('isSameVersionRepublish：版本号必须真的相同（修「刚升级完却提示内容已更新」）', () => {
    // 真·同版本覆盖发布：版本相同 + 构建标识不同
    assert.equal(isSameVersionRepublish('3.35.8', '3.35.8', '79e8192', 'aaaaaaa'), true)
    // ⚠️ 2026-09-18 的线上误报形态：本地刚升到 3.35.8，检查读到缓存里的 3.35.7 meta.js（sha 是上一版）
    // → 旧实现只看「线上不比本地新 + sha 不同」就判成覆盖发布，于是提示用户重新安装
    assert.equal(isSameVersionRepublish('3.35.8', '3.35.7', '79e8192', 'f36e951'), false)
    // 线上更新（版本不同）也不是覆盖发布
    assert.equal(isSameVersionRepublish('3.35.7', '3.35.8', 'f36e951', '79e8192'), false)
    // 版本相同且构建标识相同 → 已是最新，不是覆盖发布
    assert.equal(isSameVersionRepublish('3.35.8', '3.35.8', '79e8192', '79e8192'), false)
    // 镜像源没有 sha → 不判定
    assert.equal(isSameVersionRepublish('3.35.8', '3.35.8', '79e8192', ''), false)
    assert.equal(isSameVersionRepublish('3.35.8', '3.35.8', '79e8192-dirty', 'aaaaaaa'), false)
})
test('formatPendingUpdateHint：有新版本用「- 有新版本 vX -」，覆盖发布提示重新安装，都没有则空串', () => {
    assert.equal(formatPendingUpdateHint('3.35.5', false), '- 有新版本 v3.35.5 -')
    // 两者都为真时以「有新版本」优先（与 update.service 的口径一致）
    assert.equal(formatPendingUpdateHint('3.35.5', true), '- 有新版本 v3.35.5 -')
    assert.equal(formatPendingUpdateHint(null, true), '内容已更新，点击重新安装')
    assert.equal(formatPendingUpdateHint(null, false), '')
    assert.equal(formatPendingUpdateHint(undefined, false), '')
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
test('parsePackageInfo：解析 package.json，缺版本号或坏数据返回 null', () => {
    assert.deepEqual(parsePackageInfo('{"version":"3.35.0","updates":"3.35.0：示例;3.34.4：旧"}'), { version: '3.35.0', updates: '3.35.0：示例;3.34.4：旧' })
    assert.deepEqual(parsePackageInfo('{"version":"3.35.0"}'), { version: '3.35.0', updates: '' })
    assert.equal(parsePackageInfo('{"updates":"x"}'), null)
    assert.equal(parsePackageInfo('not json'), null)
    assert.equal(parsePackageInfo(null), null)
})
test('parseScriptMetaInfo：一份 meta.js 同时取出 version / updates / @build-sha', () => {
    const meta = [
        '// ==UserScript==',
        '// @name         哔哩哔哩（bilibili.com）调整',
        '// @version      3.35.0',
        '// @build-sha    9911c09',
        '// @updates      3.35.0：示例更新;3.34.4：旧更新',
        '// ==/UserScript=='
    ].join('\n')
    assert.deepEqual(parseScriptMetaInfo(meta), { version: '3.35.0', updates: '3.35.0：示例更新;3.34.4：旧更新', sha: '9911c09' })
    // 旧产物没有 @build-sha：sha 为空串，但版本仍可用
    assert.deepEqual(parseScriptMetaInfo('// @version 3.35.0\n'), { version: '3.35.0', updates: '', sha: '' })
    assert.equal(parseScriptMetaInfo('// @name x'), null)
    assert.equal(parseScriptMetaInfo(''), null)
    assert.equal(parseScriptMetaInfo(undefined), null)
})
test('parseGiteeContentsInfo：解码 Gitee API 的 base64 内容（中文 updates 不乱码）', () => {
    const pkg = { version: '3.35.0', updates: '3.35.0：更新提示改为分级;3.34.4：旧' }
    // Gitee API 返回：content 为文件内容的 base64（UTF-8 字节）
    const b64 = Buffer.from(JSON.stringify(pkg), 'utf8').toString('base64')
    assert.deepEqual(
        parseGiteeContentsInfo(JSON.stringify({ content: b64, encoding: 'base64', path: 'package.json' })),
        { version: '3.35.0', updates: '3.35.0：更新提示改为分级;3.34.4：旧' }
    )
    // 带换行的 base64 也要能解
    const wrapped = b64.replace(/(.{20})/g, '$1\n')
    assert.equal(parseGiteeContentsInfo(JSON.stringify({ content: wrapped, encoding: 'base64' }))?.version, '3.35.0')
    // encoding 非 base64：按明文 JSON 处理
    assert.equal(parseGiteeContentsInfo(JSON.stringify({ content: '{"version":"3.36.0"}' }))?.version, '3.36.0')
    assert.equal(parseGiteeContentsInfo(JSON.stringify({ encoding: 'base64' })), null)
    assert.equal(parseGiteeContentsInfo('{"message":"Not Found"}'), null)
    assert.equal(parseGiteeContentsInfo('not json'), null)
    assert.equal(parseGiteeContentsInfo(null), null)
})
