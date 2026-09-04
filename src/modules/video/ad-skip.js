import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { aiService, initializeAIService } from '@/services/ai.service'
import { storageService } from '@/services/storage.service'
import { createElementAndInsert, addEventListenerToElement, showPlayerTooltip, hidePlayerTooltip, popoverManager, enablePopoverLightDismiss } from '@/utils/common'
import { getTemplates } from '@/shared/templates'
const logger = new LoggerService('VideoModule')
const SKIP_CACHE_API = 'https://www.asifadeaway.com/UserScripts/bilibili/api/ad-cache.php'

/**
 * 创建标准缓存数据结构
 */
const createCacheEntry = (bvid, segments, uid = null) => ({
    bvid,
    segments: segments || [],
    uploader_uid: uid,
    verified_by: uid ? [uid] : [],
    version: 1,
    last_updated: Date.now(),
    locked: false
})

/**
 * 获取当前用户 UID（从 B 站 cookie 解析）
 */
const getCurrentUid = () => {
    try {
        const match = document.cookie.match(/DedeUserID=(\d+)/)
        return match ? parseInt(match[1]) : null
    } catch {
        return null
    }
}

/**
 * 校验新片段是否与已有片段冲突
 * @returns {string|null} 冲突原因，无冲突返回 null
 */
const validateSegment = (newSeg, existingSegments) => {
    for (const seg of existingSegments) {
        if (newSeg.start === seg.start && newSeg.end === seg.end) {
            return '与已有片段完全重叠'
        }
        if (newSeg.start >= seg.start && newSeg.end <= seg.end) {
            return '已包含在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
        if (newSeg.start <= seg.start && newSeg.end >= seg.end) {
            return '已包含已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end)
        }
        if (newSeg.start > seg.start && newSeg.start < seg.end) {
            return '开始时间落在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
        if (newSeg.end > seg.start && newSeg.end < seg.end) {
            return '结束时间落在已有片段 ' + formatTime(seg.start) + '-' + formatTime(seg.end) + ' 内'
        }
    }
    return null
}

/**
 * 合并重叠或相邻的片段
 */
const mergeSegments = (segments) => {
    if (segments.length <= 1) return segments
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const merged = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1]
        const curr = sorted[i]
        if (curr.start <= last.end) {
            last.end = Math.max(last.end, curr.end)
        } else {
            merged.push(curr)
        }
    }
    return merged
}

/**
 * 判断是否有权限更新缓存
 */
const canUpdateCache = (cached, currentUid) => {
    if (!cached) return true
    if (cached.locked) return false
    if (!currentUid) return true
    if (cached.uploader_uid === currentUid) return true
    return false
}

/**
 * 格式化时间为 HH:MM:SS
 */
const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return min + ':' + (sec < 10 ? '0' : '') + sec
}

/**
 * 解析时间字符串为秒数
 */
const parseTime = (str) => {
    const parts = str.split(':').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1]
    }
    if (parts.length === 1 && !isNaN(parts[0])) {
        return parts[0]
    }
    return null
}

/**
 * 解析跳过时长字符串为秒数（支持 "30s", "1m30s", "90" 等格式）
 */
const parseDuration = (str) => {
    str = str.trim().toLowerCase()
    // 支持 "30s" 格式
    if (str.endsWith('s')) {
        const num = parseFloat(str.slice(0, -1))
        return isNaN(num) ? null : num
    }
    // 支持 "1m30s" 格式
    const match = str.match(/^(\d+)m(\d+)s?$/)
    if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2])
    }
    // 纯数字
    const num = parseFloat(str)
    return isNaN(num) ? null : num
}

export const adSkipFeatures = {
    async identifyAdvertisementTimestamps () {
        if (!this.userConfigs.auto_skip) {
            logger.info('自动跳过广告丨功能已关闭')
            return
        }
        if (this.advertisementIdentified) {
            logger.debug('自动跳过广告丨已执行过，跳过重复执行')
            return
        }
        this.advertisementIdentified = true
        setTimeout(() => {
            this.advertisementIdentified = false
        }, 30000)
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        if (!bvid || bvid === 'error') return
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached) {
                logger.info('自动跳过广告丨命中本地缓存')
                const segments = cached.segments || cached
                this.autoSkipAdvertisementSegments(segments)
                return segments
            }
        } catch (error) {
            logger.debug('自动跳过广告丨本地缓存读取失败', error)
        }
        try {
            const resp = await fetch(`${SKIP_CACHE_API}?bvid=${bvid}`)
            if (resp.ok) {
                const result = await resp.json()
                if (result.ok && result.data) {
                    const segments = result.data.segments || []
                    logger.info('自动跳过广告丨命中远程缓存')
                    try {
                        await storageService.adCacheSet(bvid, result.data)
                    } catch (_) {}
                    this.autoSkipAdvertisementSegments(segments)
                    return segments
                }
            }
        } catch (error) {
            logger.debug('自动跳过广告丨远程缓存查询失败', error)
        }
        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        if (!videoInfo) return
        const cid = videoInfo.cid
        const up_mid = videoInfo.owner?.mid
        if (!cid || !up_mid) return
        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
        if (!subtitles || subtitles.length === 0) return
        const chineseSubtitle = subtitles.find(s => s.lan === 'ai-zh')
        if (!chineseSubtitle) {
            logger.debug('自动跳过广告丨未找到中文AI字幕')
            return
        }
        const subtitleContent = await biliApis.getSubtitleContent(chineseSubtitle.subtitle_url)
        if (!subtitleContent || subtitleContent.length === 0) {
            logger.debug('自动跳过广告丨字幕内容为空')
            return
        }
        const formattedSubtitles = subtitleContent.map(item => ({
            start: item.from,
            end: item.to,
            text: item.content
        }))
        const subtitlesJsonString = JSON.stringify(formattedSubtitles)
        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            const adSegments = timestamps || []
            if (adSegments.length === 0) {
                logger.info('自动跳过广告丨无广告时间段落，功能已关闭')
            }
            const uid = getCurrentUid()
            const cacheEntry = createCacheEntry(bvid, adSegments, uid)
            try {
                await fetch(SKIP_CACHE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cacheEntry)
                })
                logger.info('自动跳过广告丨识别结果已上传到远程缓存')
            } catch (error) {
                logger.debug('自动跳过广告丨远程缓存上传失败', error)
            }
            try {
                await storageService.adCacheSet(bvid, cacheEntry)
                logger.info('自动跳过广告丨识别结果已缓存到本地')
            } catch (error) {
                logger.debug('自动跳过广告丨本地缓存写入失败', error)
            }
            this.autoSkipAdvertisementSegments(timestamps)
            return timestamps
        } catch (error) {
            logger.error('AI服务初始化或广告识别失败:', error)
            logger.warn('自动跳过广告功能暂时不可用，请检查AI服务配置')
            return []
        }
    },
    async autoSkipAdvertisementSegments (advertisementSegments) {
        if (!advertisementSegments || advertisementSegments.length === 0) return
        const video = elementSelectors.get('video')
        if (!video) return
        const sortedSegments = mergeSegments(advertisementSegments)
        const processedSegments = new Set()
        const handleTimeUpdate = () => {
            const currentTime = Math.floor(video.currentTime)
            for (const segment of sortedSegments) {
                const { start, end } = segment
                const segmentKey = `${start}-${end}`
                if (!processedSegments.has(segmentKey)) {
                    if (currentTime === start) {
                        logger.info(`自动跳过广告丨从 ${start}s 跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                    if (currentTime > start && currentTime < end) {
                        logger.info(`自动跳过广告丨当前在广告时间段 ${start}s-${end}s 内，跳转到 ${end}s`)
                        video.currentTime = end
                        processedSegments.add(segmentKey)
                        break
                    }
                }
            }
            if (processedSegments.size === sortedSegments.length) {
                video.removeEventListener('timeupdate', handleTimeUpdate)
                logger.info('自动跳过广告丨所有广告已处理完成，移除事件监听器')
            }
        }
        this._adVideo = video
        this._adTimeUpdateHandler = handleTimeUpdate
        video.addEventListener('timeupdate', handleTimeUpdate)
        logger.info('自动跳过广告丨已启动，共检测到', sortedSegments.length, '个广告时间段', sortedSegments)
        handleTimeUpdate()
    },

    async showSkipSegmentManager (bvid) {
        const popoverId = 'SkipSegmentManagerPopover'
        const self = this

        // --- 可变状态，由事件处理器共享引用 ---
        if (!this._skipMgrState) {
            this._skipMgrState = {
                currentSegments: [],
                pendingSegments: [],
                cached: null,
                canUpdate: true,
                bvid: null,
                // 番剧页专用状态
                episodes: [],
                currentEpisodeIndex: -1,
                bangumiView: 'accordion', // 'list' | 'accordion'
                inputMode: 'start-end' // 'start-end' | 'start-duration'
            }
        }
        const state = this._skipMgrState

        // --- DOM 元素（首次创建时获取，后续复用） ---
        let popover = document.getElementById(popoverId)
        if (!popover) {
            popover = createElementAndInsert(getTemplates.skipSegmentManagerPopover, document.body, 'append')
            popoverManager.register(popoverId)
            popoverManager.init(popoverId, popover)
            popover.__popoverDismissCleanup = enablePopoverLightDismiss(popover)

            const content = document.getElementById('SkipSegmentManagerContent')
            const updateBtn = document.getElementById('SkipSegmentManagerUpdateBtn')
            const updateAllBtn = document.getElementById('SkipSegmentManagerUpdateAllBtn')
            const reIdentifyBtn = document.getElementById('SkipSegmentManagerReIdentifyBtn')
            const manualEntry = document.getElementById('SkipSegmentManagerManualEntry')
            const manualBtn = document.getElementById('SkipSegmentManagerManualBtn')
            const manualAddBtn = document.getElementById('ManualAddSegmentBtn')
            const manualStartTime = document.getElementById('ManualStartTime')
            const manualEndTime = document.getElementById('ManualEndTime')
            const manualStartTime2 = document.getElementById('ManualStartTime2')
            const manualDuration = document.getElementById('ManualDuration')
            const inputModeBtn = document.getElementById('InputModeBtn')
            const timeInputsStartEnd = document.getElementById('TimeInputsStartEnd')
            const timeInputsStartDuration = document.getElementById('TimeInputsStartDuration')
            const inlineMsg = document.getElementById('SkipSegmentManagerInlineMsg')
            const pendingList = document.getElementById('SkipSegmentManagerPendingList')
            const episodeAccordionEl = document.getElementById('SkipSegmentManagerEpisodeAccordion')

            const showInlineMsg = (msg, duration = 3000) => {
                inlineMsg.textContent = msg
                inlineMsg.className = 'inline-msg warn'
                clearTimeout(inlineMsg._timer)
                inlineMsg._timer = setTimeout(() => {
                    inlineMsg.className = 'inline-msg'
                }, duration)
            }

            // 切换输入模式
            inputModeBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (state.inputMode === 'start-end') {
                    state.inputMode = 'start-duration'
                    inputModeBtn.textContent = '起止时间'
                    timeInputsStartEnd.style.display = 'none'
                    timeInputsStartDuration.style.display = 'flex'
                } else {
                    state.inputMode = 'start-end'
                    inputModeBtn.textContent = '起始+时长'
                    timeInputsStartEnd.style.display = 'flex'
                    timeInputsStartDuration.style.display = 'none'
                }
            })

            const renderPendingList = () => {
                if (state.pendingSegments.length === 0) {
                    pendingList.innerHTML = ''
                } else {
                    let html = ''
                    state.pendingSegments.forEach((seg, i) => {
                        const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                        html += '<div class="pending-item"><span class="segment-time">' + timeStr + '</span><div class="pending-delete" data-index="' + i + '" title="移除">×</div></div>'
                    })
                    pendingList.innerHTML = html
                    pendingList.querySelectorAll('.pending-delete').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const idx = parseInt(e.currentTarget.dataset.index)
                            state.pendingSegments.splice(idx, 1)
                            renderPendingList()
                        })
                    })
                }
                // 有待添加片段或已有片段时显示更新按钮
                updateBtn.style.display = (state.canUpdate && (state.currentSegments.length > 0 || state.pendingSegments.length > 0)) ? 'flex' : 'none'
            }

            popover._mgr = { content, updateBtn, updateAllBtn, reIdentifyBtn, manualEntry, manualBtn, manualAddBtn, manualStartTime, manualEndTime, inlineMsg, pendingList, showInlineMsg, renderPendingList, batchSection: document.getElementById('SkipSegmentManagerBatchSection') }

            const renderSegments = (segments, cacheInfo) => {
                segments = mergeSegments(segments)
                let html = ''

                if (cacheInfo) {
                    const time = new Date(cacheInfo.last_updated).toLocaleString('zh-CN')
                    html += '<div class="cache-info"><div class="cache-meta">上传者 UID: ' + (cacheInfo.uploader_uid || '未知') + '</div>'
                    html += '<div class="cache-meta">更新时间: ' + time + '</div>'
                    html += '<div class="cache-meta">版本: v' + (cacheInfo.version || 1) + '</div></div>'
                }

                if (!segments || segments.length === 0) {
                    html += '<div class="empty-result">未识别到需要跳过的片段</div>'
                } else {
                    html += '<div class="segment-count">共 ' + segments.length + ' 个片段：</div><div class="segment-list">'
                    segments.forEach((seg, i) => {
                        const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                        html += '<div class="segment-item" data-index="' + i + '"><span class="segment-index">' + (i + 1) + '.</span><span class="segment-time">' + timeStr + '</span><div class="segment-delete" data-index="' + i + '" title="删除">×</div></div>'
                    })
                    html += '</div>'
                }
                content.innerHTML = html

                content.querySelectorAll('.segment-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.currentTarget.dataset.index)
                        state.currentSegments.splice(idx, 1)
                        renderSegments(state.currentSegments, state.cached)
                    })
                })

                if (state.canUpdate && segments && segments.length > 0) {
                    updateBtn.style.display = 'flex'
                } else {
                    updateBtn.style.display = 'none'
                }
            }

            popover._mgr.renderSegments = renderSegments

            // ===== 番剧页：手风琴剧集列表相关函数 =====

            // 渲染单个剧集的手风琴展开内容
            const renderAccordionBody = (body, ep) => {
                const segments = mergeSegments(state.currentSegments)
                let bodyHtml = ''

                if (segments.length === 0) {
                    bodyHtml += '<div class="empty-result">未识别到需要跳过的片段</div>'
                } else {
                    bodyHtml += '<div class="segment-list">'
                    segments.forEach((seg, i) => {
                        const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                        bodyHtml += '<div class="segment-item"><span class="segment-time">' + timeStr + '</span></div>'
                    })
                    bodyHtml += '</div>'
                }

                // 手动添加表单（内嵌在剧集编辑区内）
                bodyHtml += '<div class="accordion-manual-entry">'
                bodyHtml += '<div class="accordion-inline-msg"></div>'
                bodyHtml += '<div class="manual-entry-form">'
                bodyHtml += '<div class="input-mode-toggle"><button class="input-mode-btn" title="切换输入模式">起止时间</button></div>'
                bodyHtml += '<div class="time-inputs time-inputs-start-end"><div class="time-input-group"><label>开始</label><input type="text" class="time-input accordion-start-time" placeholder="0:00" value=""></div><span class="time-separator">-</span><div class="time-input-group"><label>结束</label><input type="text" class="time-input accordion-end-time" placeholder="0:00" value=""></div></div>'
                bodyHtml += '<div class="time-inputs time-inputs-start-duration" style="display:none;"><div class="time-input-group"><label>开始</label><input type="text" class="time-input accordion-start-time-2" placeholder="0:00" value=""></div><span class="time-separator">+</span><div class="time-input-group"><label>跳过</label><input type="text" class="time-input accordion-duration" placeholder="30s" value=""></div></div>'
                bodyHtml += '<div class="adjustment-button info accordion-add-btn">添加</div>'
                bodyHtml += '</div>'
                bodyHtml += '<div class="accordion-pending-list"></div>'
                bodyHtml += '</div>'

                bodyHtml += '<div class="accordion-actions">' +
                    '<div class="adjustment-button secondary" data-action="apply-all">应用到全部</div>' +
                    '<div class="adjustment-button danger" data-action="clear-others">清空其他</div>' +
                    '<div class="adjustment-button primary" data-action="update-cache">更新缓存</div>' +
                    '</div>'

                body.innerHTML = bodyHtml

                // 绑定操作按钮事件
                body.querySelectorAll('[data-action]').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation()
                        const action = btn.dataset.action

                        if (action === 'apply-all') {
                            if (!confirm('确定要将当前剧集的跳过片段应用到同系列全部 ' + state.episodes.length + ' 集吗？')) return
                            if (state.pendingSegments.length > 0) {
                                state.currentSegments.push(...state.pendingSegments)
                                state.currentSegments = mergeSegments(state.currentSegments)
                                state.pendingSegments = []
                            }
                            if (state.currentSegments.length === 0) {
                                const msg = body.querySelector('.accordion-inline-msg')
                                if (msg) { msg.textContent = '请先添加跳过片段'; msg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            const uid = getCurrentUid()
                            let successCount = 0
                            for (const ep of state.episodes) {
                                const epId = String(ep.id)
                                const cacheEntry = createCacheEntry(epId, state.currentSegments, uid)
                                await storageService.adCacheSet(epId, cacheEntry)
                                successCount++
                            }
                            const msg = body.querySelector('.accordion-inline-msg')
                            if (msg) { msg.textContent = '已应用到 ' + successCount + ' 集'; msg.className = 'accordion-inline-msg success' }
                            await renderAccordionList(state.episodes)
                        } else if (action === 'clear-others') {
                            if (!confirm('确定要清空同系列其他 ' + (state.episodes.length - 1) + ' 集的跳过片段吗？此操作不可撤销。')) return
                            const uid = getCurrentUid()
                            let clearedCount = 0
                            for (const ep of state.episodes) {
                                const epId = String(ep.id)
                                if (epId === state.bvid) continue
                                const cacheEntry = createCacheEntry(epId, [], uid)
                                await storageService.adCacheSet(epId, cacheEntry)
                                try {
                                    await fetch(SKIP_CACHE_API, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(cacheEntry)
                                    })
                                } catch (_) {}
                                clearedCount++
                            }
                            const msg = body.querySelector('.accordion-inline-msg')
                            if (msg) { msg.textContent = '已清空 ' + clearedCount + ' 集的跳过片段'; msg.className = 'accordion-inline-msg success' }
                            await renderAccordionList(state.episodes)
                        } else if (action === 'update-cache') {
                            if (state.pendingSegments.length > 0) {
                                state.currentSegments.push(...state.pendingSegments)
                                state.currentSegments = mergeSegments(state.currentSegments)
                                state.pendingSegments = []
                            }
                            const uid = getCurrentUid()
                            const newCache = createCacheEntry(state.bvid, state.currentSegments, uid)
                            if (state.cached) {
                                newCache.version = (state.cached.version || 0) + 1
                                newCache.verified_by = [...new Set([...(state.cached.verified_by || []), uid].filter(Boolean))]
                            }
                            await storageService.adCacheSet(state.bvid, newCache)
                            try {
                                await fetch(SKIP_CACHE_API, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(newCache)
                                })
                            } catch (_) {}
                            state.cached = newCache
                            const msg = body.querySelector('.accordion-inline-msg')
                            if (msg) { msg.textContent = '缓存已更新'; msg.className = 'accordion-inline-msg success' }
                        }
                    })
                })

                // 绑定手动添加表单事件
                const accordionManualEntry = body.querySelector('.accordion-manual-entry')
                const accordionInputModeBtn = body.querySelector('.input-mode-btn')
                const accordionStartTime = body.querySelector('.accordion-start-time')
                const accordionEndTime = body.querySelector('.accordion-end-time')
                const accordionStartTime2 = body.querySelector('.accordion-start-time-2')
                const accordionDuration = body.querySelector('.accordion-duration')
                const accordionAddBtn = body.querySelector('.accordion-add-btn')
                const accordionPendingList = body.querySelector('.accordion-pending-list')
                const accordionInlineMsg = body.querySelector('.accordion-inline-msg')
                const timeInputsSE = body.querySelector('.time-inputs-start-end')
                const timeInputsSD = body.querySelector('.time-inputs-start-duration')
                let localInputMode = 'start-end'
                let localPendingSegments = []

                const renderLocalPendingList = () => {
                    if (localPendingSegments.length === 0) {
                        accordionPendingList.innerHTML = ''
                    } else {
                        let html = ''
                        localPendingSegments.forEach((seg, i) => {
                            const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                            html += '<div class="pending-item"><span class="segment-time">' + timeStr + '</span><div class="pending-delete" data-index="' + i + '" title="移除">×</div></div>'
                        })
                        accordionPendingList.innerHTML = html
                        accordionPendingList.querySelectorAll('.pending-delete').forEach(dBtn => {
                            dBtn.addEventListener('click', (e) => {
                                const idx = parseInt(e.currentTarget.dataset.index)
                                localPendingSegments.splice(idx, 1)
                                renderLocalPendingList()
                            })
                        })
                    }
                }

                if (accordionInputModeBtn) {
                    accordionInputModeBtn.addEventListener('click', (e) => {
                        e.stopPropagation()
                        if (localInputMode === 'start-end') {
                            localInputMode = 'start-duration'
                            accordionInputModeBtn.textContent = '起止时间'
                            timeInputsSE.style.display = 'none'
                            timeInputsSD.style.display = 'flex'
                        } else {
                            localInputMode = 'start-end'
                            accordionInputModeBtn.textContent = '起始+时长'
                            timeInputsSE.style.display = 'flex'
                            timeInputsSD.style.display = 'none'
                        }
                    })
                }

                if (accordionAddBtn) {
                    accordionAddBtn.addEventListener('click', (e) => {
                        e.stopPropagation()
                        let start = null, end = null
                        if (localInputMode === 'start-end') {
                            const startStr = accordionStartTime.value.trim()
                            const endStr = accordionEndTime.value.trim()
                            if (!startStr || !endStr) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '请输入开始和结束时间'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            start = parseTime(startStr)
                            end = parseTime(endStr)
                            if (start === null || end === null) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '时间格式错误，请使用 M:SS 或秒数'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            if (start >= end) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '开始时间必须小于结束时间'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                        } else {
                            const startStr = accordionStartTime2.value.trim()
                            const durationStr = accordionDuration.value.trim()
                            if (!startStr || !durationStr) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '请输入开始时间和跳过时长'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            start = parseTime(startStr)
                            const duration = parseDuration(durationStr)
                            if (start === null) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '开始时间格式错误'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            if (duration === null || duration <= 0) {
                                if (accordionInlineMsg) { accordionInlineMsg.textContent = '跳过时长格式错误'; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            end = start + duration
                        }
                        const allSegs = [...state.currentSegments, ...localPendingSegments]
                        const conflict = validateSegment({ start, end }, allSegs)
                        if (conflict) {
                            if (accordionInlineMsg) { accordionInlineMsg.textContent = conflict; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                            return
                        }
                        localPendingSegments.push({ start, end })
                        localPendingSegments.sort((a, b) => a.start - b.start)
                        state.pendingSegments = [...localPendingSegments]
                        renderLocalPendingList()
                        if (localInputMode === 'start-end') {
                            accordionStartTime.value = ''
                            accordionEndTime.value = ''
                            accordionStartTime.focus()
                        } else {
                            accordionStartTime2.value = ''
                            accordionDuration.value = ''
                            accordionStartTime2.focus()
                        }
                    })
                }
            }

            // ===== 番剧页：手风琴剧集列表相关函数 =====
            const backBtn = document.getElementById('SkipSegmentManagerBackBtn')

            // 生成片段预览文本（如 "0:30-1:00, 5:15-5:45"）
            const formatSegmentPreview = (segments) => {
                if (!segments || segments.length === 0) return '无片段'
                const merged = mergeSegments(segments)
                return merged.slice(0, 3).map(seg => formatTime(seg.start) + '-' + formatTime(seg.end)).join(', ') + (merged.length > 3 ? '...' : '')
            }

            const renderAccordionList = async (episodes) => {
                if (!episodes || episodes.length === 0) return
                state.bangumiView = 'accordion'
                state.currentEpisodeIndex = -1

                // 隐藏其他区域
                content.style.display = 'none'
                manualEntry.style.display = 'none'
                updateBtn.style.display = 'none'
                updateAllBtn.style.display = 'none'
                reIdentifyBtn.style.display = 'none'
                batchSectionEl.style.display = 'none'
                backBtn.style.display = 'none'

                // 显示手风琴列表
                episodeAccordionEl.style.display = 'flex'
                // 手风琴模式下隐藏底部的「手动添加」和「重新识别」按钮（每个剧集有独立的操作按钮）
                manualBtn.style.display = 'none'

                // 先渲染基础结构（显示加载中）
                episodeAccordionEl.innerHTML = episodes.map((ep, i) => {
                    const epId = String(ep.id)
                    const isCurrent = epId === state.bvid
                    const epNum = ep.title ? ep.title.replace(/[^\d]/g, '') || String(i + 1) : String(i + 1)
                    return '<div class="episode-accordion-item" data-ep-index="' + i + '" data-ep-id="' + epId + '">' +
                        '<div class="episode-accordion-header' + (isCurrent ? ' active' : '') + '" data-ep-index="' + i + '">' +
                        '<span class="episode-index">' + epNum + '</span>' +
                        '<span class="episode-title">' + (ep.title || '') + (ep.long_title ? ' ' + ep.long_title : '') + '</span>' +
                        '<span class="episode-segment-preview">加载中...</span>' +
                        '<span class="accordion-arrow">▼</span>' +
                        '</div>' +
                        '<div class="episode-accordion-body" data-ep-index="' + i + '"></div>' +
                        '</div>'
                }).join('')

                // 并行加载所有剧集的片段数据
                const dataPromises = episodes.map(async (ep, i) => {
                    const epId = String(ep.id)
                    let cached = null
                    try {
                        cached = await storageService.adCacheGet(epId)
                    } catch (_) {}
                    return { index: i, segments: cached?.segments || [], cached }
                })
                const results = await Promise.all(dataPromises)

                // 更新片段预览，并为当前剧集渲染展开内容
                const currentIndex = results.findIndex(r => {
                    const item = episodeAccordionEl.querySelector('.episode-accordion-item[data-ep-index="' + r.index + '"]')
                    return item && item.querySelector('.episode-accordion-header.active')
                })

                results.forEach(({ index, segments, cached }) => {
                    const item = episodeAccordionEl.querySelector('.episode-accordion-item[data-ep-index="' + index + '"]')
                    if (!item) return
                    const previewEl = item.querySelector('.episode-segment-preview')
                    const preview = formatSegmentPreview(segments)
                    previewEl.textContent = preview
                    if (segments.length > 0) {
                        previewEl.classList.add('has-segments')
                    }
                    // 为当前剧集渲染展开内容
                    if (index === currentIndex) {
                        const body = item.querySelector('.episode-accordion-body')
                        body.classList.add('expanded')
                        // 设置状态
                        state.currentEpisodeIndex = index
                        state.bvid = String(episodes[index].id)
                        state.currentSegments = cached?.segments ? [...cached.segments] : []
                        state.cached = cached
                        state.canUpdate = canUpdateCache(cached, getCurrentUid())
                        // 渲染编辑区
                        renderAccordionBody(body, episodes[index])
                    }
                })

                // 绑定手风琴头部点击事件
                episodeAccordionEl.querySelectorAll('.episode-accordion-header').forEach(header => {
                    header.addEventListener('click', async () => {
                        const idx = parseInt(header.dataset.epIndex)
                        const item = episodeAccordionEl.querySelector('.episode-accordion-item[data-ep-index="' + idx + '"]')
                        const body = item.querySelector('.episode-accordion-body')
                        const isActive = header.classList.contains('active')

                        // 收起其他已展开的项
                        episodeAccordionEl.querySelectorAll('.episode-accordion-header.active').forEach(h => {
                            if (h !== header) {
                                h.classList.remove('active')
                                const b = h.closest('.episode-accordion-item').querySelector('.episode-accordion-body')
                                b.classList.remove('expanded')
                            }
                        })

                        if (isActive) {
                            // 收起当前项
                            header.classList.remove('active')
                            body.classList.remove('expanded')
                            state.currentEpisodeIndex = -1
                        } else {
                            // 展开当前项
                            header.classList.add('active')
                            body.classList.add('expanded')

                            // 加载该集的片段数据并渲染编辑区
                            const ep = episodes[idx]
                            const epId = String(ep.id)
                            state.currentEpisodeIndex = idx
                            state.bvid = epId
                            state.pendingSegments = []

                            let cached = null
                            try {
                                cached = await storageService.adCacheGet(epId)
                            } catch (_) {}
                            state.currentSegments = cached?.segments ? [...cached.segments] : []
                            state.cached = cached
                            state.canUpdate = canUpdateCache(cached, getCurrentUid())

                            // 渲染编辑区内容
                            renderAccordionBody(body, ep)
                        }
                    })
                })

                // 显示「更新全部缓存」按钮
                updateAllBtn.style.display = 'flex'
            }

            // 「更新全部缓存」按钮事件
            updateAllBtn.addEventListener('click', async () => {
                try {
                    const uid = getCurrentUid()
                    let successCount = 0
                    for (const ep of state.episodes) {
                        const epId = String(ep.id)
                        let cached = null
                        try {
                            cached = await storageService.adCacheGet(epId)
                        } catch (_) {}
                        const segments = cached?.segments || []
                        if (segments.length === 0) continue
                        const cacheEntry = createCacheEntry(epId, segments, uid)
                        await storageService.adCacheSet(epId, cacheEntry)
                        try {
                            await fetch(SKIP_CACHE_API, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(cacheEntry)
                            })
                        } catch (_) {}
                        successCount++
                    }
                    showInlineMsg('已更新 ' + successCount + ' 集缓存')
                } catch (error) {
                    logger.error('跳过片段管理丨批量更新缓存失败:', error)
                    showInlineMsg('批量更新失败')
                }
            })

            popover._mgr.renderAccordionList = renderAccordionList

            // 恢复底部按钮（非手风琴模式时）
            const restoreBottomButtons = () => {
                manualBtn.style.display = ''
            }

            // 返回按钮（手风琴模式下隐藏，因为不再需要返回）
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                // 手风琴模式下不需要返回
            })

            // 关闭按钮
            document.getElementById('SkipSegmentManagerCloseButton').addEventListener('click', (e) => {
                e.stopPropagation()
                popoverManager.hide(popoverId)
            })

            // 手动添加表单：添加片段到待定列表
            manualAddBtn.addEventListener('click', (e) => {
                e.stopPropagation()

                let start = null
                let end = null

                if (state.inputMode === 'start-end') {
                    const startStr = manualStartTime.value.trim()
                    const endStr = manualEndTime.value.trim()

                    if (!startStr || !endStr) {
                        showInlineMsg('请输入开始和结束时间')
                        return
                    }

                    start = parseTime(startStr)
                    end = parseTime(endStr)

                    if (start === null || end === null) {
                        showInlineMsg('时间格式错误，请使用 M:SS 或秒数')
                        return
                    }

                    if (start >= end) {
                        showInlineMsg('开始时间必须小于结束时间')
                        return
                    }
                } else {
                    const startStr = manualStartTime2.value.trim()
                    const durationStr = manualDuration.value.trim()

                    if (!startStr || !durationStr) {
                        showInlineMsg('请输入开始时间和跳过时长')
                        return
                    }

                    start = parseTime(startStr)
                    const duration = parseDuration(durationStr)

                    if (start === null) {
                        showInlineMsg('开始时间格式错误，请使用 M:SS 或秒数')
                        return
                    }

                    if (duration === null || duration <= 0) {
                        showInlineMsg('跳过时长格式错误，请输入正数（支持 30s, 1m30s, 90 等格式）')
                        return
                    }

                    end = start + duration
                }

                const allSegments = [...state.currentSegments, ...state.pendingSegments]
                const conflict = validateSegment({ start, end }, allSegments)
                if (conflict) {
                    showInlineMsg(conflict)
                    return
                }

                state.pendingSegments.push({ start, end })
                state.pendingSegments.sort((a, b) => a.start - b.start)
                renderPendingList()

                // 清空输入框
                if (state.inputMode === 'start-end') {
                    manualStartTime.value = ''
                    manualEndTime.value = ''
                    manualStartTime.focus()
                } else {
                    manualStartTime2.value = ''
                    manualDuration.value = ''
                    manualStartTime2.focus()
                }
            })

            // 页脚「手动添加」按钮：切换手动添加表单
            manualBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                const isVisible = manualEntry.style.display === 'flex'
                manualEntry.style.display = isVisible ? 'none' : 'flex'
            })

            // 重新识别
            reIdentifyBtn.addEventListener('click', async () => {
                content.innerHTML = '<div class="loading">正在重新识别...</div>'
                reIdentifyBtn.disabled = true
                manualEntry.style.display = 'none'

                try {
                    const result = await self.recognizeSkipSegments(state.bvid)
                    reIdentifyBtn.disabled = false

                    if (result.error) {
                        content.innerHTML = '<div class="error">' + result.error + '</div>'
                        return
                    }

                    state.currentSegments = result.segments || []
                    const newCache = createCacheEntry(state.bvid, state.currentSegments, getCurrentUid())
                    renderSegments(state.currentSegments, newCache)
                } catch (error) {
                    reIdentifyBtn.disabled = false
                    content.innerHTML = '<div class="error">识别失败: ' + error.message + '</div>'
                }
            })

            // 更新缓存：合并待定片段后保存
            updateBtn.addEventListener('click', async () => {
                try {
                    // 合并待定片段到当前片段
                    if (state.pendingSegments.length > 0) {
                        state.currentSegments.push(...state.pendingSegments)
                        state.currentSegments = mergeSegments(state.currentSegments)
                        state.pendingSegments = []
                        renderPendingList()
                    }

                    const uid = getCurrentUid()
                    const newCache = createCacheEntry(state.bvid, state.currentSegments, uid)
                    if (state.cached) {
                        newCache.version = (state.cached.version || 0) + 1
                        newCache.verified_by = [...new Set([...(state.cached.verified_by || []), uid].filter(Boolean))]
                    }

                    await storageService.adCacheSet(state.bvid, newCache)
                    logger.info('跳过片段管理丨已更新本地缓存')

                    await fetch(SKIP_CACHE_API, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newCache)
                    })
                    logger.info('跳过片段管理丨已更新远程缓存')

                    state.cached = newCache
                    self.advertisementIdentified = false
                    await self.identifyAdvertisementTimestamps()

                    renderSegments(state.currentSegments, state.cached)
                    content.insertAdjacentHTML('beforeend', '<div class="success">缓存已更新</div>')
                } catch (error) {
                    logger.error('跳过片段管理丨更新缓存失败:', error)
                    content.innerHTML = '<div class="error">更新缓存失败</div>'
                }
            })

            // 应用到同系列全部视频
            const batchSection = document.getElementById('SkipSegmentManagerBatchSection')
            const applyAllBtn = document.getElementById('SkipSegmentManagerApplyAllBtn')
            const batchMsg = document.getElementById('SkipSegmentManagerBatchMsg')

            applyAllBtn.addEventListener('click', async () => {
                try {
                    // 合并待定片段
                    if (state.pendingSegments.length > 0) {
                        state.currentSegments.push(...state.pendingSegments)
                        state.currentSegments = mergeSegments(state.currentSegments)
                        state.pendingSegments = []
                        renderPendingList()
                    }
                    if (state.currentSegments.length === 0) {
                        batchMsg.textContent = '请先添加跳过片段'
                        batchMsg.className = 'inline-msg warn'
                        return
                    }
                    const episodeIds = state.seriesEpisodeIds || []
                    if (episodeIds.length === 0) {
                        batchMsg.textContent = '未检测到系列信息'
                        batchMsg.className = 'inline-msg warn'
                        return
                    }
                    // 普通视频页：直接应用
                    applyAllBtn.disabled = true
                    applyAllBtn.textContent = '应用中...'
                    const uid = getCurrentUid()
                    let successCount = 0
                    for (const epId of episodeIds) {
                        const cacheEntry = createCacheEntry(epId, state.currentSegments, uid)
                        await storageService.adCacheSet(epId, cacheEntry)
                        try {
                            await fetch(SKIP_CACHE_API, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(cacheEntry)
                            })
                        } catch (_) {}
                        successCount++
                    }
                    applyAllBtn.disabled = false
                    applyAllBtn.textContent = '应用到同系列全部视频'
                    batchMsg.textContent = '已应用到 ' + successCount + ' 个视频'
                    batchMsg.className = 'inline-msg success'
                    // 重新加载当前视频的片段
                    state.cached = await storageService.adCacheGet(state.bvid)
                    self.advertisementIdentified = false
                    await self.identifyAdvertisementTimestamps()
                    renderSegments(state.currentSegments, state.cached)
                } catch (error) {
                    logger.error('跳过片段管理丨批量应用失败:', error)
                    batchMsg.textContent = '批量应用失败'
                    batchMsg.className = 'inline-msg warn'
                    applyAllBtn.disabled = false
                    applyAllBtn.textContent = '应用到同系列全部视频'
                }
            })
        }

        // --- 每次打开时更新状态并渲染 ---
        const { content, updateBtn, updateAllBtn, reIdentifyBtn, manualEntry, renderPendingList, renderSegments, batchSection } = popover._mgr
        state.bvid = bvid
        state.currentSegments = []
        state.pendingSegments = []
        state.seriesEpisodeIds = []
        renderPendingList()
        const uid = getCurrentUid()

        // 获取视频信息（用于检测字幕和系列信息）
        let videoInfo = null
        try {
            videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        } catch (error) {
            logger.debug('跳过片段管理丨获取视频信息失败', error)
        }

        // 番剧页直接隐藏「重新识别」按钮（番剧页不支持AI识别）
        // video页面：检测字幕，无字幕则隐藏
        if (reIdentifyBtn) {
            if (this.userConfigs.page_type === 'bangumi') {
                reIdentifyBtn.style.display = 'none'
            } else {
                let hasSubtitles = false
                try {
                    const cid = videoInfo?.cid
                    if (cid) {
                        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
                        hasSubtitles = !!(subtitles && subtitles.length > 0)
                    }
                } catch (error) {
                    logger.debug('跳过片段管理丨检测字幕失败', error)
                }
                reIdentifyBtn.style.display = hasSubtitles ? '' : 'none'
            }
        }

        // ===== 番剧页：显示手风琴剧集列表 =====
        const { renderAccordionList } = popover._mgr
        const batchSectionEl = document.getElementById('SkipSegmentManagerBatchSection')
        if (batchSectionEl) {
            batchSectionEl.style.display = 'none'
        }

        if (this.userConfigs.page_type === 'bangumi' && videoInfo?.episodes?.length > 0) {
            state.episodes = videoInfo.episodes
            state.seriesEpisodeIds = videoInfo.episodes.map(ep => String(ep.id))
            // 显示手风琴剧集列表
            popoverManager.show(popoverId)
            content.style.display = 'none'
            manualEntry.style.display = 'none'
            updateBtn.style.display = 'none'
            updateAllBtn.style.display = 'none'
            reIdentifyBtn.style.display = 'none'
            if (batchSectionEl) batchSectionEl.style.display = 'none'
            await renderAccordionList(state.episodes)
            return
        }

        // ===== 普通视频页：原有逻辑 =====
        // 检测当前视频是否属于系列/合集，获取同系列所有视频ID
        if (batchSectionEl) {
            if (videoInfo) {
                let episodeIds = []
                if (videoInfo.ugc_season) {
                    const sections = videoInfo.ugc_season.sections || []
                    for (const section of sections) {
                        for (const ep of (section.episodes || [])) {
                            if (ep.bvid) episodeIds.push(ep.bvid)
                        }
                    }
                }
                if (episodeIds.length > 1) {
                    state.seriesEpisodeIds = episodeIds
                    batchSectionEl.style.display = 'block'
                }
            }
        }

        // 先检查本地缓存
        let cached = await storageService.adCacheGet(bvid)
        let hasCache = cached && cached.segments
        state.currentSegments = hasCache ? [...cached.segments] : []
        state.cached = cached
        state.canUpdate = canUpdateCache(cached, uid)

        if (hasCache) {
            renderSegments(cached.segments, cached)
            manualEntry.style.display = 'none'
            popoverManager.show(popoverId)
        } else {
            content.innerHTML = '<div class="loading">正在查询缓存...</div>'
            updateBtn.style.display = 'none'
            manualEntry.style.display = 'none'
            popoverManager.show(popoverId)

            try {
                const resp = await fetch(SKIP_CACHE_API + '?bvid=' + bvid)
                if (resp.ok) {
                    const result = await resp.json()
                    if (result.ok && result.data && result.data.segments && result.data.segments.length > 0) {
                        state.currentSegments = [...result.data.segments]
                        state.cached = result.data
                        state.canUpdate = canUpdateCache(result.data, uid)
                        await storageService.adCacheSet(bvid, result.data)
                        logger.info('跳过片段管理丨命中远程缓存')
                        renderSegments(result.data.segments, result.data)
                        manualEntry.style.display = 'none'
                        return
                    }
                }
            } catch (error) {
                logger.debug('跳过片段管理丨远程缓存查询失败', error)
            }
            state.currentSegments = []
            state.cached = null
            state.canUpdate = true
            content.innerHTML = '<div class="empty-result">暂无跳过片段数据</div><div class="empty-tip">可点击下方「手动添加」填写片头片尾等固定片段，或点击「重新识别」通过 AI 识别广告</div>'
            updateBtn.style.display = 'none'
            manualEntry.style.display = 'none'
        }
    },
    // 番剧页专用：仅从缓存加载跳过片段（片头片尾等），不执行AI识别
    async loadCachedSkipSegments () {
        if (!this.userConfigs.auto_skip) return
        if (this.advertisementIdentified) return
        this.advertisementIdentified = true
        setTimeout(() => { this.advertisementIdentified = false }, 30000)
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        if (!bvid || bvid === 'error') return
        // 先查本地缓存
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached?.segments?.length > 0) {
                logger.info('跳过片段丨番剧页命中本地缓存，共', cached.segments.length, '个片段')
                this.autoSkipAdvertisementSegments(cached.segments)
                return cached.segments
            }
        } catch (error) {
            logger.debug('跳过片段丨本地缓存读取失败', error)
        }
        // 再查远程缓存
        try {
            const resp = await fetch(`${SKIP_CACHE_API}?bvid=${bvid}`)
            if (resp.ok) {
                const result = await resp.json()
                if (result.ok && result.data) {
                    const segments = result.data.segments || []
                    if (segments.length > 0) {
                        logger.info('跳过片段丨番剧页命中远程缓存，共', segments.length, '个片段')
                        try { await storageService.adCacheSet(bvid, result.data) } catch (_) {}
                        this.autoSkipAdvertisementSegments(segments)
                        return segments
                    }
                }
            }
        } catch (error) {
            logger.debug('跳过片段丨番剧页远程缓存查询失败', error)
        }
        logger.debug('跳过片段丨番剧页未找到缓存数据')
    },
    async recognizeSkipSegments (bvid) {
        const result = { segments: [], error: null, bvid }

        const videoInfo = await biliApis.getVideoInformation(this.userConfigs.page_type, bvid)
        if (!videoInfo) {
            result.error = '无法获取视频信息'
            return result
        }

        const cid = videoInfo.cid
        if (!cid) {
            result.error = '无法获取视频信息'
            return result
        }

        const subtitles = await biliApis.getVideoSubtitles(bvid, cid)
        if (!subtitles || subtitles.length === 0) {
            result.error = '视频无字幕，无法识别'
            return result
        }

        const chineseSubtitle = subtitles.find(s => s.lan === 'ai-zh')
        if (!chineseSubtitle) {
            result.error = '视频无中文字幕，无法识别'
            return result
        }

        const subtitleContent = await biliApis.getSubtitleContent(chineseSubtitle.subtitle_url)
        if (!subtitleContent || subtitleContent.length === 0) {
            result.error = '字幕内容为空，无法识别'
            return result
        }

        const formattedSubtitles = subtitleContent.map(item => ({
            start: item.from,
            end: item.to,
            text: item.content
        }))
        const subtitlesJsonString = JSON.stringify(formattedSubtitles)

        try {
            await initializeAIService()
            const timestamps = await aiService.identifyAdvertisementSegments(subtitlesJsonString)
            result.segments = timestamps || []
        } catch (error) {
            logger.error('跳过片段管理丨AI服务初始化失败:', error)
            result.error = 'AI服务不可用，请检查配置'
        }

        return result
    }
}
