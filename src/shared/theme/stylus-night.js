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
const STYLUS_STYLE_SELECTOR = 'style.stylus'
const STYLUS_NIGHT_MARK = '===StylusNightForBilibili==='
let started = false
/** 当前是否为夜间样式激活态 */
let active = false
/** 本会话是否进入过夜间激活态（初次未激活时不写主题，避免打扰无 Stylus 用户） */
let wasEverActive = false
const isStylusNightActive = () =>
    [...document.querySelectorAll(STYLUS_STYLE_SELECTOR)].some(el => (el.textContent || '').includes(STYLUS_NIGHT_MARK))
const applyStateNow = async () => {
    const on = isStylusNightActive()
    if (on === active) return
    active = on
    if (on) {
        wasEverActive = true
        await ConfigService.setValue('theme', 'night')
    } else if (wasEverActive) {
        // 从夜间激活态关闭 → 回到「跟随B站」（light/dark 依 B 站官方标记）
        await ConfigService.setValue('theme', 'follow')
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
    if (typeof MutationObserver === 'undefined') return
    let timer = null
    const observer = new MutationObserver(() => {
        clearTimeout(timer)
        timer = setTimeout(applyState, 150)
    })
    try {
        // Stylus 启用/禁用会增删 style 元素或置 disabled 属性；挂在根节点，head 未就绪也不抛错
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled']
        })
    } catch {
        // 观察器初始化失败时退化为定时轮询
        setInterval(applyState, 2000)
    }
}
