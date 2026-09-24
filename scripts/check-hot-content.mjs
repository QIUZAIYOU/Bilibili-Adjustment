#!/usr/bin/env node
/**
 * 「可热更内容不得硬编码」门禁（`npm run check:hot-content`，upload.py 上传前自动调用）
 *
 * 为什么要它：B 站改版/改路由时，页面选择器与 URL 结构判据本该改服务器上的
 * hot-config/selectors.js、hot-config/regexps.js 就能生效；一旦有模块把它们**写死在代码里**，
 * 就只能等发版，用户会有一段时间功能失效。人工 review 很容易漏，所以用脚本兜住。
 *
 * 规则（只看「B 站页面特征」，不误伤脚本自己的 DOM 与域名白名单）：
 *   1) DOM 查询调用里的字面选择器（querySelector/All、closest、matches、getElementsByClassName）
 *      不得含 B 站特征 token（bpx- / bili- / video-pod / feed- / episode / mini-player /
 *      mirror-vdcon / desc-info-text / player-title / recommended-container 等）；
 *   2) 正则字面量不得含 B 站**路径/结构** token（/video/、/bangumi/、/list/、BV、av\d、ep\d、
 *      ss\d、bpx-…）；纯域名校验（如 /bilibili/、/space.bilibili.com/）不算违规 ——
 *      域名变了整个 @match 都要改，本来就无法靠热更解决；
 *   3) 真源文件（选择器表 element-selectors.ts、正则表 regexps.ts、模板目录 templates/、
 *      主题 tokens/themes、提示词）本身豁免。
 *
 * 违规时的修法：选择器 → 加进 src/shared/element-selectors.ts 的 CSS_MAP 再用 elementSelectors.get/CSS/queryAll；
 * 正则 → 加进 src/shared/regexps.ts；注入页面的 HTML → 加进 src/shared/templates/。
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const SRC = path.join(root, 'src')
/** 真源文件/目录：这些地方**就是**可热更内容的定义处，允许写字面值 */
const REGISTRY_FILES = [
    'src/shared/element-selectors.ts',
    'src/shared/regexps.ts',
    'src/shared/ai-providers.ts',
    'src/shared/ad-detection-prompt.ts',
    'src/shared/selector-registry.ts',
    'src/shared/template-registry.ts',
    'src/shared/hot-config.ts',
    'src/shared/hot-config-registry.ts',
    'src/shared/theme/tokens.js',
    'src/shared/theme/themes.ts',
    'src/shared/theme/themes.js'
]
const REGISTRY_DIRS = ['src/shared/templates/']
/** B 站页面特征 token：命中即说明这是"B 站页面选择器"，应走选择器表 */
const SITE_SELECTOR_TOKENS = /bpx-|bili-|bilibili|video-pod|feed-card|feed-roll|recommended-container|episode|mini-player|mirror-vdcon|desc-info-text|player-title|playerWrap|danmaku|commentapp/
/** B 站 URL/结构 token：命中即说明这是"B 站路由/结构判据"，应走正则表 */
const SITE_REGEX_TOKENS = /\/video\/|\/bangumi\/|\/list\/|BV\[|BV\\|\\d\{|ep\(|ss\(|bpx-|video-pod|mini-player/
/** 脚本自己的 DOM/类名：改脚本自己才变，不属于热更范围 */
const OWN_DOM_TOKENS = /adj-|adjustment|ba-notification|bilibili-adjustment-element|#location|goToUpSpace|#feed|history-body/
const walk = dir => fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    return fs.statSync(full).isDirectory() ? walk(full) : [full]
})
const rel = full => path.relative(root, full).replace(/\\/g, '/')
const isRegistry = file => REGISTRY_FILES.includes(file) || REGISTRY_DIRS.some(dir => file.startsWith(dir))
const files = walk(SRC).filter(full => /\.(ts|js|vue)$/.test(full) && !/\.d\.ts$/.test(full))
const violations = []
const domCallRe = /(?:querySelectorAll|querySelector|closest|matches|getElementsByClassName|queryDescendant)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
const regexLiteralRe = /(?:^|[=(,:[\s!&|])\/((?:\\.|\[[^\]]*\]|[^/\\\n])+)\/[gimsuy]*/g
for (const full of files) {
    const file = rel(full)
    if (isRegistry(file)) continue
    const lines = fs.readFileSync(full, 'utf8').split('\n')
    lines.forEach((line, index) => {
        const where = `${file}:${index + 1}`
        const trimmed = line.trim()
        // 跳过注释（选择器/正则在注释里只是说明，不影响运行）
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
        for (const match of line.matchAll(domCallRe)) {
            const selector = match[2]
            if (SITE_SELECTOR_TOKENS.test(selector) && !OWN_DOM_TOKENS.test(selector)) {
                violations.push(`${where}  硬编码 B 站选择器 → ${trimmed.slice(0, 100)}`)
            }
        }
        for (const match of line.matchAll(regexLiteralRe)) {
            const source = match[1]
            if (SITE_REGEX_TOKENS.test(source)) {
                violations.push(`${where}  硬编码 B 站结构正则 → ${trimmed.slice(0, 100)}`)
            }
        }
    })
}
if (violations.length === 0) {
    console.log(`[check-hot-content] 通过：${files.length} 个源文件里没有硬编码的 B 站页面特征（选择器/结构正则）`)
    process.exit(0)
}
console.error(`[check-hot-content] 发现 ${violations.length} 处硬编码的可热更内容：\n`)
for (const row of violations) console.error('  ' + row)
console.error(`
修法：
  · 选择器 → 加进 src/shared/element-selectors.ts 的 CSS_MAP，再用 elementSelectors.get/CSS/queryAll/each 取用
  · 正则   → 加进 src/shared/regexps.ts（覆盖只改 source、flags 与调用点绑定）
  · 注入页面的 HTML → 加进 src/shared/templates/，再用 getTemplates.<key>
这样 B 站改版时改服务器上的 hot-config/*.js 即可生效，不必发版。
`)
process.exit(1)
