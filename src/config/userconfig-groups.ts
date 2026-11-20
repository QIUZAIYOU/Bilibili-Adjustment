/**
 * ScriptCat 用户配置的分组归并
 *
 * 为什么需要：ScriptCat 的用户配置弹窗把分组渲染成横向 tab，**tab 栏没有滚动/换行**，
 * 弹窗最大宽度只有 sm:max-w-md（约 448px）。项目原生有 11 个分组，直接输出的话
 * 用户只能看到前 4 个 tab，后面的分组等于不可达（2026-11-20 实测截图确认）。
 *
 * 因此把 11 个原生分组归并成 4 个短名字组，确保 tab 能完整放下；设置项本身不丢，
 * 只在某个组内按原 schema 顺序排列。生成器与运行时桥都用这张表，保持键一致。
 */
export const USERCONFIG_GROUP_ORDER = ['基础设置', '播放与评论', 'AI 识别', '更新与日志']
/** section.id → 归并后的组名 */
export const USERCONFIG_GROUP_MAP: Record<string, string> = {
    account_section: '基础设置',
    player_section: '基础设置',
    locate_section: '基础设置',
    dynamic_section: '基础设置',
    quality_section: '播放与评论',
    comment_section: '播放与评论',
    up_blocklist_section: '播放与评论',
    ai_section: '播放与评论',
    ai_identify_section: 'AI 识别',
    update_section: '更新与日志',
    log_section: '更新与日志'
}
/** 取归并组名；未登记的新分组回落到原标题，保证不会凭空消失 */
export const resolveUserConfigGroup = (sectionId: string, fallback: string): string =>
    USERCONFIG_GROUP_MAP[sectionId] || fallback
