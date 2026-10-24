/**
 * 配置迁移（IndexedDB → GM 存储）的合并规则
 *
 * 背景：IndexedDB 按源隔离（www / t / search / space 各一份同名库），
 * 迁到 GM 存储后只剩一份，各源的数据要合成一份 —— 规则必须**确定**且**不丢用户意图**。
 *
 * 事实前提（决定了规则怎么定）：
 * - 设置面板只存在于 www（播放页/首页）与 t（动态页，仅「投稿视频链接」一项）；
 *   search / space **没有任何设置入口**。
 * - 因此 search / space 的库里只有 initializeDefaults 写进去的**默认值**，
 *   从来不是用户的选择。
 * → 合并 = 「让用户显式设置过的值上位，让默认值让位」，而不是「合并两套用户偏好」。
 *
 * 三条规则（按序）：
 * ① **默认值让位**：本地值归一化后等于 schema 默认值 → 视为「用户没显式改过」→ 不写入。
 *    （search / space 的默认值绝不能盖掉 www 的真实设置）
 * ② **未知键不搬**：不在 defaults 里的键（历史遗留的已废弃配置项、内部标记）不迁。
 * ③ **冲突裁决**：本地与远端都是显式值 → 谁的时间戳新谁赢；
 *    远端若是「默认值补齐」（d 标记）→ 本地显式值**无条件**赢。
 *    （默认值补齐发生在迁移之后、时间戳天然更新，不加这条用户设置会被默认值压掉）
 */
import type { GmConfigRecord } from '@/services/gm-storage.service'
/** 本地（IndexedDB）的一条记录 */
export interface LocalConfigEntry {
    key: string
    value: unknown
    timestamp: number
}
/** 一条待写入的远端记录 */
export interface ConfigMigrationWrite {
    key: string
    value: unknown
    timestamp: number
}
/** 跳过原因 */
export type ConfigMigrationSkipReason = 'default-value' | 'unknown-key' | 'remote-newer' | 'same-value'
/** 被跳过的一条记录 */
export interface ConfigMigrationSkip {
    key: string
    reason: ConfigMigrationSkipReason
}
/** 迁移计划 */
export interface ConfigMigrationPlan {
    /** 要写入 GM 存储的记录 */
    writes: ConfigMigrationWrite[]
    /** 被跳过的记录（带原因，便于日志排查） */
    skips: ConfigMigrationSkip[]
}
/**
 * 计算迁移计划（纯函数，不碰任何存储）
 * @param localEntries 本源 IndexedDB 里的全部用户配置记录
 * @param remoteRecords GM 存储里已有的记录（键 → 记录）
 * @param defaults schema 派生出的默认值表（ConfigService.DEFAULT_VALUES）
 * @param normalize 值归一化函数（normalizeConfigValue）
 */
export const planConfigMigration = (
    localEntries: LocalConfigEntry[],
    remoteRecords: Map<string, GmConfigRecord>,
    defaults: Map<string, unknown>,
    normalize: (defaultValue: unknown, value: unknown) => unknown
): ConfigMigrationPlan => {
    const writes: ConfigMigrationWrite[] = []
    const skips: ConfigMigrationSkip[] = []
    for (const entry of localEntries) {
        const key = typeof entry.key === 'string' ? entry.key : String(entry.key)
        if (!key || !defaults.has(key)) {
            skips.push({ key, reason: 'unknown-key' })
            continue
        }
        const defaultValue = defaults.get(key)
        const normalized = normalize(defaultValue, entry.value)
        // 未设置 / 空值：等同于没存过，不搬
        if (normalized === null || normalized === undefined) {
            skips.push({ key, reason: 'default-value' })
            continue
        }
        // 规则①：值等于默认值 → 用户没显式改过（或改回了默认）→ 不搬
        if (normalized === defaultValue) {
            skips.push({ key, reason: 'default-value' })
            continue
        }
        const remote = remoteRecords.get(key)
        if (remote) {
            const remoteValue = normalize(defaultValue, remote.v)
            if (remoteValue === normalized) {
                skips.push({ key, reason: 'same-value' })
                continue
            }
            // 规则③：远端是「默认值补齐」→ 本地显式值无条件赢；否则比时间戳
            if (!remote.d && remote.t > entry.timestamp) {
                skips.push({ key, reason: 'remote-newer' })
                continue
            }
        }
        writes.push({ key, value: normalized, timestamp: entry.timestamp })
    }
    return { writes, skips }
}
