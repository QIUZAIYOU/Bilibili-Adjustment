import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { styles } from '@/shared/styles'
import { biliApis } from '@/shared/bili-apis'
import { STORAGE_KEYS } from '@/shared/constants'
import { getTemplates } from '@/shared/templates'
import { renderButton } from '@/shared/templates/buttons'
import { sleep, createElementAndInsert, addEventListenerToElement, insertStyleToDocument, documentScrollTo, getElementOffsetToDocument } from '@/utils/common'
const logger = new LoggerService('VideoModule')
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface UiButtonsContext {
    userConfigs: Record<string, unknown>
    settingsComponent: { openSettings: () => Promise<void> }
    _cachedMid?: string | number
    locateToPlayer: () => Promise<void>
    /** 选集切换后的定位（等切换+布局稳定后一次性直达，见 player-mode） */
    locateToPlayerAfterEpisodeSwitch: () => Promise<void>
    locateButtonClick: () => Promise<void>
    openUpSpace: (mid: string | number) => Promise<void> | void
    showSkipSegmentManager: (id: string) => Promise<void>
}
export const uiButtonsFeatures = {
    /**
     * 定位按钮点击：新页面迷你播放器按钮隐藏不可用，开启小窗会触发 B站 滚动推荐列表并搅动布局，
     * 干扰定位执行；仅旧页面（按钮可见）保留"临时开窗定位后再关闭"逻辑
     */
    async locateButtonClick (this: UiButtonsContext): Promise<void> {
        const miniOpenBtn = elementSelectors.get('miniPlayerOpen') as HTMLElement | null
        const miniCloseBtn = elementSelectors.get('miniPlayerClose')
        // 时序用 Promise 链表达（而非连续 await）：TS 6.0.3 在本文件里会把「await 相邻行」误判为不可调用
        const wait = (ms: number): Promise<void> => sleep(ms)
        const locate = (): Promise<void> => this.locateToPlayer()
        if (!miniOpenBtn || miniCloseBtn || getComputedStyle(miniOpenBtn).display === 'none') {
            return wait(100).then(locate)
        }
        // 小窗关闭时临时开启，定位后再关闭
        miniOpenBtn.click()
        return wait(50)
            .then(locate)
            .then(() => wait(50))
            // 使用固定选择器关闭小窗（不依赖 B 站的 title 状态切换）
            .then(() => {
                const closeBtn = elementSelectors.get('miniPlayer') as HTMLElement | null
                closeBtn?.click()
            })
    },
    async insertSideFloatNavToolsButtons (this: UiButtonsContext): Promise<void> {
        const floatNav = this.userConfigs.page_type === 'video' ? elementSelectors.get('videoFloatNav') : elementSelectors.get('bangumiFloatNav')
        if (!floatNav) {
            logger.warn('侧边栏工具丨未找到浮动导航栏，跳过插入')
            return
        }
        const dataV = this.userConfigs.page_type === 'video' ? floatNav.lastElementChild?.attributes?.[1]?.name || '' : ''
        // 检查是否已经存在定位按钮和设置按钮
        const existingLocateButton = floatNav.querySelector('.bili-adjustment-icon.locate')
        const existingSettingsButton = floatNav.querySelector('.bili-adjustment-icon.settings')
        const existingUpButton = floatNav.querySelector('.bili-adjustment-icon.up')
        const existingSkipButton = floatNav.querySelector('.bili-adjustment-icon.skip')
        if (existingLocateButton && existingSettingsButton && existingUpButton && existingSkipButton) {
            logger.debug('侧边栏工具丨已存在，跳过插入')
            return
        }
        let locateButton, videoSettingsOpenButton, upButton
        if (this.userConfigs.page_type === 'video') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(renderButton('locateButton', {
                    class: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    style: '',
                    dataV: dataV,
                    text: '定位'
                }), floatNav.lastElementChild as Node, 'prepend')
                addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(renderButton('videoSettingsOpenButton', {
                    dataV: dataV,
                    floatNavMenuItemClass: '',
                    text: '设置'
                }), floatNav.lastElementChild as Node, 'prepend')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            if (!existingUpButton && this.userConfigs.page_type === 'video') {
                upButton = createElementAndInsert(renderButton('upButton', {
                    style: '',
                    dataV: dataV,
                    text: ''
                }), floatNav.lastElementChild as Node, 'prepend')
                addEventListenerToElement(upButton, 'click', async () => {
                    const mid = this._cachedMid || (() => {
                        try {
                            const info = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.SESSION_VIDEO_INFO) || '{}')
                            return info.owner?.mid
                        } catch { /* 忽略解析失败 */ }
                    })()
                    if (mid) this.openUpSpace(mid)
                })
                // 异步获取 mid 缓存
                biliApis.getVideoInformation('video', biliApis.getCurrentVideoID()).then(info => {
                    const detail = info as { owner?: { mid?: string | number }} | null | undefined
                    if (detail?.owner?.mid) this._cachedMid = detail.owner.mid
                }).catch(() => {})
            }
            // 插入跳过片段管理按钮（与开关解耦：用于维护手动/共享片段数据，随时可用）
            if (!existingSkipButton) {
                const skipButton = createElementAndInsert(renderButton('skipSegmentManagerButton', {
                    style: '',
                    dataV: dataV,
                    text: '片段'
                }), floatNav.lastElementChild as Node, 'prepend')
                addEventListenerToElement(skipButton, 'click', async () => {
                    const bvid = biliApis.getCurrentVideoID(window.location.href)
                    if (bvid && bvid !== 'error') {
                        await this.showSkipSegmentManager(bvid)
                    }
                })
            }
        }
        if (this.userConfigs.page_type === 'bangumi') {
            if (!existingLocateButton) { locateButton = createElementAndInsert(renderButton('locateButton', {
                class: 'bili-adjustment-icon locate',
                style: `style="${styles.videoSettingsOpenButton}"`,
                dataV: dataV,
                text: '定位'
            }), floatNav, 'append')
            addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(renderButton('videoSettingsOpenButton', {
                    floatNavMenuItemClass: '',
                    style: `style="${styles.videoSettingsOpenButton}"`,
                    dataV: '',
                    text: '设置'
                }), floatNav, 'append')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            // 插入跳过片段管理按钮（番剧页用于配置片头片尾跳过）
            if (!existingSkipButton) {
                const skipButton = createElementAndInsert(renderButton('skipSegmentManagerButton', {
                    style: `style="${styles.videoSettingsOpenButton}"`,
                    dataV: '',
                    text: '片段'
                }), floatNav, 'append')
                addEventListenerToElement(skipButton, 'click', async () => {
                    const epId = biliApis.getCurrentVideoID(window.location.href)
                    if (epId && epId !== 'error') {
                        await this.showSkipSegmentManager(epId)
                    }
                })
            }
        }
        logger.debug('侧边栏工具丨插入成功')
    },
    async unlockEpisodeSelector (this: UiButtonsContext): Promise<void> {
        const videoInfo = await biliApis.getVideoInformation(String(this.userConfigs.page_type), biliApis.getCurrentVideoID(window.location.href))
        if (!videoInfo) return
        const { pages = false, ugc_season = false, episodes = false } = videoInfo as { pages?: unknown; ugc_season?: unknown; episodes?: unknown }
        if (pages || ugc_season || episodes) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': styles.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    // 不能在这里立刻定位：此刻 B 站还没完成切换、布局是中间态，
                    // 立刻滚动会先滚到错位置再被纠正（来回滚一次）。交给它等切换+布局稳定后一次直达。
                    await this.locateToPlayerAfterEpisodeSwitch()
                })
            })
        }
    },
    async insertLocateToCommentButton (this: UiButtonsContext): Promise<void> {
        if (!this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        // 防止重复添加
        if (document.getElementById('goToComments')) return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        if (!playerControllerBottomRight || !videoComment) return
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo((await getElementOffsetToDocument(videoComment as HTMLElement)).top - 10)
        })
        // 插入前往UP主空间按钮
        const mid = this._cachedMid
        if (mid) {
            const upHtml = getTemplates.upSpaceButton
            const upBtn = createElementAndInsert(upHtml, playerControllerBottomRight)
            addEventListenerToElement(upBtn, 'click', e => {
                e.stopPropagation()
                this.openUpSpace(mid)
            })
        }
    }
}
