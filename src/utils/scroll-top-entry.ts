import { elementSelectors } from '@/shared/element-selectors'
/**
 * 「点击后会触发 B 站回到顶部」的入口判定（纯函数，便于单测）
 *
 * 背景：视频页的滚动容器带 `scroll-behavior: smooth`，而 B 站自己的 `switchVideo` 在切换视频/选集后
 * 会调用 `window.scrollTo(0, 0)` —— 用户就会看到页面先滑回顶部、再被我们的定位拉回来。
 * 实测（真实页面取证）涉及的入口有三类，都交给同一套位置守卫（`modules/video/scroll-guard`）：
 * 1. 选集/分P/合集/番剧选集、播放器控制栏的上下集按钮（约 35ms 后 `scrollTo(0,0)`）；
 * 2. 播完后播放器上出现的「推荐视频」卡片（`.bpx-player-ending-related`，同样是切视频）。
 *
 * ⚠️ 选择器来自注册表（`episodeSwitchEntry` / `playerEndingRelatedLink`），**不要在这里写死**：
 * B 站改版时改服务器上的 hot-config/selectors.js 即可生效，不必发版。
 */
const episodeSwitchEntrySelector = (): string | null => elementSelectors.CSS('episodeSwitchEntry')
/** 播完后的「推荐视频」卡片（点它 = 切到另一个视频） */
const endingRelatedLinkSelector = (): string | null => elementSelectors.CSS('playerEndingRelatedLink')
/**
 * 上下集按钮的文案特征：B 站各版式类名不统一（分P 是「下一个」、番剧是「下一话」、合集是「下一集」），
 * 类名命中之外再按标签文本兜底，避免以后版式一改就又漏掉一条入口。
 */
const EPISODE_SWITCH_LABEL = /^(上一集|下一集|上一话|下一话|上一P|下一P|上一个|下一个|上一期|下一期|上一视频|下一视频|previous|prev|next)$/i
/** 点击是否命中「切换选集/上下集」的入口（注册表选择器为主、文案兜底） */
export const isEpisodeSwitchElement = (element: Element | null): boolean => {
    if (!element) return false
    const entrySelector = episodeSwitchEntrySelector()
    if (entrySelector && element.closest(entrySelector)) return true
    // 点在图标/内层元素上时向上找几层，取 aria-label / title / 文本判断
    let node: Element | null = element
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        const label = (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim()
        if (EPISODE_SWITCH_LABEL.test(label)) return true
    }
    return false
}
/**
 * 点击的元素是否是「会触发 B 站回到顶部」的入口：切换选集/上下集，以及播完后的推荐视频卡片。
 * 两类入口行为一致，故统一判定、交给同一个位置守卫（只守位置、不主动定位）。
 */
export const isScrollToTopEntry = (element: Element | null): boolean => {
    if (element) {
        const endingSelector = endingRelatedLinkSelector()
        if (endingSelector && element.closest(endingSelector)) return true
    }
    return isEpisodeSwitchElement(element)
}
