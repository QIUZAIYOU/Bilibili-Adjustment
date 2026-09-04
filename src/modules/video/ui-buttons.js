import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { stylesV2 } from '@/shared/styles'
import { biliApis } from '@/shared/bili-apis'
import { STORAGE_KEYS } from '@/shared/constants'
import { getTemplates } from '@/shared/templates'
import { sleep, createElementAndInsert, addEventListenerToElement, insertStyleToDocument, documentScrollTo, getElementOffsetToDocument } from '@/utils/common'
const logger = new LoggerService('VideoModule')
export const uiButtonsFeatures = {
    /**
     * 定位按钮点击：新页面迷你播放器按钮隐藏不可用，开启小窗会触发 B站 滚动推荐列表并搅动布局，
     * 干扰定位执行；仅旧页面（按钮可见）保留"临时开窗定位后再关闭"逻辑
     */
    async locateButtonClick () {
        const miniOpenBtn = document.querySelector('.mini-player-window[title="点击打开迷你播放器"]')
        const miniCloseBtn = document.querySelector('.mini-player-window[title="点击关闭迷你播放器"]')
        if (!miniOpenBtn || miniCloseBtn || getComputedStyle(miniOpenBtn).display === 'none') {
            await sleep(100)
            await this.locateToPlayer()
            return
        }
        // 小窗关闭时临时开启，定位后再关闭
        miniOpenBtn.click()
        await sleep(50)
        await this.locateToPlayer()
        await sleep(50)
        // 使用固定选择器关闭小窗（不依赖 B 站的 title 状态切换）
        document.querySelector('#mirror-vdcon .mini-player-window.fixed-sidenav-storage-item')?.click()
    },
    async insertSideFloatNavToolsButtons () {
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
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'fixed-sidenav-storage-item bili-adjustment-icon locate',
                    style: '',
                    dataV: dataV,
                    text: '定位'
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', {
                    dataV: dataV,
                    floatNavMenuItemClass: '',
                    text: '设置'
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            if (!existingUpButton && this.userConfigs.page_type === 'video') {
                upButton = createElementAndInsert(getTemplates.replace('upButton', {
                    style: '',
                    dataV: dataV,
                    text: ''
                }), floatNav.lastElementChild, 'prepend')
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
                    if (info?.owner?.mid) this._cachedMid = info.owner.mid
                }).catch(() => {})
            }
            // 插入跳过片段管理按钮
            if (!existingSkipButton && this.userConfigs.auto_skip) {
                const skipButton = createElementAndInsert(getTemplates.replace('skipSegmentManagerButton', {
                    style: '',
                    dataV: dataV,
                    text: ''
                }), floatNav.lastElementChild, 'prepend')
                addEventListenerToElement(skipButton, 'click', async () => {
                    const bvid = biliApis.getCurrentVideoID(window.location.href)
                    if (bvid && bvid !== 'error') {
                        await this.showSkipSegmentManager(bvid)
                    }
                })
            }
        }
        if (this.userConfigs.page_type === 'bangumi') {
            if (!existingLocateButton) {
                locateButton = createElementAndInsert(getTemplates.replace('locateButton', {
                    class: 'bili-adjustment-icon locate',
                    style: `style="height:40px;padding:0;${stylesV2.videoSettingsOpenButton}"`,
                    dataV: dataV,
                    text: ''
                }), floatNav, 'append')
                addEventListenerToElement(locateButton, 'click', () => this.locateButtonClick())
            }
            if (!existingSettingsButton) {
                videoSettingsOpenButton = createElementAndInsert(getTemplates.replace('videoSettingsOpenButton', {
                    floatNavMenuItemClass: '',
                    style: `style="${stylesV2.videoSettingsOpenButton}"`,
                    dataV: '',
                    text: ''
                }), floatNav, 'append')
                addEventListenerToElement(videoSettingsOpenButton, 'click', async () => {
                    await this.settingsComponent.openSettings()
                })
            }
            // 插入跳过片段管理按钮（番剧页用于配置片头片尾跳过）
            if (!existingSkipButton) {
                const skipButton = createElementAndInsert(getTemplates.replace('skipSegmentManagerButton', {
                    style: `style="height:40px;padding:0;${stylesV2.videoSettingsOpenButton}"`,
                    dataV: '',
                    text: ''
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
    async unlockEpisodeSelector () {
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, biliApis.getCurrentVideoID(window.location.href))
        if (!videoInfo) return
        const { pages = false, ugc_season = false, episodes = false } = videoInfo
        if (pages || ugc_season || episodes) {
            insertStyleToDocument({ 'UnlockEpisodeSelectorStyle': stylesV2.UnlockEpisodeSelector })
            elementSelectors.each('videoEpisodeListMultiMenuItem', link => {
                addEventListenerToElement(link, 'click', async () => {
                    await this.locateToPlayer()
                })
            })
        }
    },
    async insertLocateToCommentButton (){
        if (!this.userConfigs.webfull_unlock || this.userConfigs.page_type === 'bangumi' || this.userConfigs.selected_player_mode !== 'web') return
        // 防止重复添加
        if (document.getElementById('goToComments')) return
        const batchSelectors = ['playerControllerBottomRight', 'videoComment']
        const [playerControllerBottomRight, videoComment] = await elementSelectors.batch(batchSelectors)
        if (!playerControllerBottomRight || !videoComment) return
        const locateToCommentButton = createElementAndInsert(getTemplates.locateToCommentBtn, playerControllerBottomRight)
        addEventListenerToElement(locateToCommentButton, 'click', async event => {
            event.stopPropagation()
            documentScrollTo(await getElementOffsetToDocument(videoComment).top - 10)
        })
        // 插入前往UP主空间按钮
        const mid = this._cachedMid
        if (mid) {
            const upHtml = '<div class="bpx-player-ctrl-btn bpx-player-ctrl-comment" role="button" aria-label="前往UP主空间" tabindex="0" bilibili-adjustment-element><div id="goToUpSpace" class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg data-v-c8e76e74="" data-v-45380d2b="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 18" width="24" height="24"><path d="M4.612500000000001 6.186037499999999C4.92315 6.186037499999999 5.175000000000001 6.437872500000001 5.175000000000001 6.748537499999999L5.175000000000001 9.580575C5.175000000000001 10.191075000000001 5.66991 10.686 6.280425000000001 10.686C6.8909325 10.686 7.38585 10.191075000000001 7.38585 9.580575L7.38585 6.748537499999999C7.38585 6.437872500000001 7.637700000000001 6.186037499999999 7.94835 6.186037499999999C8.259 6.186037499999999 8.51085 6.437872500000001 8.51085 6.748537499999999L8.51085 9.580575C8.51085 10.8124125 7.512262499999999 11.811 6.280425000000001 11.811C5.048595000000001 11.811 4.050000000000001 10.8124125 4.050000000000001 9.580575L4.050000000000001 6.748537499999999C4.050000000000001 6.437872500000001 4.3018350000000005 6.186037499999999 4.612500000000001 6.186037499999999z" fill="#fff"></path><path d="M9.48915 6.748537499999999C9.48915 6.437872500000001 9.7409625 6.186037499999999 10.05165 6.186037499999999L11.79375 6.186037499999999C12.984637500000002 6.186037499999999 13.950000000000001 7.151415 13.950000000000001 8.34225C13.950000000000001 9.5331375 12.984637500000002 10.4985 11.79375 10.4985L10.61415 10.4985L10.61415 11.2485C10.61415 11.55915 10.3623 11.811 10.05165 11.811C9.7409625 11.811 9.48915 11.55915 9.48915 11.2485L9.48915 6.748537499999999zM10.61415 9.3735L11.79375 9.3735C12.3633 9.3735 12.825000000000001 8.9118 12.825000000000001 8.34225C12.825000000000001 7.7727375 12.3633 7.31103 11.79375 7.31103L10.61415 7.31103L10.61415 9.3735z" fill="#fff"></path><path d="M9 3.7485375000000003C7.111335 3.7485375000000003 5.46225 3.84462 4.2981675 3.939015C3.4891575 4.0046175 2.8620825 4.6226400000000005 2.79 5.424405C2.7045525 6.37485 2.625 7.6282499999999995 2.625 8.9985C2.625 10.368825000000001 2.7045525 11.622225 2.79 12.5726625C2.8620825 13.374412500000002 3.4891575 13.992450000000002 4.2981675 14.058074999999999C5.46225 14.152425000000001 7.111335 14.2485 9 14.2485C10.888874999999999 14.2485 12.538050000000002 14.152425000000001 13.702200000000001 14.058037500000001C14.511074999999998 13.9924125 15.138000000000002 13.3746 15.210075 12.573037500000002C15.295499999999999 11.622975 15.375 10.3698375 15.375 8.9985C15.375 7.627237500000001 15.295499999999999 6.3740775 15.210075 5.4240375C15.138000000000002 4.622475 14.511074999999998 4.00464 13.702200000000001 3.9390374999999995C12.538050000000002 3.844635 10.888874999999999 3.7485375000000003 9 3.7485375000000003zM4.2072375 2.8176975C5.39424 2.7214425 7.074434999999999 2.6235375000000003 9 2.6235375000000003C10.925775 2.6235375000000003 12.606075 2.7214575 13.793099999999999 2.81772C15.141074999999999 2.92704 16.208849999999998 3.9695849999999995 16.330575 5.323297500000001C16.418174999999998 6.297675 16.5 7.585537500000001 16.5 8.9985C16.5 10.4115375 16.418174999999998 11.6994 16.330575 12.6738C16.208849999999998 14.027474999999999 15.141074999999999 15.0700125 13.793099999999999 15.1793625C12.606075 15.275625 10.925775 15.3735 9 15.3735C7.074434999999999 15.3735 5.39424 15.275625 4.2072375 15.179400000000001C2.859045 15.070049999999998 1.7912325 14.027212500000001 1.6695225000000002 12.673425C1.5818849999999998 11.69865 1.5 10.4106 1.5 8.9985C1.5 7.586475 1.5818849999999998 6.2984025 1.6695225000000002 5.3236725C1.7912325 3.96984 2.859045 2.9270175000000003 4.2072375 2.8176975z" fill="#fff"></path></svg></span></div></div>'
            const upBtn = createElementAndInsert(upHtml, playerControllerBottomRight)
            addEventListenerToElement(upBtn, 'click', e => {
                e.stopPropagation()
                this.openUpSpace(mid)
            })
        }
    }
}
