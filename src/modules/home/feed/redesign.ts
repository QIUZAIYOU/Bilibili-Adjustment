/**
 * redesign 模式：接管首页主推荐流
 *
 * 生命周期：插入自绘骨架 → 隐藏官方容器 → 拉第一页并渲染 → 滚动加载 → 失败回退。
 * 官方容器只改 style.display，其余一概不碰；任何一步失败都能原样恢复。
 */
import { elementSelectors } from '@/shared/element-selectors'
import { LoggerService } from '@/services/logger.service'
import { insertStyleToDocument } from '@/utils/common'
import { homeFeedStyles } from '@/shared/styles/home-feed'
import { fetchFeedPage, resolveCategories } from './api'
import { dedupeFeedItems, filterBlockedItems, groupByCategory, isRiskControlCode } from './pure'
import type { HomeFeedItem } from './pure'
import { createFeedShell, hideNotice, renderEmpty, renderFeedView, renderNotice, renderSkeleton } from './render'
const logger = new LoggerService('HomeFeed', { notify: false })
/** 回退是需要用户知情的事件（首屏空白/功能失效），走通知条 */
const toastLogger = new LoggerService('HomeFeed')
export interface RedesignOptions {
    layout: 'rails' | 'stream'
    maxPages: number
    blocked: Set<string>
    onBlock: (item: HomeFeedItem) => void
}
export interface RedesignHandle {
    stop: () => void
}
/** 首页视频区接管实例 */
export const createRedesign = (options: RedesignOptions): RedesignHandle => {
    const shell = createFeedShell()
    let native: Element | null = null
    let nativeDisplay = ''
    let parent: Element | null = null
    let items: HomeFeedItem[] = []
    const seen = new Set<string>()
    let freshIdx = 1 + Math.floor(Math.random() * 10)
    let pagesLoaded = 0
    let loading = false
    let pagingStopped = false
    let destroyed = false
    let live = false
    let remounts = 0
    let io: IntersectionObserver | null = null
    let guard: MutationObserver | null = null
    let clickBound: ((event: Event) => void) | null = null
    const updateStatus = (text?: string): void => {
        shell.status.textContent = text ?? `已加载 ${items.length} 条${loading ? ' · 加载中…' : ''}`
    }
    const render = (): void => {
        if (!items.length) {
            renderEmpty(shell.body, '这个时间没有可显示的视频，点「换一批」再试')
        } else if (options.layout === 'rails') {
            renderFeedView(shell.body, { layout: 'rails', ...groupByCategory(items) })
        } else {
            renderFeedView(shell.body, { layout: 'stream', rails: [], rest: items })
        }
        updateStatus()
    }
    const destroy = (restore: boolean, message?: string): void => {
        if (destroyed) return
        destroyed = true
        io?.disconnect()
        guard?.disconnect()
        io = null
        guard = null
        if (clickBound) shell.root.removeEventListener('click', clickBound)
        clickBound = null
        shell.root.remove()
        if (restore && native) {
            (native as HTMLElement).style.display = nativeDisplay
        }
        if (message) toastLogger.warn(message)
    }
    const stop = (): void => {
        if (!live) {
            destroy(true)
            return
        }
        destroy(true)
        logger.info('首页视频区丨已恢复官方推荐流')
    }
    const fallback = (reason: string, message: string): void => {
        logger.warn(`首页视频区丨${reason}，回退官方推荐流`)
        destroy(true, message)
    }
    const loadPage = async (initial = false): Promise<void> => {
        if (destroyed || loading) return
        if (!initial && pagesLoaded >= options.maxPages) {
            pagingStopped = true
            updateStatus(`已到上限（${options.maxPages} 页）`)
            return
        }
        loading = true
        updateStatus('加载中…')
        try {
            let page = await fetchFeedPage(freshIdx)
            freshIdx += 1
            // 首屏一页只有 20 多条时分到每个区只剩 2 张，泳道会显得空；多拉几页再一次性渲染，
            // 代价是首屏多等约 0.8 秒，换来更像「分区组合」而不是「几条零散卡片」。
            let extraPages = 0
            const initialTarget = 3
            while (initial && extraPages + 1 < initialTarget && page.length < 90 && pagesLoaded + extraPages + 1 < options.maxPages) {
                try {
                    const next = await fetchFeedPage(freshIdx)
                    freshIdx += 1
                    page = page.concat(next)
                    extraPages += 1
                } catch (error) {
                    logger.debug('首页视频区丨首屏补拉后续页失败', error)
                    break
                }
            }
            const fresh = filterBlockedItems(dedupeFeedItems(seen, page), options.blocked)
            if (fresh.length) {
                const categories = await resolveCategories(fresh)
                for (const item of fresh) item.category = categories.get(item.bvid) || '其他'
                items = items.concat(fresh)
            }
            pagesLoaded += 1 + extraPages
            render()
            hideNotice(shell.notice)
            live = true
            updateStatus()
        } catch (error) {
            const code = (error as { code?: number }).code
            if (initial) {
                fallback('首屏加载失败', '首页视频区加载失败，已回退官方推荐流')
                return
            }
            if (isRiskControlCode(code)) {
                pagingStopped = true
                renderNotice(shell.notice, '请求太频繁，已暂停加载；稍后点这里重试', { retry: () => { pagingStopped = false; void loadPage() } })
            } else {
                renderNotice(shell.notice, '这一页没加载出来，点这里重试', { retry: () => void loadPage() })
            }
            logger.debug('首页视频区丨加载分页失败', error)
        } finally {
            loading = false
            if (!destroyed) updateStatus()
        }
    }
    const refresh = (): void => {
        if (destroyed || loading) return
        items = []
        seen.clear()
        pagesLoaded = 0
        pagingStopped = false
        freshIdx = 1 + Math.floor(Math.random() * 20)
        renderSkeleton(shell.body)
        updateStatus('加载中…')
        void loadPage(true)
    }
    const mount = async (): Promise<void> => {
        parent = elementSelectors.get('homeFeedNativeParent')
        native = elementSelectors.get('homeFeedNativeContainer')
        if (!parent || !native) throw new Error('首页推荐流容器尚未就绪')
        insertStyleToDocument({ HomeFeedStyle: homeFeedStyles.redesign })
        parent.insertBefore(shell.root, native)
        nativeDisplay = (native as HTMLElement).style.display
        ;(native as HTMLElement).style.display = 'none'
        renderSkeleton(shell.body)
        updateStatus('加载中…')
        clickBound = (event: Event): void => {
            const target = event.target as Element | null
            const block = target?.closest('[data-action="block"]')
            if (!block) return
            event.preventDefault()
            event.stopPropagation()
            const card = block.closest('.adj-hf-card') as HTMLElement | null
            const bvid = card?.dataset.bvid
            if (!bvid) return
            const item = items.find(entry => entry.bvid === bvid)
            card?.remove()
            if (!item) return
            items = items.filter(entry => entry.bvid !== bvid)
            options.onBlock(item)
            updateStatus()
        }
        shell.root.addEventListener('click', clickBound)
        shell.refreshButton.addEventListener('click', refresh)
        if (typeof IntersectionObserver === 'function') {
            io = new IntersectionObserver(entries => {
                if (destroyed || pagingStopped || loading) return
                if (entries.some(entry => entry.isIntersecting)) void loadPage()
            }, { rootMargin: '600px 0px' })
            io.observe(shell.sentinel)
        }
        guard = new MutationObserver(() => {
            if (destroyed || !parent || !native) return
            if (shell.root.isConnected) return
            if (remounts >= 3) {
                fallback('自绘视频区被页面移除', '首页视频区被页面重建，已回退官方推荐流')
                return
            }
            remounts += 1
            parent.insertBefore(shell.root, native)
            logger.debug('首页视频区丨页面重渲染后已重新插入', `第 ${remounts} 次`)
        })
        guard.observe(parent, { childList: true })
        await loadPage(true)
    }
    void mount().catch((error: unknown) => {
        logger.warn('首页视频区丨挂载失败', error)
        destroy(true)
    })
    return { stop }
}
