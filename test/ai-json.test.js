// AI 返回内容的 JSON 解析工具单测（纯函数，不依赖网络与环境）
import test from 'node:test'
import assert from 'node:assert'
import { extractJsonArray, sanitizeJsonText, repairTruncated } from '../src/utils/ai-json.js'
// ============ extractJsonArray ============
test('extractJsonArray：标准数组', () => {
    assert.equal(extractJsonArray('[{"start":1,"end":2}]'), '[{"start":1,"end":2}]')
})
test('extractJsonArray：JSON 后面还有解释文字（旧贪婪正则会过匹配）', () => {
    const text = '识别结果如下：[{"start":1,"end":2}] 以上是全部内容。'
    assert.equal(extractJsonArray(text), '[{"start":1,"end":2}]')
})
test('extractJsonArray：JSON 之后还有另一对中括号也不会被带偏', () => {
    const text = '[{"a":1}] 补充说明[参考]'
    assert.equal(extractJsonArray(text), '[{"a":1}]')
})
test('extractJsonArray：字符串内的方括号不参与配平', () => {
    const text = '[{"summary":"包含[中括号]与]右括号"}]'
    assert.equal(extractJsonArray(text), text)
})
test('extractJsonArray：字符串内的转义引号不会提前结束字符串', () => {
    const text = '[{"s":"他说\\"你好\\"然后]"}]'
    assert.equal(extractJsonArray(text), text)
})
test('extractJsonArray：嵌套数组正确配平', () => {
    const text = '[{"a":[1,2,[3]]}]'
    assert.equal(extractJsonArray(text), text)
})
test('extractJsonArray：截断（不配平）返回 null', () => {
    assert.equal(extractJsonArray('[{"start":1,"end":2}'), null)
})
test('extractJsonArray：没有数组返回 null', () => {
    assert.equal(extractJsonArray('没有任何内容'), null)
})
// ============ sanitizeJsonText ============
test('sanitizeJsonText：中文引号转成英文', () => {
    const input = '[{"summary":\u201c推广\u201d}]'
    assert.equal(sanitizeJsonText(input), '[{"summary":"推广"}]')
})
test('sanitizeJsonText：去除零宽字符', () => {
    assert.equal(sanitizeJsonText('{"a":\u200b1}'), '{"a":1}')
})
test('sanitizeJsonText：去除尾随逗号', () => {
    assert.equal(sanitizeJsonText('[{"a":1},]'), '[{"a":1}]')
})
// ============ repairTruncated ============
test('repairTruncated：补全缺失的右括号', () => {
    const out = repairTruncated('[{"start":33.72,"end":68.96}')
    assert.equal(JSON.parse(out).length, 1)
    assert.equal(JSON.parse(out)[0].start, 33.72)
})
test('repairTruncated：字符串未闭合时先补引号再补括号', () => {
    const out = repairTruncated('[{"summary":"徐师傅流量卡')
    const parsed = JSON.parse(out)
    assert.equal(parsed[0].summary, '徐师傅流量卡')
})
test('repairTruncated：已完整的文本保持不变', () => {
    const text = '[{"a":1}]'
    assert.equal(repairTruncated(text), text)
})
// ============ 组合场景（复现线上那个 bug） ============
test('组合：真实报错内容（合法 JSON）能被解析', () => {
    const content = '[{"start": 33.72, "end": 68.96, "summary": "徐师傅流量卡与内裤推广，新店促销"}]'
    const parsed = JSON.parse(extractJsonArray(content) || content)
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].end, 68.96)
})
test('组合：模型包了 markdown 代码块也能解析', () => {
    const content = '```json\n[{"start":1,"end":2}]\n```'
    const normalized = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(extractJsonArray(normalized) || normalized)
    assert.equal(parsed[0].end, 2)
})
test('组合：被截断的输出经补全后仍可解析', () => {
    const content = '[{"start":1,"end":2,"summary":"推广'
    const repaired = repairTruncated(extractJsonArray(content) || content)
    const parsed = JSON.parse(repaired)
    assert.equal(parsed[0].start, 1)
})
