export type ModeDecisionReason = 'movie-wide' | 'preserve' | 'cooldown' | 'no-container' | 'already-target' | 'target-normal' | 'switch'
export interface ModeDecisionInput {
    hasContainer: boolean
    currentMode: string | null
    targetMode: string
    movieWide: boolean
    preserveActive: boolean
    cooldownActive: boolean
}
export interface ModeDecision {
    action: 'emit' | 'switch'
    reason: ModeDecisionReason
}
/**
 * 播放器模式的决策：emit = 不需要切换，按当前状态派发「模式已选定」；switch = 真的去点按钮
 *
 * 判定顺序与旧实现逐条一致（movie → preserve → cooldown → 容器 → 已等于目标 → normal），
 * 改动只有一处：这些 emit 分支必须在 data-screen 稳定之后才可信。
 */
export const resolveModeDecision = (input: ModeDecisionInput): ModeDecision => {
    if (input.movieWide) return { action: 'emit', reason: 'movie-wide' }
    if (input.preserveActive) return { action: 'emit', reason: 'preserve' }
    if (input.cooldownActive) return { action: 'emit', reason: 'cooldown' }
    if (!input.hasContainer) return { action: 'emit', reason: 'no-container' }
    if (input.currentMode === input.targetMode) return { action: 'emit', reason: 'already-target' }
    if (input.targetMode === 'normal') return { action: 'emit', reason: 'target-normal' }
    return { action: 'switch', reason: 'switch' }
}
