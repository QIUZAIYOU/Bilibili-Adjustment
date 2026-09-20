import { getTotalSecondsFromTimeString, generateMentionUserLinks } from '@/utils/common'
import { registerHotConfigTarget } from '@/shared/hot-config-registry'
import { analyzeRegexSource } from '@/shared/hot-config'
/** 正则分组（video/dynamic 两块的 key → 实例），热更覆盖按 `组.名` 定位并就地替换 */
type RegexpGroups = Record<string, Record<string, RegExp>>
// const tlds = [
//     'com',
//     'org',
//     'net',
//     'edu',
//     'gov',
//     'mil',
//     'int',
//     'biz',
//     'info',
//     'pro',
//     'name',
//     'aero',
//     'coop',
//     'museum',
//     'tel',
//     'travel',
//     'jobs',
//     'cat',
//     'io',
//     'cn',
//     'de',
//     'uk',
//     'jp',
//     'fr',
//     'it',
//     'es',
//     'ca',
//     'au',
//     'us',
//     'br',
//     'ru',
//     'in',
//     'nl',
//     'se',
//     'no',
//     'dk',
//     'fi',
//     'nz',
//     'cn',
//     'pl',
//     'ie',
//     'pt',
//     'at',
//     'sg',
//     'ch',
//     'za',
//     'be',
//     'mx',
//     'hk',
//     'tw',
//     'kr',
//     'il',
//     'gr',
//     'hu',
//     'tr',
//     'ro',
//     'sk',
//     'cz',
//     'bg',
//     'ar',
//     'pe',
//     'ua',
//     'ph',
//     'ie',
//     'si',
//     'ee',
//     'lv',
//     'lt',
//     'is',
//     'li',
//     'mc',
//     'li',
//     'sm',
//     'va',
//     'ad',
//     'mt',
//     'lu',
//     'pt',
//     'cy',
//     'ee',
//     'sk',
//     'cz',
//     'hu',
//     'bg',
//     'tr',
//     'cu',
//     'ec',
//     'su',
//     'cc',
//     'fm',
//     'nu',
//     'ac',
//     'ai',
//     'ag',
//     'al',
//     'am',
//     'as',
//     'az',
//     'ba',
//     'bb',
//     'bd',
//     'bh',
//     'bi',
//     'bj',
//     'bm',
//     'bn',
//     'bo',
//     'bs',
//     'bt',
//     'bw',
//     'by',
//     'bz',
//     'bz',
//     'cd',
//     'cf',
//     'cg',
//     'ck',
//     'cl',
//     'cm',
//     'cn',
//     'co',
//     'cr',
//     'cs',
//     'cu',
//     'cv',
//     'cw',
//     'cx',
//     'cy',
//     'cz',
//     'de',
//     'dj',
//     'dk',
//     'dm',
//     'do',
//     'dz',
//     'ec',
//     'ee',
//     'eg',
//     'er',
//     'es',
//     'et',
//     'fi',
//     'fj',
//     'fk',
//     'fm',
//     'fo',
//     'fr',
//     'ga',
//     'gb',
//     'gd',
//     'ge',
//     'gf',
//     'gh',
//     'gi',
//     'gl',
//     'gm',
//     'gn',
//     'gp',
//     'gq',
//     'gr',
//     'gs',
//     'gt',
//     'gu',
//     'gw',
//     'gy',
//     'hk',
//     'hm',
//     'hn',
//     'hr',
//     'ht',
//     'hu',
//     'id',
//     'ie',
//     'il',
//     'im',
//     'in',
//     'io',
//     'iq',
//     'ir',
//     'is',
//     'it',
//     'je',
//     'jm',
//     'jo',
//     'jp',
//     'ke',
//     'kg',
//     'kh',
//     'ki',
//     'km',
//     'kn',
//     'kp',
//     'kr',
//     'kw',
//     'ky',
//     'kz',
//     'la',
//     'lb',
//     'lc',
//     'li',
//     'lk',
//     'lr',
//     'ls',
//     'lt',
//     'lu',
//     'lv',
//     'ly',
//     'ma',
//     'mc',
//     'md',
//     'me',
//     'mg',
//     'mh',
//     'mk',
//     'ml',
//     'mm',
//     'mn',
//     'mo',
//     'mp',
//     'mq',
//     'mr',
//     'ms',
//     'mt',
//     'mu',
//     'mv',
//     'mw',
//     'mx',
//     'my',
//     'mz',
//     'na',
//     'nc',
//     'ne',
//     'nf',
//     'ng',
//     'ni',
//     'nl',
//     'no',
//     'np',
//     'nr',
//     'nu',
//     'nz',
//     'om',
//     'pa',
//     'pe',
//     'pf',
//     'pg',
//     'ph',
//     'pk',
//     'pl',
//     'pm',
//     'pn',
//     'pr',
//     'ps',
//     'pt',
//     'pw',
//     'py',
//     'qa',
//     're',
//     'ro',
//     'rs',
//     'ru',
//     'rw',
//     'sa',
//     'sb',
//     'sc',
//     'sd',
//     'se',
//     'sg',
//     'sh',
//     'si',
//     'sj',
//     'sk',
//     'sl',
//     'sm',
//     'sn',
//     'so',
//     'sr',
//     'ss',
//     'st',
//     'su',
//     'sv',
//     'sx',
//     'sy',
//     'sz',
//     'tc',
//     'td',
//     'tf',
//     'tg',
//     'th',
//     'tj',
//     'tk',
//     'tl',
//     'tm',
//     'tn',
//     'to',
//     'tp',
//     'tr',
//     'tt',
//     'tv',
//     'tw',
//     'tz',
//     'ua',
//     'ug',
//     'uk',
//     'us',
//     'uy',
//     'uz',
//     'va',
//     'vc',
//     've',
//     'vg',
//     'vi',
//     'vn',
//     'vu',
//     'wf',
//     'ws',
//     'ye',
//     'yt',
//     'za',
//     'zm',
//     'zw'
// ]
// const tldsRegex = tlds.map(tld => tld.replace(/\./g, '\\.')).join('|')
const fileExtensions: string[] = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'mp3', 'pdf', 'doc', 'xls', 'ppt']
// url: new RegExp(
//     `(?<!((href|url)="))(?:(?:http|https|ftp)://)?(?!\\d+(?:\\.\\d+)+$)(?!v\\d+(?:\\.\\d+)+$)(?![a-zA-Z]*\\d+(?:\\.\\d+)+$)(?:[a-zA-Z0-9][\\w-]*\\.)*[a-zA-Z][\\w-]+\\.(?:${tldsRegex})(?:[\\w\\-.,@?^=%&:/~+#;]*[\\w\\-@?^=%&/~+#;])?`, 'g'
// )
export const regexps = {
    video: {
        nbspToBlank: /&nbsp;/gi,
        timeString: /\b(?:\d{1,2}:)?(?:[0-5]?\d|60):[0-5]\d\b/g, // 匹配 MM:SS 或 HH:MM:SS
        url: /(?<!(href|url)=")(?:(?:https?|ftp):\/\/)?(?:[a-zA-Z0-9][\w-]*\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[\w\-.,@?^=%&:/~+#;\u4e00-\u9fff]*)?/gi, // 端口/分号/中文参数
        videoId: /(?<!(>|\/))\bBV(?:1[1-9a-km-zA-Z]|2[0-9a-zA-Z])[0-9a-zA-Z]{8}\b(?!<)/g,
        readId: /\bcv\d{7}\b/g,
        blankLine: /^\s*$(?:\r?\n?)/gm,
        specialBlank: /(%09)+/g,
        user: /@([^\s]+)/g
    },
    dynamic: {
        newIndexLink: /(https:\/\/t.bilibili.com\/pages\/nav\/index_new).*/i,
        indexVoteLink: /https:\/\/t.bilibili.com\/vote\/h5\/index\/#\/result\?vote_id=.*/i,
        webVoteLink: /t.bilibili.com\/h5\/dynamic\/vote#\/result\?vote_id=.*/i,
        indexLotteryLink: /https:\/\/t.bilibili.com\/lottery\/h5\/index\/.*/i,
        webLotteryLink: /https:\/\/t.bilibili.com\/lottery\/.*/i,
        moreDataLink: /https:\/\/t.bilibili.com\/[0-9]+\?tab=[0-9]+/i,
        DetailLink: /https:\/\/t.bilibili.com\/[0-9]+/i,
        TopicDetailLink: /https:\/\/t.bilibili.com\/topic\/[0-9]+/i
    }
}
/**
 * 正则热更覆盖（B 站改字段/文案格式时不必等发版）
 *
 * 两条硬约束：
 * 1) **只覆盖 source，flags 固定沿用内置值** —— 调用点与 flags 是绑定的（`g` 决定 replace 是否全局、
 *    `test()` 是否会因 lastIndex 变成有状态），远端改 flags 会静默改掉调用语义；
 * 2) 值要过 `analyzeRegexSource`（灾难性回溯启发式），再由 `new RegExp` 兜住语法合法性。
 */
const builtInRegexps: RegexpGroups = {
    video: { ...regexps.video },
    dynamic: { ...regexps.dynamic }
}
export const regexpOverrideKeys = (): string[] => [
    ...Object.keys(regexps.video).map(key => `video.${key}`),
    ...Object.keys(regexps.dynamic).map(key => `dynamic.${key}`)
]
registerHotConfigTarget('regexps', {
    keys: regexpOverrideKeys,
    apply: (key, value) => {
        const separator = key.indexOf('.')
        const group = key.slice(0, separator)
        const name = key.slice(separator + 1)
        const builtIn = builtInRegexps[group]?.[name]
        if (!builtIn) return false
        const reason = analyzeRegexSource(value)
        if (reason) throw new Error(reason)
        // 语法非法时 new RegExp 会抛错 → 由注册表捕获并只丢弃这一条
        ;(regexps as unknown as RegexpGroups)[group][name] = new RegExp(String(value), builtIn.flags)
        return true
    }
})
// console.log(regexps.video.url)
// 新增公共处理函数
/** 文本节点替换函数：入参为节点文本，返回替换后的 HTML 片段 */
type TextNodeReplacer = (content: string) => string
/**
 * 这些祖先元素内部的文本**不再做链接化**：
 * `<a>` 里再插 `<a>` 是非法嵌套，浏览器解析时会直接拆坏标签（表现为整段链接乱码）；
 * `script`/`style` 里的文本本来就不是给人看的。
 */
const LINKIFY_SKIP_SELECTOR = 'a, script, style'
const processTextNodes = (element: Element, replacer: TextNodeReplacer): Element => {
    const clonedElement = element.cloneNode(true) as Element
    const walker = document.createTreeWalker(clonedElement, NodeFilter.SHOW_TEXT)
    // 先收集再替换：替换会改动 DOM，边遍历边改容易漏节点/重复处理
    const textNodes: Text[] = []
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
    for (const textNode of textNodes) {
        if (textNode.parentElement?.closest(LINKIFY_SKIP_SELECTOR)) continue
        const newHtml = replacer(textNode.textContent ?? '')
        if (newHtml !== textNode.textContent) {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = newHtml
            textNode.replaceWith(...tempDiv.childNodes)
        }
    }
    return clonedElement
}
const generateLink = (match: string): string => {
    if (fileExtensions.includes(match.split('.')[1])) return match
    const protocol = match.includes('http') ? '' : 'https://'
    return `<a href="${protocol}${match}" target="_blank" bilibili-adjustment-element>${match}</a>`
}
/** 一个可链接化模式：`re` 必须是 sticky（y），只在当前位置尝试匹配 */
interface LinkifyToken {
    re: RegExp
    render: (match: RegExpExecArray) => string
}
/** 把已有正则改造成「只在指定位置尝试」的 sticky 版本（不改动原对象，避免共享 lastIndex 互相干扰） */
const anchored = (source: RegExp): RegExp => new RegExp(source.source, source.flags.replace(/[gy]/g, '') + 'y')
/**
 * **单遍**扫描链接化：每个字符只被处理一次，生成的 HTML 不会再进入下一轮匹配。
 *
 * 为什么必须单遍（2026-09-18 用户报的简介区乱码）：原先是在同一段文本上连续 `.replace()`，
 * 后一次会命中前一次生成的 HTML —— 例如文本里的 `…&bvid=BV1b5AyzaEQh`，
 * `url` 替换先生成 `<a href="…&bvid=BV1b5AyzaEQh" …>`，紧接着的 `videoId` 替换又命中
 * **这个 href 里的 BV 号**，把属性值写坏，浏览器解析后整段链接就散了。
 * 另外 URL 模式排在 BV/cv 之前，URL 里带的 `bvid=BV…` 会被整段吃掉，不会再被二次链接化。
 */
const linkifyTokens = (content: string, tokens: LinkifyToken[]): string => {
    let result = ''
    let index = 0
    while (index < content.length) {
        let hit: { token: LinkifyToken, match: RegExpExecArray } | null = null
        for (const token of tokens) {
            token.re.lastIndex = index
            const match = token.re.exec(content)
            if (match && match.index === index && match[0]) {
                hit = { token, match }
                break
            }
        }
        if (!hit) {
            result += content[index]
            index += 1
            continue
        }
        result += hit.token.render(hit.match)
        index += hit.match[0].length
    }
    return result
}
const videoIdLink = (match: string): string =>
    `<a href="https://www.bilibili.com/video/${match}" target="_blank" bilibili-adjustment-element>${match}</a>`
const readIdLink = (match: string): string =>
    `<a href="https://www.bilibili.com/read/${match}" target="_blank" bilibili-adjustment-element>${match}</a>`
/** desc_v2 条目（@ 提及用的官方字段） */
export interface MentionDescItem {
    raw_text?: string
    biz_id?: string | number
}
/** 简介用的模式表：URL → 时间锚点 → BV → cv → @提及（顺序即优先级；URL 在前可吃掉其中的 BV/cv） */
const buildDescriptionTokens = (descV2?: MentionDescItem[]): LinkifyToken[] => [
    { re: anchored(regexps.video.url), render: match => generateLink(match[0]) },
    {
        re: anchored(regexps.video.timeString),
        render: match => `<a data-type="seek" data-video-time="${getTotalSecondsFromTimeString(match[0])}" bilibili-adjustment-element>${match[0]}</a>`
    },
    { re: anchored(regexps.video.videoId), render: match => videoIdLink(match[0]) },
    { re: anchored(regexps.video.readId), render: match => readIdLink(match[0]) },
    { re: anchored(regexps.video.user), render: match => generateMentionUserLinks(match[1], descV2) }
]
/** 评论内容用的模式表（没有时间锚点与 @提及） */
const buildCommentTokens = (): LinkifyToken[] => [
    { re: anchored(regexps.video.url), render: match => generateLink(match[0]) },
    { re: anchored(regexps.video.videoId), render: match => videoIdLink(match[0]) },
    { re: anchored(regexps.video.readId), render: match => readIdLink(match[0]) }
]
/**
 * 处理视频简介并返回可插入页面的 HTML
 *
 * 入参是 **B 站 API 的纯文本简介**（`videoInfo.desc`），因此按 `textContent` 写入而不是 `innerHTML`：
 * 简介里出现 `<`、`&lt;` 等字符时应原样显示，既不会吞掉后半段内容，也避免作者在简介里塞的
 * HTML（如 `<img onerror=…>`）被我们注入进页面。
 */
export const formatVideoCommentDescription = (text: string, desc_v2?: MentionDescItem[]): string => {
    const tempDiv = document.createElement('div')
    tempDiv.textContent = text
    const tokens = buildDescriptionTokens(desc_v2)
    const processedElement = processTextNodes(tempDiv, content => {
        // 文本规范化先做：都是纯文本变换，与链接化互不影响
        const normalized = content
            .replace(regexps.video.specialBlank, '%20')
            .replace(regexps.video.nbspToBlank, ' ')
            .replace(regexps.video.blankLine, '')
        return linkifyTokens(normalized, tokens)
    })
    return processedElement.innerHTML
}
export const formatVideoCommentContents = (element: Element): string => {
    const tokens = buildCommentTokens()
    return processTextNodes(element, content => linkifyTokens(content, tokens)).innerHTML
}
const adjustPunctuation = (sentence: string): string => sentence.replace(/【(.*?)】/gu, (match: string, text: string) => {
    const punctuationMatch = text.match(/^(\p{P}+)(.*)/u)
    if (punctuationMatch) {
        const punctuation = punctuationMatch[1]
        const remainingText = punctuationMatch[2]
        return punctuation + '【' + remainingText + '】'
    } else {
        return match
    }
})
export const findRepeatUnit = (str: string): string => {
    const urlRegex = regexps.video.url
    const ignorePattern = /^(——|—|—|-|_)+$/g
    const parts: Array<{ type: 'text' | 'url'; content: string }> = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    urlRegex.lastIndex = 0
    while ((match = urlRegex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: str.substring(lastIndex, match.index) })
        }
        parts.push({ type: 'url', content: match[0] })
        lastIndex = match.index + match[0].length
    }
    if (lastIndex < str.length) {
        parts.push({ type: 'text', content: str.substring(lastIndex) })
    }
    const processedParts = parts.map(part => {
        if (part.type === 'url') {
            return part.content
        } else {
            let remainingText = part.content
            let result = ''
            while (remainingText.length > 0) {
                let maxCount = 0
                let bestLen = 0
                let bestStart = 0
                const n = remainingText.length
                for (let len = 1; len <= Math.floor(n / 2); len++) {
                    let currentMaxCount = 0
                    let currentBestStart = 0
                    for (let start = 0; start <= n - len; start++) {
                        const unit = remainingText.substring(start, start + len)
                        // 忽略特定字符
                        if (ignorePattern.test(unit)) continue
                        let count = 1
                        let i = start + len
                        while (i + len <= n && remainingText.substring(i, i + len) === unit) {
                            count++
                            i += len
                        }
                        if (count > currentMaxCount) {
                            currentMaxCount = count
                            currentBestStart = start
                        }
                    }
                    if (currentMaxCount > maxCount || (currentMaxCount === maxCount && len < bestLen)) {
                        maxCount = currentMaxCount
                        bestLen = len
                        bestStart = currentBestStart
                    }
                }
                if (maxCount > 3) {
                    const unit = remainingText.substring(bestStart, bestStart + bestLen)
                    const prefix = remainingText.substring(0, bestStart)
                    const repeatPart = adjustPunctuation(`「${unit}×${maxCount}」`)
                    result += prefix + repeatPart
                    remainingText = remainingText.substring(bestStart + maxCount * bestLen)
                } else {
                    result += remainingText
                    remainingText = ''
                }
            }
            return result
        }
    })
    return processedParts.join('')
}
