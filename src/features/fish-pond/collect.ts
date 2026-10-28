/**
 * 播放页评论区「大肥鱼」扫描
 *
 * 只做三件事：从评论区读取评论数据 → 交给 rules.ts 打分 → 把结果留一份内存态给「鱼塘」弹窗。
 * 阅读/隐藏 DOM 的部分放在 feature 入口（index.ts），这里保持「读数据 + 判定」的纯逻辑，
 * 便于测试时用假数据直接验证。
 */
import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { FISH_THRESHOLD, blueRatio, cleanText, detectCallouts, judgeAccount, levelOf } from './rules'
import type { AccountFacts, CalloutItem, DetectionReason, FishLevel } from './rules'
const logger = new LoggerService('VideoModule')
const shadowDOMHelper = new ShadowDOMHelper()
/** 被判定为大肥鱼的评论渲染元素上的标记（供「鱼塘」高亮 / 恢复时定位） */
export const FISH_MARK_ATTR = 'data-adj-fish'
/** 被移除的评论元素上的标记 */
export const FISH_REMOVED_ATTR = 'data-adj-fish-removed'
/** 头像取色用的画布边长（越小越快，32 足够判断「蓝不蓝」） */
const AVATAR_SAMPLE_SIZE = 32
/** 单次扫描最多取色的头像数量（canvas 取色是同步且较慢的，必须设上限） */
const AVATAR_SAMPLE_LIMIT = 12
/** 头像色号缓存：同一 URL 只取一次色（翻页/重扫都会命中） */
const avatarBlueCache = new Map<string, number | null>()
/**
 * 账号在**本次会话**里的前科：SPA 内切换视频时脚本不会重载，可跨视频累计
 * （只存内存，不写存储：这不是用户配置，且页面刷新后重新学习成本很低）
 */
const sessionHistory = new Map<string, Set<string>>()
/** B 站评论渲染元素的 `.data`（字段随版本变，这里只声明用到的部分） */
interface RawCommentData {
    rpid?: string | number
    root?: string | number
    mid?: string | number
    uname?: string
    avatar?: string
    level?: number
    verify?: number
    vip?: number | { vipStatus?: number }
    ctime?: number
    like?: number
    content?: { message?: string }
    text?: string
    member?: {
        mid?: string | number
        uname?: string
        avatar?: string
        sign?: string
        level_info?: { current_level?: number }
        vip?: { vipStatus?: number }
        official_verify?: { type?: number }
    }
}
/** 一条被识别出来的评论（「鱼塘」列表的一项） */
export interface FishComment {
    mid: string
    uname: string
    avatar: string
    session: string
    text: string
    isReply: boolean
    ctime: number
    like: number
    level: number
    score: number
    verdict: FishLevel
    reasons: DetectionReason[]
    renderer: Element
}
/** 一次扫描的结果 */
export interface ScanResult {
    /** 参与打分的账号数 */
    accounts: number
    /** 参与打分的评论条数 */
    comments: number
    /** 判为大肥鱼的评论（按分数降序） */
    items: FishComment[]
    /** 判为可疑的账号数（只统计，不处理） */
    suspects: number
}
/** 最近的扫描结果（「鱼塘」弹窗直接读它，避免重复扫） */
let lastScan: ScanResult = { accounts: 0, comments: 0, items: [], suspects: 0 }
/** 读取上一次扫描结果 */
export const getLastScan = (): ScanResult => lastScan
/** 清空状态（SPA 切视频时调用） */
export const resetFishState = (): void => {
    lastScan = { accounts: 0, comments: 0, items: [], suspects: 0 }
}
/**
 * 从渲染元素的 `.data` 里取账号特征
 * @param data 渲染元素的 `.data`
 */
const toAccountFacts = (data: RawCommentData): AccountFacts => ({
    mid: String(data.mid ?? data.member?.mid ?? ''),
    uname: String(data.uname ?? data.member?.uname ?? ''),
    sign: typeof data.member?.sign === 'string' ? data.member.sign : '',
    level: Number(data.level ?? data.member?.level_info?.current_level ?? 0),
    verify: Number(data.verify ?? data.member?.official_verify?.type ?? -1),
    vip: typeof data.vip === 'object' ? Number(data.vip?.vipStatus ?? 0) : Number(data.vip ?? data.member?.vip?.vipStatus ?? 0)
})
/**
 * 取评论正文
 * @param data 渲染元素的 `.data`
 */
const toText = (data: RawCommentData): string => cleanText(data.content?.message ?? data.text ?? '')
/** 本页的「页面标识」：用于给前科记「在哪一页见过它」 */
const pageKey = (): string => `${location.pathname}${location.search}`
/**
 * 量头像的「鲸鱼蓝」占比（失败即返回 null，绝不因为取色失败而影响识别）
 * @param url 头像地址
 */
const sampleAvatarBlue = (url: string): Promise<number | null> => new Promise(resolve => {
    if (!url) {
        resolve(null)
        return
    }
    if (avatarBlueCache.has(url)) {
        resolve(avatarBlueCache.get(url) ?? null)
        return
    }
    const img = new Image()
    // 头像域名支持 CORS；不支持时图片会因为 crossOrigin 直接失败，走 catch 返回 null
    img.crossOrigin = 'anonymous'
    const finish = (value: number | null): void => {
        avatarBlueCache.set(url, value)
        resolve(value)
    }
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas')
            canvas.width = AVATAR_SAMPLE_SIZE
            canvas.height = AVATAR_SAMPLE_SIZE
            const ctx = canvas.getContext('2d')
            if (!ctx) return finish(null)
            ctx.drawImage(img, 0, 0, AVATAR_SAMPLE_SIZE, AVATAR_SAMPLE_SIZE)
            finish(blueRatio(ctx.getImageData(0, 0, AVATAR_SAMPLE_SIZE, AVATAR_SAMPLE_SIZE).data))
        } catch (error) {
            // 画布被跨域图片污染（服务器没给 ACAO）：没有头像信号就用别的信号判定
            logger.debug('鱼塘丨头像取色被跨域污染，跳过该信号', error)
            finish(null)
        }
    }
    img.onerror = () => finish(null)
    img.src = url
})
/**
 * 读当前 UP 主的 mid（用于给 UP 主本人免责：自己给自己评论不算鱼）
 */
const getUpMid = (): string => {
    const state = (window as Window & { __INITIAL_STATE__?: { videoData?: { owner?: { mid?: number | string }}}}).__INITIAL_STATE__
    const mid = state?.videoData?.owner?.mid
    return mid === undefined || mid === null ? '' : String(mid)
}
/**
 * 收集评论区所有渲染元素
 *
 * 走 Shadow DOM：`#feed` 在 `bili-comments` 的 shadow root 里，楼层/楼中楼又各自有 shadow root。
 */
const collectRenderers = (): Element[] => {
    const feed = shadowDOMHelper.querySelector(shadowDomSelectors.commentRenderderContainer)
    if (!feed) return []
    const threads = shadowDOMHelper.queryDescendant(feed, shadowDomSelectors.commentThreadRenderder, true) as Element[] | null
    const roots = threads && threads.length ? threads : [feed]
    const renderers: Element[] = []
    for (const root of roots) {
        const items = shadowDOMHelper.queryDescendant(root, `${shadowDomSelectors.commentRenderder}, ${shadowDomSelectors.commentReplyRenderder}`, true) as Element[] | null
        if (items) renderers.push(...items)
    }
    // 同一元素可能被两层 roots 各查到一次
    return Array.from(new Set(renderers))
}
/** 当前评论区里可参与判定的渲染元素数量（给轮询做变化签名用） */
export const countCommentRenderers = (): number => collectRenderers().length
/**
 * 扫描播放页评论区，判定哪些评论来自「大肥鱼」
 *
 * 判定是**按账号**做的（同一个人在本页发了多条 → 合并算分），再回填到每一条评论上。
 * @param options threshold：判为大肥鱼的分数线（默认 60）
 */
export const scanFishComments = async (options: { threshold?: number } = {}): Promise<ScanResult> => {
    const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : FISH_THRESHOLD
    const renderers = collectRenderers()
    if (!renderers.length) {
        lastScan = { accounts: 0, comments: 0, items: [], suspects: 0 }
        return lastScan
    }
    interface Group {
        facts: AccountFacts
        avatar: string
        texts: Array<{ text: string, isReply: boolean }>
        comments: Array<{ renderer: Element, rpid: string, root: string, ctime: number, like: number, text: string, isReply: boolean }>
    }
    const groups = new Map<string, Group>()
    const calloutItems: CalloutItem[] = []
    for (const renderer of renderers) {
        const data = (renderer as Element & { data?: RawCommentData }).data
        if (!data) continue
        const facts = toAccountFacts(data)
        if (!facts.mid) continue
        const isReply = renderer.localName === shadowDomSelectors.commentReplyRenderder
        const text = toText(data)
        const rpid = String(data.rpid ?? '')
        const root = String(data.root ?? 0)
        let group = groups.get(facts.mid)
        if (!group) {
            group = { facts, avatar: String(data.avatar ?? data.member?.avatar ?? ''), texts: [], comments: []}
            groups.set(facts.mid, group)
        }
        group.texts.push({ text, isReply })
        group.comments.push({ renderer, rpid, root, ctime: Number(data.ctime ?? 0), like: Number(data.like ?? 0), text, isReply })
        calloutItems.push({ mid: facts.mid, uname: facts.uname, rpid, root, text, isReply })
    }
    const callouts = detectCallouts(calloutItems)
    const upMid = getUpMid()
    const session = pageKey()
    const candidates: Array<{ group: Group, score: number, reasons: DetectionReason[], raw: number, verdict: FishLevel }> = []
    for (const [mid, group] of groups) {
        const priorPages = sessionHistory.get(mid)?.size ?? 0
        const verdict = judgeAccount(group.facts, group.texts, { upMid, calledOut: callouts.get(mid) ?? 0, priorPages })
        const level = levelOf(verdict.score, threshold)
        candidates.push({ group, score: verdict.score, reasons: verdict.reasons, raw: verdict.raw, verdict: level })
        // 只有本来就像鱼的账号才记前科（避免把普通人越记越像）
        if (verdict.raw >= threshold - 10) {
            const pages = sessionHistory.get(mid) ?? new Set<string>()
            pages.add(session)
            sessionHistory.set(mid, pages)
        }
    }
    // 头像取色：只给「已经有点像鱼」的账号做，且限制次数
    const needAvatar = candidates
        .filter(item => item.raw >= threshold - 20 && item.group.avatar && !avatarBlueCache.has(item.group.avatar))
        .slice(0, AVATAR_SAMPLE_LIMIT)
    await Promise.all(needAvatar.map(async item => {
        const ratio = await sampleAvatarBlue(item.group.avatar)
        if (ratio === null) return
        const facts: AccountFacts = { ...item.group.facts, avatarBlue: ratio }
        const priorPages = sessionHistory.get(item.group.facts.mid)?.size ?? 0
        const verdict = judgeAccount(facts, item.group.texts, { upMid, calledOut: callouts.get(item.group.facts.mid) ?? 0, priorPages })
        item.score = verdict.score
        item.reasons = verdict.reasons
        item.raw = verdict.raw
        item.verdict = levelOf(verdict.score, threshold)
    }))
    const items: FishComment[] = []
    let suspects = 0
    let commentCount = 0
    for (const item of candidates) {
        commentCount += item.group.comments.length
        if (item.verdict === 'suspect') suspects += item.group.comments.length
        if (item.verdict !== 'fish') continue
        for (const comment of item.group.comments) {
            items.push({
                mid: item.group.facts.mid,
                uname: item.group.facts.uname,
                avatar: item.group.avatar,
                session,
                text: comment.text,
                isReply: comment.isReply,
                ctime: comment.ctime,
                like: comment.like,
                level: Number(item.group.facts.level ?? 0),
                score: item.score,
                verdict: item.verdict,
                reasons: item.reasons,
                renderer: comment.renderer
            })
        }
    }
    items.sort((a, b) => b.score - a.score)
    lastScan = { accounts: groups.size, comments: commentCount, items, suspects }
    logger.debug(`鱼塘丨扫描完成：${groups.size} 个账号 / ${commentCount} 条评论 / 命中 ${items.length} 条`)
    return lastScan
}
/**
 * 把命中的评论标出来并从页面移除
 *
 * 用 `display: none` 隐藏（不删节点）：B 站自己会重渲染评论区，我们删了它会重新长回来，
 * 而隐藏 + 重扫时再隐藏一次是幂等的。
 * @param items 要移除的评论
 * @returns 实际隐藏的条数
 */
export const hideFishComments = (items: FishComment[]): number => {
    let hidden = 0
    for (const item of items) {
        const renderer = item.renderer as HTMLElement
        if (!renderer || !renderer.style) continue
        renderer.setAttribute(FISH_MARK_ATTR, String(item.score))
        if (renderer.getAttribute(FISH_REMOVED_ATTR) === '1') continue
        renderer.setAttribute(FISH_REMOVED_ATTR, '1')
        renderer.style.setProperty('display', 'none', 'important')
        hidden++
    }
    if (hidden) logger.debug(`鱼塘丨已移除 ${hidden} 条大肥鱼评论`)
    return hidden
}
/** 统计当前页被移除的评论条数（供「鱼塘」标题展示） */
export const countHiddenComments = (): number => document.querySelectorAll(`[${FISH_REMOVED_ATTR}]`).length
/** 评论区的存在性（没有评论区的页面不扫描） */
export const hasCommentArea = (): boolean => Boolean(elementSelectors.get('videoComment'))
