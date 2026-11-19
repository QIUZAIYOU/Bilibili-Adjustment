/**
 * 首页视频区功能入口：按配置在「只过滤广告」与「接管重排」之间二选一
 *
 * 默认关闭；关闭时这里不注册任何监听、不发任何请求。
 */
import { ConfigService } from '@/services/config.service'
import { elementSelectors } from '@/shared/element-selectors'
import { LoggerService } from '@/services/logger.service'
import { storageService } from '@/services/storage.service'
import { retryQueue } from '@/utils/retry-queue'
import { clampMaxPages, parseBlockedUids } from './pure'
import type { HomeFeedItem } from './pure'
import { createAdFilter } from './filter'
import type { AdFilterHandle } from './filter'
import { createRedesign } from './redesign'
import type { RedesignHandle } from './redesign'
const logger = new LoggerService('HomeFeed', { notify: false })
/** 用户可见的屏蔽反馈（走通知条） */
const userLogger = new LoggerService('HomeFeed')
export interface HomeFeedContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    _homeFeedHandle?: AdFilterHandle | RedesignHandle | null
    initHomeFeed: () => Promise<void>
    destroyHomeFeed: () => void
}
/** 记录被屏蔽 UP 的名字（只用于提示与后续管理面板；主键仍是 UID） */
const rememberBlockedName = async (item: HomeFeedItem): Promise<void> => {
    try {
        await storageService.set('index', `blocked-up:${item.owner.mid}`, {
            uid: item.owner.mid,
            name: item.owner.name,
            ts: Date.now()
        })
    } catch { /* 名字只是辅助信息，失败不影响屏蔽 */ }
}
export const homeFeedFeatures = {
    async initHomeFeed (this: HomeFeedContext): Promise<void> {
        this.destroyHomeFeed()
        const configs = this.userConfigs || {}
        if (!configs.home_feed_enabled) return
        const blocked = new Set(parseBlockedUids(configs.home_feed_blocked_uids))
        if (configs.home_feed_mode !== 'redesign') {
            this._homeFeedHandle = createAdFilter(blocked)
            return
        }
        const waitForAnchor = async (): Promise<void> => {
            if (!elementSelectors.get('homeFeedNativeParent') || !elementSelectors.get('homeFeedNativeContainer')) {
                logger.warn('首页视频区丨推荐流容器尚未就绪，已加入重试队列')
                retryQueue.register('homeFeedMount', async () => {
                    if (!elementSelectors.get('homeFeedNativeParent')) throw new Error('推荐流容器仍未就绪')
                    await this.initHomeFeed()
                })
                return
            }
            this._homeFeedHandle = createRedesign({
                layout: configs.home_feed_layout === 'stream' ? 'stream' : 'rails',
                maxPages: clampMaxPages(configs.home_feed_max_pages),
                blocked,
                onBlock: (item: HomeFeedItem): void => {
                    const current = parseBlockedUids(this.userConfigs.home_feed_blocked_uids)
                    if (!current.includes(item.owner.mid)) {
                        const next = [...current, item.owner.mid].join(',')
                        this.userConfigs.home_feed_blocked_uids = next
                        void ConfigService.setValue('home_feed_blocked_uids', next)
                    }
                    void rememberBlockedName(item)
                    userLogger.warn(`已屏蔽 UP：${item.owner.name}（可在设置里移除）`)
                }
            })
        }
        await waitForAnchor()
    },
    destroyHomeFeed (this: HomeFeedContext): void {
        this._homeFeedHandle?.stop()
        this._homeFeedHandle = null
        document.getElementById('HomeFeedStyle')?.remove()
    }
}
