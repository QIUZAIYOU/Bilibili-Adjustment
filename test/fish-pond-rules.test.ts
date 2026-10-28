import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    FISH_THRESHOLD,
    blueRatio,
    cleanText,
    detectCallouts,
    isFishName,
    judgeAccount,
    levelOf,
    scoreAccount,
    scoreText
} from '../src/features/fish-pond/rules'
import type { CalloutItem } from '../src/features/fish-pond/rules'
test('cleanText：抹掉零宽字符与全角空格（防用不可见字符绕过规则）', () => {
    assert.equal(cleanText('大\u200b肥\ufeff鱼　本鱼'), '大肥鱼 本鱼')
    assert.equal(cleanText(undefined), '')
    assert.equal(cleanText(null), '')
})
test('scoreText：鱼味文本能拿到明显分（自称本鲸 + 鲸鱼动作）', () => {
    const verdict = scoreText('本鲸游过来打卡，咕噜咕噜（摇摇尾巴）')
    assert.ok(verdict.score >= 40, `期望 ≥40，实际 ${verdict.score}`)
    assert.ok(verdict.reasons.some(reason => reason.tag === 'text'))
})
test('scoreText：真人提问不判鱼（负分修正生效）', () => {
    const verdict = scoreText('请问这个怎么弄？')
    assert.ok(verdict.score < 20, `期望 <20，实际 ${verdict.score}`)
})
test('scoreAccount：名字 + 签名双重命中就能过线', () => {
    const verdict = scoreAccount({ mid: '1', uname: '大肥鱼本鱼', sign: '家养的电子宠物，主人管饭' })
    assert.ok(verdict.score >= FISH_THRESHOLD, `期望 ≥${FISH_THRESHOLD}，实际 ${verdict.score}`)
})
test('isFishName：宠物式鱼名与普通人名', () => {
    assert.equal(isFishName('某某的鲸'), true)
    // 只有单个「鲸」字（30 分）不够过线：弱信号必须叠加，避免误伤普通人名
    assert.equal(isFishName('小鲸鱼'), false)
    assert.equal(isFishName('大肥鱼'), true)
    assert.equal(isFishName('张三'), false)
})
test('judgeAccount：账号与评论都像鱼 → fish；普通人 → human', () => {
    const fish = judgeAccount({ mid: '2', uname: '小鲸鱼', sign: '本鲸负责刷评论' }, ['本鲸来打卡（吐泡泡）'])
    assert.equal(levelOf(fish.score), 'fish')
    const human = judgeAccount({ mid: '3', uname: '阿强' }, ['这个视频挺好看的，谢谢分享'])
    assert.equal(levelOf(human.score), 'human')
})
test('levelOf：按分数线分档', () => {
    assert.equal(levelOf(FISH_THRESHOLD), 'fish')
    assert.equal(levelOf(40), 'suspect')
    assert.equal(levelOf(0), 'human')
})
test('blueRatio：蓝头像算得出比例，灰色接近 0', () => {
    const blue = new Uint8ClampedArray([
        60, 130, 240, 255,
        80, 150, 250, 255
    ])
    const gray = new Uint8ClampedArray([
        128, 128, 128, 255,
        120, 120, 120, 255
    ])
    assert.ok(blueRatio(blue) > 0.9)
    assert.ok(blueRatio(gray) < 0.1)
})
test('detectCallouts：统计谁被点名', () => {
    const list: CalloutItem[] = [
        { mid: '10', uname: '大肥鱼', rpid: '1', root: '', text: '打卡' },
        { mid: '11', uname: '小明', rpid: '2', root: '1', text: '又是你这只大肥鱼', isReply: true }
    ]
    const called = detectCallouts(list)
    assert.equal(called.get('10'), 1)
})
