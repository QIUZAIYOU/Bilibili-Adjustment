/**
 * 功能调度器（2026-10-31 起）：按「车道 + 触发点」执行页面功能，替代线性串行链。
 *
 * 为什么需要它（背景）：
 * 旧实现是一条数组顺序 + `executeFunctionsSequentially`（concurrency=1，逐项 await，失败即中断），
 * 于是一个等接口/等 DOM 的功能就能把后面所有功能一起按住，甚至一项抛错后整条链不再执行。
 * 现场表现就是「模式切完之后导航变空、按钮不执行、像执行过程被突然打断」。
 *
 * 三条车道的语义：
 * - instant：纯 DOM 的即时功能，**并行**跑，单项硬超时（默认 300ms），一项失败绝不影响其它项；
 * - interactive：有先后语义的交互动作（切播放模式 → 定位），同一视频代次内**独占 + 去重**；
 * - background：网络/IO 类（简介、跳过片段、AI 识别、头像刷新、番剧判断），**与上面两条完全解耦**，
 *   并发受限、失败只记日志，谁都不等它。
 *
 * 代次（generation）：`bumpGeneration()` 之后，旧代次里还没跑完的功能不会再触发新动作，
 * 避免「切视频后旧任务继续写新页面」。这是纯逻辑模块，不碰 DOM，可单测。
 */
/** 车道 */
export type FeatureLane = 'instant' | 'interactive' | 'background'
/** 触发点：视频可播放 / 播放模式已选定 / 模式+定位都已完成（其余功能统一从这里开始） */
export type FeatureTrigger = 'player:ready' | 'mode:selected' | 'features:ready'
/** 单个功能的执行结果状态 */
export type FeatureStatus = 'ok' | 'error' | 'timeout' | 'skipped' | 'stale'
/** 功能声明 */
export interface FeatureDefinition {
    /** 唯一 id（日志/埋点用，建议与函数名一致） */
    id: string
    /** 车道 */
    lane: FeatureLane
    /** 由哪个触发点启动 */
    trigger: FeatureTrigger
    /** 同步条件（读 userConfigs 等，不要在这里做异步判断） */
    when?: () => boolean
    /** 单项硬超时（毫秒），缺省按车道默认值 */
    timeoutMs?: number
    /** 实际执行体 */
    run: () => unknown
}
/** 单条执行记录 */
export interface FeatureRecord {
    id: string
    lane: FeatureLane
    status: FeatureStatus
    /** 耗时（毫秒） */
    ms: number
    /** 所属代次 */
    generation: number
}
/** 调度器选项 */
export interface FeatureSchedulerOptions {
    /** 注入当前时间（测试用） */
    now?: () => number
    /** 每条记录产出时回调（日志/埋点用） */
    onRecord?: (record: FeatureRecord) => void
    /** background 车道并发上限（默认 2） */
    backgroundConcurrency?: number
    /** 各车道默认超时（毫秒） */
    defaultTimeouts?: Partial<Record<FeatureLane, number>>
}
/** 触发后的汇总（供一行日志） */
export interface TriggerSummary {
    generation: number
    instant: { total: number, ok: number, failed: number }
    interactive: { total: number, ok: number, failed: number }
    backgroundQueued: number
    /** instant + interactive 的总耗时（毫秒） */
    ms: number
}
/** 车道默认超时：DOM 类给 300ms；模式/定位这类要等布局的给宽松值 */
const DEFAULT_TIMEOUTS: Record<FeatureLane, number> = {
    instant: 300,
    interactive: 6000,
    background: 30000
}
/** 带超时的执行：超时不会取消底层任务，只是让调度不再等它 */
const runWithTimeout = async (
    run: () => unknown,
    timeoutMs: number
): Promise<'ok' | 'error' | 'timeout'> => {
    if (!(timeoutMs > 0)) {
        try {
            await run()
            return 'ok'
        } catch {
            return 'error'
        }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    const work = (async (): Promise<'ok' | 'error'> => {
        try {
            await run()
            return 'ok'
        } catch {
            return 'error'
        }
    })()
    try {
        return await Promise.race([work, timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}
export class FeatureScheduler {
    /** 后台队列上限：防止异常页面反复触发把队列撑爆（审查 W1） */
    static readonly MAX_BACKGROUND_QUEUE = 64
    #features: FeatureDefinition[]
    #options: FeatureSchedulerOptions
    #now: () => number
    #defaults: Record<FeatureLane, number>
    #generation = 0
    #activeInteractive = new Set<string>()
    #backgroundQueue: Array<{ feature: FeatureDefinition, generation: number }> = []
    #backgroundRunning = 0
    #backgroundIdleResolvers: Array<() => void> = []
    constructor (features: FeatureDefinition[], options: FeatureSchedulerOptions = {}) {
        this.#features = features
        this.#options = options
        this.#now = options.now ?? Date.now
        this.#defaults = { ...DEFAULT_TIMEOUTS, ...(options.defaultTimeouts ?? {}) }
    }
    /** 当前代次 */
    get generation (): number {
        return this.#generation
    }
    /** 切视频/换页：作废旧代次的任务（旧任务跑完也不会再触发新动作） */
    bumpGeneration (): number {
        this.#generation++
        this.#activeInteractive.clear()
        // 排队中还没启动的旧任务：直接丢弃并记为 stale（不静默消失，便于日志还原现场）
        this.#backgroundQueue.forEach(({ feature, generation }) => {
            this.#record({ id: feature.id, lane: 'background', status: 'stale', ms: 0, generation })
        })
        this.#backgroundQueue = []
        return this.#generation
    }
    /** 某代次是否仍是当前代次 */
    isCurrent (generation: number): boolean {
        return generation === this.#generation
    }
    #record (record: FeatureRecord): void {
        this.#options.onRecord?.(record)
    }
    #resolveFeatureTimeout (feature: FeatureDefinition): number {
        const laneDefault = this.#defaults[feature.lane]
        return feature.timeoutMs ?? laneDefault
    }
    #collect (trigger: FeatureTrigger, lane: FeatureLane): FeatureDefinition[] {
        return this.#features.filter(feature => {
            if (feature.lane !== lane || feature.trigger !== trigger) return false
            if (!feature.when) return true
            try {
                return Boolean(feature.when())
            } catch {
                return false
            }
        })
    }
    #drainBackground (): void {
        const limit = Math.max(1, this.#options.backgroundConcurrency ?? 2)
        while (this.#backgroundRunning < limit && this.#backgroundQueue.length > 0) {
            const queued = this.#backgroundQueue.shift()!
            const { feature, generation } = queued
            // 入队后已换代（切了视频/换了页面）：旧代次的任务直接丢弃，绝不再碰新页面
            if (!this.isCurrent(generation)) {
                this.#record({ id: feature.id, lane: 'background', status: 'stale', ms: 0, generation })
                continue
            }
            this.#backgroundRunning++
            void (async () => {
                const startedAt = this.#now()
                const status = await runWithTimeout(feature.run, this.#resolveFeatureTimeout(feature))
                this.#record({
                    id: feature.id,
                    lane: 'background',
                    status: this.isCurrent(generation) ? status : 'stale',
                    ms: this.#now() - startedAt,
                    generation
                })
            })().finally(() => {
                this.#backgroundRunning--
                if (this.#backgroundQueue.length > 0) {
                    this.#drainBackground()
                    return
                }
                if (this.#backgroundRunning === 0) {
                    const resolvers = this.#backgroundIdleResolvers
                    this.#backgroundIdleResolvers = []
                    resolvers.forEach(resolve => resolve())
                }
            })
        }
    }
    /**
     * 触发一个阶段：instant 并行、interactive 独占、background 入队（不等）
     * @param trigger 触发点
     */
    async trigger (trigger: FeatureTrigger): Promise<TriggerSummary> {
        const startedAt = this.#now()
        const generation = this.#generation
        const instantFeatures = this.#collect(trigger, 'instant')
        const interactiveFeatures = this.#collect(trigger, 'interactive')
        const backgroundFeatures = this.#collect(trigger, 'background')
        // 后台队列：同 id 去重（后到的替换先到的）+ 上限保护（审查 W1：此前无去重无上限）
        for (const feature of backgroundFeatures) {
            const index = this.#backgroundQueue.findIndex(item => item.feature.id === feature.id)
            if (index >= 0) this.#backgroundQueue.splice(index, 1)
            this.#backgroundQueue.push({ feature, generation })
            while (this.#backgroundQueue.length > FeatureScheduler.MAX_BACKGROUND_QUEUE) {
                const dropped = this.#backgroundQueue.shift()
                if (dropped) this.#record({ id: dropped.feature.id, lane: 'background', status: 'stale', ms: 0, generation: dropped.generation })
            }
        }
        this.#drainBackground()
        const instantResults = await Promise.all(instantFeatures.map(async feature => {
            const start = this.#now()
            const status = await runWithTimeout(feature.run, this.#resolveFeatureTimeout(feature))
            // instant 也要判代次：bumpGeneration 之后才跑完的任务属于旧页面，不能记成 ok（审查 W1）
            this.#record({ id: feature.id, lane: 'instant', status: this.isCurrent(generation) ? status : 'stale', ms: this.#now() - start, generation })
            return status
        }))
        const interactiveResults = await Promise.all(interactiveFeatures.map(async feature => {
            if (this.#activeInteractive.has(feature.id)) {
                this.#record({ id: feature.id, lane: 'interactive', status: 'skipped', ms: 0, generation })
                return 'skipped' as const
            }
            this.#activeInteractive.add(feature.id)
            const start = this.#now()
            try {
                const status = await runWithTimeout(feature.run, this.#resolveFeatureTimeout(feature))
                this.#record({ id: feature.id, lane: 'interactive', status: this.isCurrent(generation) ? status : 'stale', ms: this.#now() - start, generation })
                return status
            } finally {
                this.#activeInteractive.delete(feature.id)
            }
        }))
        const count = (statuses: Array<'ok' | 'error' | 'timeout' | 'skipped'>): { ok: number, failed: number } => ({
            ok: statuses.filter(status => status === 'ok').length,
            failed: statuses.filter(status => status === 'error' || status === 'timeout').length
        })
        const instantCount = count(instantResults)
        const interactiveCount = count(interactiveResults)
        return {
            generation,
            instant: { total: instantFeatures.length, ...instantCount },
            interactive: { total: interactiveFeatures.length, ...interactiveCount },
            backgroundQueued: backgroundFeatures.length,
            ms: this.#now() - startedAt
        }
    }
    /** 等 background 车道跑完（仅测试/卸载时用，正常路径不要 await） */
    whenBackgroundIdle (): Promise<void> {
        if (this.#backgroundRunning === 0 && this.#backgroundQueue.length === 0) return Promise.resolve()
        return new Promise(resolve => { this.#backgroundIdleResolvers.push(resolve) })
    }
    /** 供日志：还有多少后台任务在跑/排队 */
    get backgroundPending (): number {
        return this.#backgroundRunning + this.#backgroundQueue.length
    }
}
