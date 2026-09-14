/**
 * 首页推荐历史的记录整理（纯函数，零依赖 → 便于单测）
 */
/**
 * 排序并去重首页推荐历史记录：
 * - 批次时间倒序（最新批次在最前）→ 批次内按页面顺序升序（与旧实现一致）；
 * - 同一视频在多次「换一换」后会记录到多个批次，按 url（缺失时退回 _key）只保留最新一条，
 *   否则列表会重复展示同一视频（旧实现未去重，这是用户反馈的「列表出现重复内容」）。
 * @param {Array<{key: string, value: object}>} rawList storageService.getAllRaw('index') 的结果
 * @returns {Array<object>} 去重并排序后的记录（每项带 _key/_order/_sessionTimestamp）
 */
export const sortAndDedupeHistoryRecords = (rawList: unknown): Array<Record<string, unknown>> => {
    const seenVideos = new Set<string | undefined>()
    const list = Array.isArray(rawList) ? rawList : []
    return list
        .map((raw): Record<string, unknown> => {
            const item = raw as { key?: string; value?: Record<string, unknown> }
            const value = item.value ?? {}
            return {
                ...value,
                _key: item.key,
                _order: (value.order as number | undefined) ?? 0,
                _sessionTimestamp: (value.sessionTimestamp as number | undefined) ?? 0
            }
        })
        .sort((a, b) => ((b._sessionTimestamp as number) - (a._sessionTimestamp as number)) || ((a._order as number) - (b._order as number)))
        .filter(item => {
            const dedupeKey = (item.url as string | undefined) || (item._key as string | undefined)
            if (seenVideos.has(dedupeKey)) return false
            seenVideos.add(dedupeKey)
            return true
        })
}
