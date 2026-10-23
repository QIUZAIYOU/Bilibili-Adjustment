import { test } from 'node:test'
import assert from 'node:assert/strict'
import './browser-stubs.js'
import { normalizeUpOwner, resolveAvatarSize, resolveAvatarTip } from '@/modules/video/up-avatar-pure'
/**
 * 侧栏「UP主空间」头像按钮的纯逻辑回归（2026-10-24）
 *
 * 头像的 mid/昵称/头像地址都来自 B 站的运行时数据（接口 / sessionStorage），
 * 形状不统一、字段也可能缺；取错了就会出现「点头像进错人的空间」或「提示显示成 undefined」。
 */
test('从接口/sessionStorage 的 owner 数据里取出 mid、昵称与头像', () => {
    const owner = normalizeUpOwner({ mid: 3546866685839722, name: '兰斯的画室LanceStudio', face: 'https://i0.hdslb.com/bfs/face/xxx.jpg' })
    assert.equal(owner.mid, 3546866685839722)
    assert.equal(owner.name, '兰斯的画室LanceStudio')
    assert.equal(owner.face, 'https://i0.hdslb.com/bfs/face/xxx.jpg')
})
test('mid 是字符串时保留字符串（sessionStorage 里就是字符串）', () => {
    const owner = normalizeUpOwner({ mid: ' 3546866685839722 ', name: '某人' })
    assert.equal(owner.mid, '3546866685839722')
})
test('昵称里的多余空白被折叠；缺字段时返回 undefined 而不是脏值', () => {
    assert.equal(normalizeUpOwner({ name: '  兰斯 的  画室 ' }).name, '兰斯 的 画室')
    assert.equal(normalizeUpOwner({ name: '   ' }).name, undefined)
    assert.equal(normalizeUpOwner({}).mid, undefined)
    assert.equal(normalizeUpOwner({}).face, undefined)
})
test('非对象输入（null/undefined/字符串）不抛错，返回空对象', () => {
    assert.deepEqual(normalizeUpOwner(null), {})
    assert.deepEqual(normalizeUpOwner(undefined), {})
    assert.deepEqual(normalizeUpOwner('xxx'), {})
    assert.deepEqual(normalizeUpOwner(123), {})
})
test('头像直径：量到的宽度原样用，量不到用兜底值，超范围夹紧', () => {
    // 量到的就是当前那颗按钮的宽度 → 头像与按钮等宽
    assert.equal(resolveAvatarSize(50), 50)
    assert.equal(resolveAvatarSize(48.4), 48)
    // 量不到（按钮还没布局好）→ 兜底 50px
    assert.equal(resolveAvatarSize(0), 50)
    assert.equal(resolveAvatarSize(Number.NaN), 50)
    // 离谱值夹到合理区间，避免撑破侧栏 / 小到看不清
    assert.equal(resolveAvatarSize(120), 64)
    assert.equal(resolveAvatarSize(8), 24)
})
test('悬浮提示文案：作者昵称优先，取不到用「UP主空间」', () => {
    assert.equal(resolveAvatarTip('兰斯的画室LanceStudio'), '兰斯的画室LanceStudio')
    assert.equal(resolveAvatarTip(''), 'UP主空间')
    assert.equal(resolveAvatarTip(undefined), 'UP主空间')
    assert.equal(resolveAvatarTip('  '), 'UP主空间')
})
