import { getTotalSecondsFromTimeString, generateMentionUserLinks } from '@/utils/common'
const tlds = [
    'com',
    'org',
    'net',
    'edu',
    'gov',
    'mil',
    'int',
    'biz',
    'info',
    'pro',
    'name',
    'aero',
    'coop',
    'museum',
    'tel',
    'travel',
    'jobs',
    'cat',
    'io',
    'cn',
    'de',
    'uk',
    'jp',
    'fr',
    'it',
    'es',
    'ca',
    'au',
    'us',
    'br',
    'ru',
    'in',
    'nl',
    'se',
    'no',
    'dk',
    'fi',
    'nz',
    'cn',
    'pl',
    'ie',
    'pt',
    'at',
    'sg',
    'ch',
    'za',
    'be',
    'mx',
    'hk',
    'tw',
    'kr',
    'il',
    'gr',
    'hu',
    'tr',
    'ro',
    'sk',
    'cz',
    'bg',
    'ar',
    'pe',
    'ua',
    'ph',
    'ie',
    'si',
    'ee',
    'lv',
    'lt',
    'is',
    'li',
    'mc',
    'li',
    'sm',
    'va',
    'ad',
    'mt',
    'lu',
    'pt',
    'cy',
    'ee',
    'sk',
    'cz',
    'hu',
    'bg',
    'tr',
    'cu',
    'ec',
    'su',
    'cc',
    'fm',
    'nu',
    'ac',
    'ai',
    'ag',
    'al',
    'am',
    'as',
    'az',
    'ba',
    'bb',
    'bd',
    'bh',
    'bi',
    'bj',
    'bm',
    'bn',
    'bo',
    'bs',
    'bt',
    'bw',
    'by',
    'bz',
    'bz',
    'cd',
    'cf',
    'cg',
    'ck',
    'cl',
    'cm',
    'cn',
    'co',
    'cr',
    'cs',
    'cu',
    'cv',
    'cw',
    'cx',
    'cy',
    'cz',
    'de',
    'dj',
    'dk',
    'dm',
    'do',
    'dz',
    'ec',
    'ee',
    'eg',
    'er',
    'es',
    'et',
    'fi',
    'fj',
    'fk',
    'fm',
    'fo',
    'fr',
    'ga',
    'gb',
    'gd',
    'ge',
    'gf',
    'gh',
    'gi',
    'gl',
    'gm',
    'gn',
    'gp',
    'gq',
    'gr',
    'gs',
    'gt',
    'gu',
    'gw',
    'gy',
    'hk',
    'hm',
    'hn',
    'hr',
    'ht',
    'hu',
    'id',
    'ie',
    'il',
    'im',
    'in',
    'io',
    'iq',
    'ir',
    'is',
    'it',
    'je',
    'jm',
    'jo',
    'jp',
    'ke',
    'kg',
    'kh',
    'ki',
    'km',
    'kn',
    'kp',
    'kr',
    'kw',
    'ky',
    'kz',
    'la',
    'lb',
    'lc',
    'li',
    'lk',
    'lr',
    'ls',
    'lt',
    'lu',
    'lv',
    'ly',
    'ma',
    'mc',
    'md',
    'me',
    'mg',
    'mh',
    'mk',
    'ml',
    'mm',
    'mn',
    'mo',
    'mp',
    'mq',
    'mr',
    'ms',
    'mt',
    'mu',
    'mv',
    'mw',
    'mx',
    'my',
    'mz',
    'na',
    'nc',
    'ne',
    'nf',
    'ng',
    'ni',
    'nl',
    'no',
    'np',
    'nr',
    'nu',
    'nz',
    'om',
    'pa',
    'pe',
    'pf',
    'pg',
    'ph',
    'pk',
    'pl',
    'pm',
    'pn',
    'pr',
    'ps',
    'pt',
    'pw',
    'py',
    'qa',
    're',
    'ro',
    'rs',
    'ru',
    'rw',
    'sa',
    'sb',
    'sc',
    'sd',
    'se',
    'sg',
    'sh',
    'si',
    'sj',
    'sk',
    'sl',
    'sm',
    'sn',
    'so',
    'sr',
    'ss',
    'st',
    'su',
    'sv',
    'sx',
    'sy',
    'sz',
    'tc',
    'td',
    'tf',
    'tg',
    'th',
    'tj',
    'tk',
    'tl',
    'tm',
    'tn',
    'to',
    'tp',
    'tr',
    'tt',
    'tv',
    'tw',
    'tz',
    'ua',
    'ug',
    'uk',
    'us',
    'uy',
    'uz',
    'va',
    'vc',
    've',
    'vg',
    'vi',
    'vn',
    'vu',
    'wf',
    'ws',
    'ye',
    'yt',
    'za',
    'zm',
    'zw'
]
const tldsRegex = tlds.map(tld => tld.replace(/\./g, '\\.')).join('|')
const fileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'mp3', 'pdf', 'doc', 'xls', 'ppt']
export const regexps = {
    video: {
        nbspToBlank: /&nbsp;/gi,
        timeString: /\b(?:[0-5]?\d|60):[0-5]\d\b/g,
        url: new RegExp(
            `(?<!((href|url)="))(?:(?:http|https|ftp)://)?(?!\\d+(?:\\.\\d+)+$)(?!v\\d+(?:\\.\\d+)+$)(?![a-zA-Z]*\\d+(?:\\.\\d+)+$)(?:[a-zA-Z0-9][\\w-]*\\.)*[a-zA-Z][\\w-]+\\.(?:${tldsRegex})(?:[\\w\\-.,@?^=%&:/~+#;]*[\\w\\-@?^=%&/~+#;])?`, 'g'
        ),
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
// console.log(regexps.video.url)
export const formatVideoCommentDescription = (html, desc_v2) => html.replace(regexps.video.specialBlank, '%20')
    .replace(regexps.video.nbspToBlank, ' ')
    .replace(regexps.video.timeString, match => `<a data-type="seek" data-video-part="-1" data-video-time="${getTotalSecondsFromTimeString(match)}">${match}</a>`)
    .replace(regexps.video.url, match => {
        if (fileExtensions.includes(match.split('.')[1])) return match
        return `<a href="${match.includes('http') ? match : `https://${match}`}" target="_blank">${match}</a>`
    })
    .replace(regexps.video.videoId, match => `<a href="https://www.bilibili.com/video/${match}" target="_blank">${match}</a>`)
    .replace(regexps.video.readId, match =>
        `<a href="https://www.bilibili.com/read/${match}" target="_blank">${match}</a>`)
    .replace(regexps.video.blankLine, '')
    .replace(regexps.video.user, (_, p1) => generateMentionUserLinks(p1, desc_v2))
// export const formatVideoCommentContents = html => html.replace(regexps.video.url, match => {
//     if (fileExtensions.includes(match.split('.')[1])) return match
//     return `<a href="${match.includes('http') ? match : `https://${match}`}" target="_blank" asifadeaway>${match}</a>`
// })
const adjustPunctuation = sentence => sentence.replace(/【(.*?)】/gu, (match, text) => {
    const punctuationMatch = text.match(/^(\p{P}+)(.*)/u)
    if (punctuationMatch) {
        const punctuation = punctuationMatch[1]
        const remainingText = punctuationMatch[2]
        return punctuation + '【' + remainingText + '】'
    } else {
        return match
    }
})
export const findRepeatUnit = str => {
    const urlRegex = regexps.video.url
    const parts = []
    let lastIndex = 0
    let match
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
