/**
 * 纯文本工具（零依赖 → 叶子模块）
 *
 * 为什么单独成文件：`shared/regexps.ts` 需要下面这两个纯函数，而 regexps 又被页型判定
 * （utils/page-type.ts）等模块引用。如果它们留在 `utils/common.ts`，依赖方向会绕成
 * common → regexps → common 的环；拆成叶子模块后依赖是单向的：
 * common → page-type → regexps → text。
 */
/** 把 MM:SS / HH:MM:SS 时间串转成秒数；格式不对返回 0 */
export const getTotalSecondsFromTimeString = (timeString?: string | null): number => {
    if (!timeString) return 0
    const parts = timeString.split(':')
    if (parts.length === 1) {
        return parseInt(parts[0], 10)
    } else if (parts.length === 2) {
        const [minutes, seconds] = parts.map(Number)
        return minutes * 60 + seconds
    } else if (parts.length === 3) {
        const [hours, minutes, seconds] = parts.map(Number)
        return hours * 3600 + minutes * 60 + seconds
    }
    return 0
}
/**
 * 生成 @用户 的展示 HTML：desc_v2 里带 biz_id 时链到 UP 主空间，否则只回显文本。
 * desc_v2 的 raw_text 自带 @ 前缀（如 '@量子位'），且旧接口可能不下发 desc_v2。
 */
export const generateMentionUserLinks = (username: string, desc_v2?: Array<{ raw_text?: string; biz_id?: string | number }>): string => {
    const matchedItem = desc_v2?.find(item => item.raw_text === `@${username}`)
    return matchedItem
        ? `<a target="_blank" href="//space.bilibili.com/${matchedItem.biz_id}" class="mention-user" data-v-8ced1e78="">@${username} </a>`
        : `@${username}`
}
