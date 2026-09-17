import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomStub } from '../scripts/lib/dom-stub.mjs'
import {
    analyzeRegexSource,
    checkTemplateOverride,
    isSafeCssColor,
    isSafeCssValue,
    MAX_OVERRIDE_VALUE_LENGTH,
    MAX_TEMPLATE_LENGTH
} from '@/shared/hot-config'
import { registerHotConfigTarget, setHotConfigEntries, getAcceptedEntries, clearHotConfigStateForTest } from '@/shared/hot-config-registry'
// DOM 桩必须在导入任何「模块体依赖浏览器 API」的源码之前装好（故下面用动态 import）
// 假 <style id="adj-theme-vars">：用于断言「主题覆盖后变量表被整块重写」
const fakeStyleElement = { id: 'adj-theme-vars', textContent: '初始变量表' }
installDomStub({ getElementById: id => (id === 'adj-theme-vars' ? fakeStyleElement : null) })
const { regexps } = await import('@/shared/regexps')
const { getTemplates } = await import('@/shared/templates')
const { elementSelectors } = await import('@/shared/element-selectors')
const { getSelector } = await import('@/shared/selector-registry')
// 经主题出口导入：它会连带加载 manager（themes 热更目标在那里自注册），与 main.ts 的导入路径一致
const { THEMES, night, defaultColors, defaultShadows } = await import('@/shared/theme')
const { AI_PROVIDER_CONFIGS } = await import('@/shared/ai-providers')
// ==================== 纯函数校验 ====================
test('analyzeRegexSource：放行常见安全写法', () => {
    const safe = [
        '\\bBV[0-9A-Za-z]{10}\\b',
        '(?:\\d{1,2}:)?[0-5]?\\d:[0-5]\\d',
        'https://t\\.bilibili\\.com/[0-9]+',
        '(%09)+',
        '(?:https?|ftp)://[^\\s]+',
        '^\\s*$(?:\\r?\\n?)?',
        '@([^\\s]+)'
    ]
    for (const source of safe) assert.equal(analyzeRegexSource(source), null, source)
})
test('analyzeRegexSource：拦下灾难性回溯写法与非法输入', () => {
    assert.match(String(analyzeRegexSource('(a+)+')), /嵌套量词/)
    assert.match(String(analyzeRegexSource('(\\w+\\s?)*')), /嵌套量词/)
    assert.match(String(analyzeRegexSource('(a*)*')), /嵌套量词|空串/)
    assert.match(String(analyzeRegexSource('(a?)*')), /空串/)
    assert.match(String(analyzeRegexSource('(a|aa)+')), /前缀包含/)
    assert.equal(analyzeRegexSource(42), '不是字符串')
    assert.equal(analyzeRegexSource('   '), '空内容')
    assert.match(String(analyzeRegexSource('a'.repeat(600))), /长度超限/)
})
test('checkTemplateOverride：占位符与 id 是硬契约，脚本/事件一律拒绝', () => {
    const builtIn = '<div id="box" class="c"><span>[[TEXT]]</span></div>'
    assert.equal(checkTemplateOverride('<div id="box" class="c2"><b>[[TEXT]]</b></div>', builtIn), null)
    assert.match(String(checkTemplateOverride('<div id="box" class="c"></div>', builtIn)), /缺少占位符/)
    assert.match(String(checkTemplateOverride('<div class="c">[[TEXT]]</div>', builtIn)), /缺少必需 id/)
    assert.match(String(checkTemplateOverride('<div id="box">[[TEXT]]<script>1</script></div>', builtIn)), /禁止的标签/)
    assert.match(String(checkTemplateOverride('<div id="box" onclick="x()">[[TEXT]]</div>', builtIn)), /内联事件/)
    assert.match(String(checkTemplateOverride('<a id="box" href="javascript:1">[[TEXT]]</a>', builtIn)), /javascript:/)
    assert.equal(checkTemplateOverride('', builtIn), '空内容')
    assert.equal(checkTemplateOverride(null, builtIn), '不是字符串')
    assert.match(String(checkTemplateOverride(`<div id="box">[[TEXT]]${'x'.repeat(MAX_TEMPLATE_LENGTH)}</div>`, builtIn)), /长度超限/)
})
test('CSS 值校验：只认安全色值，挡住逃出声明/引入外部资源的写法', () => {
    for (const value of ['#fff', '#FFFFFF', '#12345678', 'rgba(0,0,0,0.45)', 'hsl(210,50%,40%)', '0,174,236', '42,200,100']) {
        assert.equal(isSafeCssColor(value), true, value)
    }
    for (const value of ['red', 'url(https://evil.example/x.png)', '#fff;}body{display:none}', '#fff/*x*/', '#fff\\}', '', 'rgb(0,0,0) url(x)', 42]) {
        assert.equal(isSafeCssColor(value), false, String(value))
    }
    // 阴影用宽松值校验：允许空格/逗号/px，但仍禁止逃出声明
    assert.equal(isSafeCssValue('0 1px 3px rgba(0,0,0,0.12)'), true)
    assert.equal(isSafeCssValue('0 1px 3px; }'), false)
})
// ==================== 注册表行为 ====================
test('热更注册表：内容先到不丢、target 后到补应用；白名单与逐条丢弃', () => {
    clearHotConfigStateForTest()
    const applied: string[] = []
    // ① 内容先到：此时还没有 target → 返回 null，内容暂存
    assert.equal(setHotConfigEntries('probe', { a: '1', notAllowed: '2', boom: '3' }, 'cache'), null)
    // ② target 注册 → 立即补应用（缓存早于模块加载的真实场景）
    const report = registerHotConfigTarget('probe', {
        keys: () => ['a', 'boom'],
        apply: (key, value) => {
            if (key === 'boom') throw new Error('模拟校验失败')
            applied.push(`${key}=${String(value)}`)
            return true
        },
        afterApply: keys => applied.push(`after:${keys.join(',')}`)
    })
    assert.deepEqual(report?.applied, ['a'])
    assert.equal(report?.rejected.length, 2)
    assert.match(report!.rejected.join(' '), /notAllowed（不在白名单）/)
    assert.match(report!.rejected.join(' '), /boom（模拟校验失败）/)
    assert.deepEqual(applied, ['a=1', 'after:a'])
    // ③ 只缓存真正生效的条目（否则每次启动都要重复校验注定被丢的垃圾）
    assert.deepEqual(getAcceptedEntries('probe', report), { a: '1' })
})
test('正则覆盖：只换 source 且沿用内置 flags，非法/高风险项被丢弃', () => {
    clearHotConfigStateForTest()
    const builtInSource = regexps.video.videoId.source
    const builtInFlags = regexps.video.videoId.flags
    const report = setHotConfigEntries('regexps', {
        'video.videoId': '\\bBV[0-9A-Za-z]{10}\\b',
        'video.readId': '(a+)+',
        'video.url': '(',
        'video.notExist': 'x',
        'dynamic.DetailLink': 'https://t\\.bilibili\\.com/[0-9]+'
    }, 'remote')
    assert.deepEqual(report?.applied.sort(), ['dynamic.DetailLink', 'video.videoId'].sort())
    assert.equal(regexps.video.videoId.source, '\\bBV[0-9A-Za-z]{10}\\b')
    // flags 不可覆盖：始终沿用内置值（调用点语义与 flags 绑定）
    assert.equal(regexps.video.videoId.flags, builtInFlags)
    assert.equal(regexps.video.readId.source, '\\bcv\\d{7}\\b')
    // 未生效的 key 不会被写进缓存
    assert.deepEqual(Object.keys(getAcceptedEntries('regexps', report)).sort(), ['dynamic.DetailLink', 'video.videoId'].sort())
    assert.equal(regexps.video.videoId.source !== builtInSource, true)
})
test('模板覆盖：契约齐全才生效，缺 id/占位符即丢弃（查询路径真的读到新模板）', () => {
    clearHotConfigStateForTest()
    const key = 'indexRecommendVideoHistoryOpenButton'
    const builtIn = getTemplates[key]
    const patched = builtIn.replace('<span>历史记录</span>', '<span>观看历史</span>')
    const report = setHotConfigEntries('templates', {
        [key]: patched,
        autoEnableSubtitleSwitchButtonTip: '<div class="bpx-player-tooltip-item">少了 id 与占位符</div>',
        notExistTemplate: '<div>凭空新增</div>'
    }, 'remote')
    assert.deepEqual(report?.applied, [key])
    assert.match(getTemplates[key], /观看历史/)
    assert.match(report!.rejected.join(' '), /autoEnableSubtitleSwitchButtonTip/)
    assert.match(report!.rejected.join(' '), /notExistTemplate（不在白名单）/)
})
test('主题覆盖：只改已有 token、三主题各自独立，且不污染内置默认色板', () => {
    clearHotConfigStateForTest()
    const nightBrand = night.colors.brand
    const lightBrand = THEMES.light.colors.brand
    const report = setHotConfigEntries('themes', {
        night: { colors: { brand: '#FB7299', 'brand-rgb': '251,114,153', notAToken: '#000000', evil: '#fff;}body{display:none}' }},
        light: { colors: { brand: '#111111' }},
        dark: { shadows: { glow: '0 0 16px rgba(1,2,3,0.4)', bogus: '0 0 1px #000' }},
        notATheme: { colors: { brand: '#000000' }}
    }, 'remote')
    assert.equal(THEMES.night.colors.brand, '#FB7299')
    assert.equal(THEMES.night.colors['brand-rgb'], '251,114,153')
    assert.equal(THEMES.light.colors.brand, '#111111')
    assert.equal(THEMES.dark.shadows.glow, '0 0 16px rgba(1,2,3,0.4)')
    // night.colors 与 tokens.ts 的 defaultColors 是同一对象：覆盖必须克隆，不能连内置默认色板一起改
    assert.equal(defaultColors.brand, nightBrand)
    assert.equal(night.colors === defaultColors, false)
    assert.equal(defaultShadows.glow !== THEMES.dark.shadows.glow, true)
    assert.match(report!.rejected.join(' '), /notATheme（不在白名单）/)
    assert.equal(THEMES.light.colors.brand !== lightBrand, true)
    // 覆盖后变量表必须被整块重写（变量表是「一次注入 + 只切 data-adj-theme」的结构）
    assert.match(fakeStyleElement.textContent, /--adj-brand:#FB7299/)
})
test('选择器覆盖：自注册生效（查询路径命中覆盖值），非法项被丢弃', () => {
    clearHotConfigStateForTest()
    const report = setHotConfigEntries('selectors', {
        app: '#app-hotfixed',
        notExistSelector: '#whatever',
        player: '###'
    }, 'remote')
    assert.deepEqual(report?.applied, ['app'])
    assert.equal(elementSelectors.CSS_MAP.app, '#app-hotfixed')
    assert.equal(getSelector('app'), '#app-hotfixed')
    assert.equal(elementSelectors.CSS_MAP.notExistSelector, undefined)
    assert.equal(elementSelectors.CSS_MAP.player, '#bilibili-player')
    // 还原，避免影响同进程内的其它断言
    elementSelectors.CSS_MAP.app = '#app'
})
test('AI 提供商覆盖：只认已内置 provider 的两个字段', () => {
    clearHotConfigStateForTest()
    const report = setHotConfigEntries('ai-providers', {
        deepseek: { defaultModel: 'deepseek-chat-v4', name: '改名请求' },
        notExistProvider: { baseURL: 'https://evil.example' }
    }, 'remote')
    assert.deepEqual(report?.applied, ['deepseek'])
    assert.equal(AI_PROVIDER_CONFIGS.deepseek.defaultModel, 'deepseek-chat-v4')
    assert.equal(AI_PROVIDER_CONFIGS.deepseek.name, 'DeepSeek 官方')
    assert.equal(AI_PROVIDER_CONFIGS.notExistProvider, undefined)
})
test('超长覆盖值被丢弃（长度上限是选择器/正则应共用的第一道护栏）', () => {
    clearHotConfigStateForTest()
    const report = setHotConfigEntries('selectors', { app: '#app' + 'x'.repeat(MAX_OVERRIDE_VALUE_LENGTH) }, 'remote')
    assert.deepEqual(report?.applied, [])
    assert.equal(elementSelectors.CSS_MAP.app, '#app')
})
