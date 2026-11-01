/**
 * 「当前视频有没有字幕」的会话内缓存。
 *
 * 用途：侧栏「片段」按钮只在**有字幕**的视频上出现（字幕是片段识别/自动跳过的前提，
 * 没有字幕的视频点进去什么也做不了）；「鱼塘」按钮用 `syncFishPondButton` 走同一个思路。
 *
 * 为什么单独抽出来：
 * - 判字幕要发两次网络请求（视频信息 + 字幕轨道），侧栏插入会在 SPA 换集、重试、并发派发里被调用多次，
 *   不缓存就会重复打接口；
 * - 判定是**异步**的，而插入按钮是同步流程 —— 需要「同一条视频只发一次、并发调用共享同一个 Promise」，
 *   这层语义值得单独测（纯类，注入 probe 即可单测）。
 *
 * 不缓存失败：probe 抛错说明「这次没问出来」，下次仍要重试；只有明确的「有/没有」才落缓存。
 */
export type SubtitleProbe = (bvid: string) => Promise<boolean>
export class SubtitleAvailabilityCache {
    readonly #probe: SubtitleProbe
    readonly #answers = new Map<string, boolean>()
    readonly #pending = new Map<string, Promise<boolean>>()
    constructor (probe: SubtitleProbe) {
        this.#probe = probe
    }
    /** 已知答案（无则 undefined，表示还没问过或上次失败） */
    peek (bvid: string): boolean | undefined {
        return this.#answers.get(bvid)
    }
    /** 取答案：命中缓存同步返回，否则发请求并共享同一个 Promise */
    async resolve (bvid: string): Promise<boolean> {
        const known = this.#answers.get(bvid)
        if (known !== undefined) return known
        const running = this.#pending.get(bvid)
        if (running) return running
        const task = (async (): Promise<boolean> => {
            try {
                const hasSubtitles = await this.#probe(bvid)
                this.#answers.set(bvid, hasSubtitles)
                return hasSubtitles
            } finally {
                this.#pending.delete(bvid)
            }
        })()
        this.#pending.set(bvid, task)
        return task
    }
    /** 换视频时清掉旧答案（SPA 换集后字幕轨道会变） */
    forget (bvid?: string): void {
        if (bvid === undefined) {
            this.#answers.clear()
            return
        }
        this.#answers.delete(bvid)
    }
}
