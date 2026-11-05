/**
 * 侧边栏工具按钮的去重判定
 *
 * 背景：B 站播放页的侧边栏浮层会被 React 反复重渲染，我们插进去的按钮有时会被搬到容器外
 * （甚至整块 DOM 被替换）。原先的幂等判据只在「当前容器」里 querySelector，一旦按钮被搬出去，
 * 判定就认为「还没插」，看护定时器于是再插一组；被搬出去的副本又留在页面上，越积越多，
 * 表现为页面左缘出现十几组「定位 / UP / 片段 / 设置」。
 *
 * 这里把所有判据收敛成纯函数：以「可见的那个侧栏容器」为主容器，主容器里同 key 只保留第一个，
 * 其余副本（在容器外、或主容器内重复的）一律视为待清理。网页全屏镜像容器 #mirror-vdcon 里的
 * 按钮是播放器镜像自己的，必须豁免，否则会误删全屏下的按钮。
 */
export const SIDENAV_KEY_SELECTORS = {
    locate: '.bili-adjustment-icon.locate',
    settings: '.bili-adjustment-icon.settings',
    up: '.bili-adjustment-icon.up',
    skip: '.bili-adjustment-icon.skip',
    fishpond: '.bili-adjustment-icon.fishpond'
} as const
export type SidenavButtonKey = keyof typeof SIDENAV_KEY_SELECTORS
export const SIDENAV_KEYS = Object.keys(SIDENAV_KEY_SELECTORS) as SidenavButtonKey[]
/** 网页全屏时播放器会复制一份侧栏，这棵子树里的按钮不算重复 */
export const SIDENAV_MIRROR_SELECTOR = '#mirror-vdcon'
function isVisibleNav (nav: Element): boolean {
    if (!nav.isConnected) return false
    return nav.getClientRects().length > 0
}
/**
 * 选出「主容器」：优先可见的，其次只要还连着文档
 *
 * querySelectorAll 返回文档顺序，同一时刻最多只有一个侧栏真正显示，
 * 因此可见的里面取最后一个即可（B 站切页时会出现新旧两个容器短暂并存）。
 */
export function pickPrimaryFloatNav (navs: readonly Element[]): Element | null {
    const connected = navs.filter(nav => nav.isConnected)
    if (connected.length === 0) return null
    const visible = connected.filter(isVisibleNav)
    return visible.length > 0 ? visible[visible.length - 1] : connected[connected.length - 1]
}
interface SidenavDedupeInput {
    navs: readonly Element[]
    candidates: Partial<Record<SidenavButtonKey, readonly Element[]>>
    isInMirror: (element: Element) => boolean
    /** 显式指定主容器（测试与调用方已选好时用），缺省按 pickPrimaryFloatNav 推导 */
    primary?: Element | null
}
export interface SidenavDedupePlan {
    primary: Element | null
    /** 需要移除的副本：不在主容器内、且不在镜像里 */
    staleCopies: Element[]
    /** 主容器内每个 key 实际生效的那个元素 */
    present: Partial<Record<SidenavButtonKey, Element>>
}
export function planSidenavDedupe (input: SidenavDedupeInput): SidenavDedupePlan {
    const primary = input.primary !== undefined ? input.primary : pickPrimaryFloatNav(input.navs)
    if (!primary) return { primary: null, staleCopies: [], present: {}}
    const present: Partial<Record<SidenavButtonKey, Element>> = {}
    const staleCopies: Element[] = []
    for (const key of SIDENAV_KEYS) {
        const candidates = input.candidates[key] ?? []
        for (const element of candidates) {
            const insidePrimary = primary.contains(element)
            if (insidePrimary) {
                if (present[key]) staleCopies.push(element)
                else present[key] = element
                continue
            }
            if (input.isInMirror(element)) continue
            staleCopies.push(element)
        }
    }
    return { primary, staleCopies, present }
}
