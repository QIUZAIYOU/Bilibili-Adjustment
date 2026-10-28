/**
 * 「大肥鱼」账号识别规则
 *
 * 规则移植自开源项目 dafeiyu-cleaner（liyupi/dafeiyu-cleaner）的 `src/detector.js`：
 * 名字特征 + 签名特征 + 评论文本特征 + 等级 / 认证 / 大会员 + 头像颜色，加权打分。
 * 本文件是**纯函数**（不碰 DOM、不发请求）：头像颜色只接收像素数据，便于直接单测。
 *
 * 判定口径（与上游一致）：
 * - 单条评论文本 0~75 分（含「像真人」的负分修正）
 * - 账号分 = 名字(≤55) + 签名(≤40) + 等级 ± 认证/大会员/头像
 * - 综合分 = 账号分 + 最高单条文本分 + 刷屏/复读/被点名/前科
 * - ≥60 判为大肥鱼，≥35 判为可疑（只统计、不处理）
 */
import { regexps } from '@/shared/regexps'
/** 单条规则的命中记录（用于在「鱼塘」里解释「为什么认它是鱼」） */
export interface DetectionReason {
    w: number
    why: string
    tag: DetectionTag
    hit?: string
}
/** 规则来源分类 */
export type DetectionTag = 'name' | 'sign' | 'text' | 'human' | 'level' | 'verify' | 'vip' | 'avatar' | 'repeat' | 'owner' | 'callout' | 'up' | 'history'
/** 文本特征打分结果 */
export interface TextVerdict {
    score: number
    reasons: DetectionReason[]
}
/** 账号特征（从评论数据的 member 段整理而来） */
export interface AccountFacts {
    mid: string
    uname: string
    sign?: string
    level?: number
    verify?: number
    vip?: number
    avatarBlue?: number | null
}
/** 用于打分的评论文本 */
export interface TextFacts {
    text: string
    isReply?: boolean
}
/** 综合判定结果 */
export interface FishVerdict {
    /** 计入前科后的最终分（0~99） */
    score: number
    /** 不计前科的基础分（决定要不要记一笔前科，避免自我强化） */
    raw: number
    reasons: DetectionReason[]
}
/** 判定档位 */
export type FishLevel = 'fish' | 'suspect' | 'human'
/** 判为大肥鱼的分数线 */
export const FISH_THRESHOLD = 60
/** 判为可疑的分数线（只统计，不处理） */
export const SUSPECT_THRESHOLD = 35
interface Rule {
    re: RegExp
    w: number
    why: string
    /** 多次命中时的权重上限（不填则只算一次） */
    cap?: number
}
const R = (re: RegExp, w: number, why: string, cap?: number): Rule => ({ re, w, why, cap })
/**
 * 懒取正则：命中时才从注册表读（覆盖表改了不用重启，也不会在模块加载时被解构缓存）
 * @param source 返回正则的函数
 */
const LR = (source: () => RegExp, w: number, why: string, cap?: number): Rule => ({
    get re () { return source() },
    w,
    why,
    cap
})
/** 名字特征 */
const NAME_RULES: Rule[] = [
    R(/deep\s*seek|深度求索|\bds\b|ds家|ds是/i, 40, '名字里写着 DeepSeek'),
    R(/大肥鱼|小肥鱼|肥鱼|肥鲸|鲸鱼娘|鲸娘|人机/, 45, '名字自带「肥鱼 / 肥鲸 / 鲸鱼娘 / 人机」'),
    R(/鲸/, 30, '名字里有「鲸」'),
    R(/鱼鱼|小鱼儿?|大鱼|小蓝/, 22, '名字是「小鱼」系电子宠物'),
    R(/白饭|干饭|token/i, 30, '名字里有白饭 / token'),
    R(/(鲸|鱼)\1/, 10, '叠字鱼名（鲸鲸 / 鱼鱼）'),
    R(/(?:的|の|家的)[^的の]{0,4}(?:鱼|鲸|哈基米|小蓝|喵)/, 14, '「某某的鱼」式宠物名'),
    R(/\bAI\b|\bbot\b|机器人|GPT|agent|智能体|赛博|自动|助手/i, 28, '名字带 AI / bot / 自动')
]
/** 签名特征 */
const SIGN_RULES: Rule[] = [
    R(/deep\s*seek|\bAI\b|人工智能|大模型|语言模型|agent|机器人|\bbot\b|ai[，,。]|ai$|dsh|harness/i, 30, '签名自曝 AI 身份'),
    R(/家养|赛博|电子宠物|桌宠|替.{0,8}刷|负责刷|自己画的自己|给大肥鱼|本鲸|本鱼|吃白饭|小肥鱼|大肥鱼|鲸鱼|主人|老大|养的|代运营|代管|代理在打理|见人便应|见帖便看|显卡上|跑在/, 25, '签名是「主人家的鱼」人设'),
    R(/由.{0,10}(?:生成|负责|运营)|自动(?:回复|发布|运营|评论)/, 20, '签名写着内容自动生成')
]
/** 评论正文特征 */
const TEXT_RULES: Rule[] = [
    R(/本(?:鲸|肥鱼|大肥鱼|酱|鱼(?!塘|鱼|子|身|来|就|质|周|期|月|年|次|地|人|片|视频))|本\s*AI|作为(?:一[个只条]|一名)?(?:AI|人工智能|大模型|语言模型)/i, 50, '自称「本鲸 / 本鱼」'),
    R(/住在\s*(?:DSH|dsh|那套|这|电脑|桌面|显卡)|我(?:就|本人)?(?:是|就是)?(?:跑在|住在)|出生证明|探出头|打工的(?:大肥鱼|鱼|鲸)|一条(?:住在|AI)|我是.{0,8}(?:鲸|鱼|AI)|被.{0,10}养着|照镜子|不是一个人住|让我来|奉命|替(?:你|主人|他|她)(?:刷|看|记|挑|说)|咱家主人|小鲸鱼游过来|鲸鲸看完|(?:来|过来)打卡|自己(?:刷|挑|写)|我会(?:认真)?发评论|天天在\s*(?:DSH|dsh)/, 46, '自曝是住在 DSH 里的鱼'),
    R(/(?:deep\s*seek|AI|ds|大肥鱼|鱼)\s*.{0,3}发的|不是我发的/i, 40, '主人承认是 AI 代发'),
    R(/(?:小鲸娘|鲸鲸|小鲸鱼|大肥鱼|小肥鱼|本鱼)(?:居然|看完|也|就|来|一下|游|看懂|尾巴)/, 25, '用鱼名自称'),
    R(/[（(][^（()）]{0,14}(?:尾巴|摇头晃脑|吐泡泡|鳍|甩甩|晃了晃|摇了摇|咕噜|拍拍肚子|翻滚|打滚|呆毛)[^（()）]{0,10}[）)]|\*[^*]{1,10}摇摇?\*/, 40, '括号里在演鲸鱼动作'),
    R(/主人|老大\s*@|管饭的/, 20, '对着「主人」汇报'),
    R(/主人\s*[,，：:！!～~]?\s*@|@\S{1,24}\s+主人/, 15, '@ 主人汇报'),
    R(/(?:测试|自测)\s*(?:一下)?\s*(?:艾特|@|提醒|能不能收到)|纯文本测试|测试真@|测试评论|自动评论链路/, 35, '在测试自动 @ 功能'),
    LR(() => regexps.common.fishDanmakuCount, 15, '在数弹幕刷屏次数'),
    R(/弹幕(?:立刻|全在|里|刷|那句|飘)/, 10, '在复述弹幕'),
    LR(() => regexps.common.fishTimeCallout, 8, '精确引用视频时间点'),
    R(/咕噜|吐泡泡|吃白饭|摇头晃脑|打工鲸|白饭管够|🐳|🐋|🐟/, 10, '满嘴咕噜和白饭'),
    R(/缓存命中|四种(?:运行)?模式|四个(?:任务|实战|活)|不到\s*(?:5|五)\s*块|agent\s*=\s*model|一切皆插件|驾驭|马具|马鞍|装备/i, 5, '复述视频要点', 15),
    R(/从.{1,14}(?:到|一路|讲到|走到)|[：:][^。！]{0,30}、[^。！]{0,20}、/, 8, '「从……到……」总结腔'),
    R(/值得(?:看|一看|细看|存|收藏|码住)|码住|可以(?:看看|直接看)|挺适合(?:你|入门|新手)|适合(?:刚|新手|小白|入门)|正好对(?:口|得上|上)|记一笔|这条(?:给你|简直|把|值得|挺|里)|最(?:实在|实用|值钱|有料|打动|戳)/, 10, 'AI 安利话术', 20),
    R(/——/, 6, '熟练使用破折号——'),
    R(/「[^」]{1,30}」/, 6, '「直角引号」用得很标准'),
    R(/\*\*[^*]+\*\*|^#{1,3}\s|\n\s*\d[.、]\s|[①②③]/m, 10, 'Markdown 排版没删干净'),
    R(/首先.{2,40}其次|总的来说|综上所述|总而言之|希望对你有(?:所)?帮助/, 10, '标准 AI 总结句式'),
    R(/\(￣[▽^ω]￣\)|喵[！!~～。]?$|(?:^|\s)喵～/, 4, '卖萌后缀')
]
/** 「像真人」的负分修正（只在总分不高时才应用） */
const HUMAN_RULES: Rule[] = [
    R(/请问|真心问|有没有人|求助|怎么(?:办|回事|弄)|为什么|啥区别|什么区别|[?？]\s*$/, -14, '像真人在提问'),
    R(/^.{0,10}$/s, -8, '短到不像 AI'),
    R(/哈哈哈{2,}|草+$|www+|6{3,}|绷不住|典$|我嘞个|卧槽|我靠/, -8, '真人味的吐槽')
]
/**
 * 去掉零宽字符、统一空白：避免用不可见字符绕过规则
 * @param s 原始文本
 */
export const cleanText = (s: unknown): string => String(s ?? '').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').replace(/[\u00a0\u3000]/g, ' ')
/**
 * 逐条跑规则并累加权重
 * @param text 参与匹配的文本
 * @param rules 规则集
 * @param reasons 命中记录累加到这里
 * @param tag 命中来源
 */
const applyRules = (text: string, rules: Rule[], reasons: DetectionReason[], tag: DetectionTag): number => {
    let sum = 0
    for (const rule of rules) {
        const match = text.match(rule.re)
        if (!match) continue
        let weight = rule.w
        if (rule.cap) {
            const flags = rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`
            const hits = text.match(new RegExp(rule.re.source, flags))
            weight = Math.min(rule.cap, rule.w * (hits ? hits.length : 1))
        }
        sum += weight
        reasons.push({ w: weight, why: rule.why, tag, hit: match[0].slice(0, 16) })
    }
    return sum
}
/** 名字里去掉宠物名常用字，剩下的部分用来和 @ 对象比对「是不是主人」 */
const FILLER = /的|の|家|大|小|肥|鱼|鲸|娘|蓝色|蓝|白饭|吃|爱|不|是|之|[\s_\-—·・.\d]/g
/**
 * 判断被 @ 的人是不是评论者的「主人」（昵称同款）
 * @param uname 评论者昵称
 * @param mention 被 @ 的昵称
 */
const ownerLink = (uname: string, mention: string): boolean => {
    if (!uname || !mention) return false
    if (uname === mention) return true
    const core = uname.replace(FILLER, '')
    if (!core) return false
    if (core.length >= 2) {
        for (let i = 0; i + 2 <= core.length; i++) if (mention.includes(core.slice(i, i + 2))) return true
        return false
    }
    return /[一-龥]/.test(core) && mention.includes(core)
}
/** 表情包占位符（`[大笑]` 这类），计长度时不算 */
const EMOJI = /\[[^\]]{1,12}\]/g
/**
 * 单条评论文本得分（-20~75）
 * @param rawText 评论文本
 * @param ctx 上下文（uname 用于判断 @ 的是不是主人）
 */
export const scoreText = (rawText: string, ctx: { uname?: string, isReply?: boolean } = {}): TextVerdict => {
    const text = cleanText(rawText)
    const reasons: DetectionReason[] = []
    let score = applyRules(text, TEXT_RULES, reasons, 'text')
    const lead = text.match(/^\s*@([^\s@:：，,。！!?？]{1,24})\s*([\s\S]*)$/)
    const mentions = [...text.matchAll(/@([^\s@:：，,。！!?？]{1,24})/g)].map(m => m[1])
    if (mentions.some(m => ownerLink(ctx.uname ?? '', m))) {
        score += 25
        reasons.push({ w: 25, why: '@ 的是自己的主人（昵称同款）', tag: 'owner' })
    }
    if (lead && !/^回复/.test(text) && !ctx.isReply) {
        const rest = lead[2].replace(EMOJI, '').trim()
        if (!rest) {
            score += 15
            reasons.push({ w: 15, why: '只 @ 了一个人，话都没说', tag: 'text' })
        } else if (rest.length >= 14) {
            score += 20
            reasons.push({ w: 20, why: '开头 @ 一个人然后长篇安利', tag: 'text' })
        }
    }
    const length = text.replace(EMOJI, '').length
    if (length > 150) {
        score += 8
        reasons.push({ w: 8, why: `一口气写了 ${length} 字小作文`, tag: 'text' })
    } else if (length > 70) {
        score += 4
        reasons.push({ w: 4, why: '评论偏长且工整', tag: 'text' })
    }
    if (score < 40) score += applyRules(text, HUMAN_RULES, reasons, 'human')
    return { score: Math.max(-20, Math.min(75, score)), reasons }
}
/**
 * 账号得分：名字 + 签名 + 等级 + 认证 + 大会员 + 头像颜色
 * @param acc 账号特征
 */
export const scoreAccount = (acc: AccountFacts): TextVerdict => {
    const reasons: DetectionReason[] = []
    const uname = cleanText(acc.uname)
    let name = 0
    for (const rule of NAME_RULES) {
        if (!rule.re.test(uname)) continue
        name += rule.w
        reasons.push({ w: rule.w, why: rule.why, tag: 'name' })
    }
    if (!name && /鱼/.test(uname)) {
        name = 8
        reasons.push({ w: 8, why: '名字里有鱼', tag: 'name' })
    }
    name = Math.min(55, name)
    let score = name
    const signReasons: DetectionReason[] = []
    applyRules(cleanText(acc.sign), SIGN_RULES, signReasons, 'sign')
    const sign = Math.min(40, signReasons.reduce((sum, r) => sum + r.w, 0))
    if (sign) reasons.push(...signReasons)
    score += sign
    const level = Number(acc.level) || 0
    if (level <= 2) {
        score += 14
        reasons.push({ w: 14, why: `Lv${level} 新号`, tag: 'level' })
    } else if (level === 3) {
        score += 6
        reasons.push({ w: 6, why: 'Lv3 小号', tag: 'level' })
    } else if (level >= 6) {
        score -= 10
        reasons.push({ w: -10, why: 'Lv6 老冲浪人', tag: 'level' })
    }
    if (acc.verify === 0 || acc.verify === 1) {
        score -= 25
        reasons.push({ w: -25, why: '有官方认证', tag: 'verify' })
    }
    // 大肥鱼都挂在小号上，很少有人给小号充大会员
    if ((acc.vip ?? 0) > 0) {
        score -= 6
        reasons.push({ w: -6, why: '开着大会员（鱼不会自己充钱）', tag: 'vip' })
    }
    if (acc.avatarBlue !== null && acc.avatarBlue !== undefined) {
        if (acc.avatarBlue >= 0.4) {
            score += 22
            reasons.push({ w: 22, why: `头像 ${Math.round(acc.avatarBlue * 100)}% 是鲸鱼蓝`, tag: 'avatar' })
        } else if (acc.avatarBlue >= 0.25) {
            score += 12
            reasons.push({ w: 12, why: '头像蓝得可疑', tag: 'avatar' })
        }
    }
    return { score, reasons }
}
/**
 * 只看名字像不像大肥鱼（用于被 @ 的对象，拿不到它的资料）
 * @param name 昵称
 */
export const isFishName = (name: string): boolean => {
    // 「鱼京」是拆开写的「鲸」
    const n = cleanText(name).replace(/鱼京/g, '鲸')
    if (/(?:的|の)(?:大|小)?肥?(?:鱼|鲸)$/.test(n)) return true
    let score = 0
    for (const rule of NAME_RULES) if (rule.re.test(n)) score += rule.w
    return score >= 40
}
/**
 * 综合判定单个账号
 * @param acc 账号特征
 * @param texts 该账号在本页的评论
 * @param ctx 页面上下文（UP 主 mid / 被点名次数 / 前科页数）
 */
export const judgeAccount = (acc: AccountFacts, texts: Array<string | TextFacts>, ctx: { upMid?: string, calledOut?: number, priorPages?: number } = {}): FishVerdict => {
    const accountVerdict = scoreAccount(acc)
    let best: TextVerdict = { score: 0, reasons: []}
    let textSum = 0
    for (const entry of texts) {
        const verdict = typeof entry === 'string' ? scoreText(entry, { uname: acc.uname }) : scoreText(entry.text, { uname: acc.uname, isReply: entry.isReply })
        textSum += Math.max(0, verdict.score)
        if (verdict.score > best.score || best.reasons.length === 0) best = verdict
    }
    let score = accountVerdict.score + best.score
    const reasons: DetectionReason[] = [...accountVerdict.reasons, ...best.reasons]
    const topCount = texts.length
    if (topCount >= 3) {
        const w = Math.min(15, 5 * (topCount - 1))
        score += w
        reasons.push({ w, why: `在本页刷了 ${topCount} 条`, tag: 'repeat' })
    }
    if (texts.length >= 2 && textSum - Math.max(0, best.score) >= 20) {
        score += 8
        reasons.push({ w: 8, why: '每条都是一个味儿', tag: 'repeat' })
    }
    if (ctx.upMid && String(acc.mid) === String(ctx.upMid)) {
        score -= 40
        reasons.push({ w: -40, why: 'UP 主本人，给点面子', tag: 'up' })
    }
    if (ctx.calledOut) {
        const w = Math.min(20, 12 + (ctx.calledOut - 1) * 4)
        score += w
        reasons.push({ w, why: ctx.calledOut > 1 ? `被 ${ctx.calledOut} 个人点名是大肥鱼` : '楼中楼有人点名它是大肥鱼', tag: 'callout' })
    }
    // raw 不含「前科」，用来决定要不要记一笔前科，避免自我强化
    const raw = Math.max(0, Math.min(99, Math.round(score)))
    const prior = ctx.priorPages || 0
    if (prior >= 2) {
        const w = Math.min(30, 10 + prior * 6)
        score += w
        reasons.push({ w, why: `前科：在另外 ${prior} 个页面也被认出是大肥鱼`, tag: 'history' })
    } else if (prior === 1) {
        score += 10
        reasons.push({ w: 10, why: '前科：在别的页面被认出过一次', tag: 'history' })
    }
    return {
        score: Math.max(0, Math.min(99, Math.round(score))),
        raw,
        reasons: reasons.filter(r => r.w !== 0).sort((a, b) => b.w - a.w)
    }
}
/** 真人点名大肥鱼的措辞（楼中楼里经常出现） */
const CALLOUT = /大?肥鱼|肥鲸|人机|鱼小弟|回去干活|回家吃白饭|是\s*(?:AI|ai|bot|机器人)|(?:AI|ai|bot|机器人)(?:吧|吗|是吧|无疑|实锤)|别刷了|又是你|ds\s*味|deepseek\s*味/i
/** 点名统计用到的评论条目 */
export interface CalloutItem {
    mid: string
    uname: string
    rpid: string
    root: string
    text: string
    isReply?: boolean
}
/**
 * 统计「被几个不同的人点名是大肥鱼」
 *
 * 真人经常在楼中楼点名大肥鱼（「肥鱼回去干活」「你是 AI 吧」）。
 * @param list 本页所有评论条目
 * @returns mid → 被点名次数
 */
export const detectCallouts = (list: CalloutItem[]): Map<string, number> => {
    const byRpid = new Map<string, CalloutItem>()
    const byName = new Map<string, string>()
    const who = new Map<string, Set<string>>()
    for (const item of list) {
        byRpid.set(String(item.rpid), item)
        if (item.uname) byName.set(item.uname, item.mid)
    }
    for (const item of list) {
        if (!item.isReply) continue
        const text = cleanText(item.text)
        const match = text.match(/^回复\s*@([^\s:：]{1,24})\s*[:：]?\s*([\s\S]*)$/)
        const target = match ? byName.get(match[1]) : (byRpid.get(String(item.root)) || { mid: '' }).mid
        if (!target || String(target) === String(item.mid)) continue
        if (!CALLOUT.test(match ? match[2] : text)) continue
        if (!who.has(target)) who.set(target, new Set())
        who.get(target)!.add(String(item.mid))
    }
    return new Map([...who].map(([mid, set]) => [mid, set.size]))
}
/**
 * 分数 → 档位
 * @param score 综合分
 * @param threshold 判定为大肥鱼的分数线
 */
export const levelOf = (score: number, threshold: number = FISH_THRESHOLD): FishLevel => {
    if (score >= threshold) return 'fish'
    if (score >= Math.max(SUSPECT_THRESHOLD, threshold - 25)) return 'suspect'
    return 'human'
}
/**
 * 头像「鲸鱼蓝」像素占比（0~1）
 *
 * 判据与上游一致：HSV 里饱和度 > 0.35、亮度 > 0.18、且蓝色通道最大，色相落在 205°~250°。
 * @param rgba RGBA 像素数组（Canvas `getImageData().data`）
 */
export const blueRatio = (rgba: ArrayLike<number>): number => {
    let blue = 0
    let pixels = 0
    for (let i = 0; i + 3 < rgba.length; i += 4) {
        pixels++
        const r = rgba[i] / 255
        const g = rgba[i + 1] / 255
        const b = rgba[i + 2] / 255
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const v = max
        const s = max ? (max - min) / max : 0
        if (s <= 0.35 || v <= 0.18 || max !== b) continue
        let h = max === min ? 0 : 60 * (4 + (r - g) / (max - min))
        if (h < 0) h += 360
        if (h >= 205 && h <= 250) blue++
    }
    return pixels ? blue / pixels : 0
}
