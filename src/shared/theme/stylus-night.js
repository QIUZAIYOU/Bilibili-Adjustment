/**
 * Stylus「夜间哔哩 NightMode For Bilibili」样式检测 —— 主题二态实时驱动
 *
 * 规则（简单直接）：
 * - 检测到 style.stylus 元素文本含「===StylusNightForBilibili===」（Stylus 开启了夜间哔哩样式）
 *   → theme 配置写入「夜间哔哩」（night）；
 * - 该样式被禁用（元素移除/置 disabled/标记文本消失）→ theme 配置写回「跟随B站」（follow）；
 * - 全程实时：MutationObserver 监听 style 元素增删/禁用状态，变化即应用。
 *
 * 说明：初次加载未激活时不写入任何值 —— 未安装 Stylus / 未启用夜间样式的用户
 * 仍可手动选择主题，不受本模块打扰；仅当本会话进入过夜间激活态后，关闭时才回写 follow。
 * theme 写入走 ConfigService.setValue → config:changed 事件 → ThemeManager 与设置弹窗即时同步。
 */
import { ConfigService } from '@/services/config.service'
import { LoggerService } from '@/services/logger.service'
const logger = new LoggerService('StylusNight')
const STYLUS_STYLE_SELECTOR = 'style.stylus'
const STYLUS_NIGHT_MARK = '===StylusNightForBilibili==='
let started = false
/** 当前是否为夜间样式激活态 */
let active = false
/** 本会话是否进入过夜间激活态（初次未激活时不写主题，避免打扰无 Stylus 用户） */
let wasEverActive = false
const isStylusNightActive = () =>
    [...document.querySelectorAll(STYLUS_STYLE_SELECTOR)].some(el =>
        // 元素存在还不够：Stylus 关闭样式时可能只是给元素加 disabled，或从 CSSOM 层面
        // 设置 sheet.disabled，此时元素与文本内容都还在——只看文本会误判为「仍在夜间模式」。
        !el.disabled && !el.sheet?.disabled && (el.textContent || '').includes(STYLUS_NIGHT_MARK))
const applyStateNow = async () => {
    const on = isStylusNightActive()
    if (on === active) return
    active = on
    const found = document.querySelectorAll(STYLUS_STYLE_SELECTOR).length
    if (on) {
        wasEverActive = true
        logger.debug(`Stylus 夜间样式丨已开启（style.stylus=${found}），主题切换为「夜间哔哩」`)
        await ConfigService.setValue('theme', 'night')
    } else if (wasEverActive) {
        // 从夜间激活态关闭 → 回到「跟随B站」（light/dark 依 B 站官方标记）
        logger.debug(`Stylus 夜间样式丨已关闭（style.stylus=${found}），主题切换回「跟随B站」`)
        await ConfigService.setValue('theme', 'follow')
    } else {
        logger.debug(`Stylus 夜间样式丨未激活（style.stylus=${found}）且本会话未进入过激活态，不改动主题`)
    }
}
// 串行化：快速开关时按序执行，避免并发写 theme 配置
let applyChain = Promise.resolve()
const applyState = () => {
    applyChain = applyChain.then(applyStateNow).catch(() => {})
}
/** 启动检测：立即应用一次当前状态，并监听 style 元素增删/禁用实时跟随 */
export const initStylusNightFollowing = () => {
    if (started) return
    started = true
    applyState()
    if (typeof MutationObserver !== 'undefined') {
        let timer = null
        const schedule = () => {
            clearTimeout(timer)
            timer = setTimeout(applyState, 150)
        }
        const observer = new MutationObserver(schedule)
        try {
            // Stylus 启用/禁用样式的表现有多种：增删 style 元素、置 disabled 属性、
            // 甚至改写元素文本；childList+subtree 覆盖增删，characterData 覆盖文本改写。
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['disabled']
            })
        } catch {
            // 观察器初始化失败时退化为下面的定时轮询
        }
    }
    // 兜底轮询（常驻）：Stylus 通过 CSSOM 改变状态（如 sheet.disabled = true、
    // 清空 style 元素文本）时不会产生任何 DOM 变更记录，观察器无法感知，
    // 必须靠低频轮询才能可靠跟随开关。检测本身很轻（一次 querySelectorAll + includes），
    // 且 applyStateNow 内已有「状态未变化直接 return」的早退保护。
    setInterval(applyState, 2000)
}
