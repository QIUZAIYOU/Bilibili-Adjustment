import { LoggerService } from '@/services/logger.service'
import { elementSelectors } from '@/shared/element-selectors'
import { biliApis } from '@/shared/bili-apis'
import { aiService, initializeAIService } from '@/services/ai.service'
import { storageService } from '@/services/storage.service'
import { adjustmentConfirm, escapeHtml } from '@/utils/common'
import { getTemplates } from '@/shared/templates'
import { openAdjustmentDialog } from '@/components/popover-dialog'
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
const mergeSegments = segments => {
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
const formatTime = seconds => {
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return min + ':' + (sec < 10 ? '0' : '') + sec
}
/**
 * 解析时间字符串为秒数
 */
const parseTime = str => {
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
const parseDuration = str => {
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
        // 本函数负责「无缓存时用 AI 识别补全广告片段」：需总开关与 AI 识别子开关均开启
        if (!this.userConfigs.auto_skip || !this.userConfigs.ai_auto_identify) {
            logger.info('自动跳过广告丨功能已关闭（需开启「跳过片段」与「AI 自动识别广告」）')
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
        // 缓存片段已由 loadCachedSkipSegments 应用过，避免重复绑定跳过监听
        if (this._skipCacheApplied) return
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        // ss/季链接无法确定具体分集，跳过自动识别（可在片段管理弹窗内按集手动操作）
        if (!bvid || bvid === 'error' || (typeof bvid === 'string' && bvid.startsWith('ss'))) return
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
                    } catch { /* 忽略异常 */ }
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
        // 函数级变量：底部主面板「追加更新/覆盖更新」按钮与显隐控制（供 if 内绑定与 if 外每次打开逻辑共用）
        let appendBtn = null
        let overwriteBtn = null
        let renderAccordionList = null
        const updateBtnsVisible = visible => {
            if (appendBtn) appendBtn.style.display = visible ? 'flex' : 'none'
            if (overwriteBtn) overwriteBtn.style.display = visible ? 'flex' : 'none'
        }
        const self = this
        // --- 可变状态，由事件处理器共享引用 ---
        if (!this._skipMgrState) {
            this._skipMgrState = {
                currentSegments: [],
                pendingSegments: [],
                cached: null,
                canUpdate: true,
                bvid: null,
                // 重新识别得到的待提交预览（AI 识别清单，未落库前可被覆盖/追加上传）
                pendingIdentify: false,
                // 番剧页专用状态
                episodes: [],
                currentEpisodeIndex: -1,
                bangumiView: 'accordion', // 'list' | 'accordion'
                inputMode: 'start-end', // 'start-end' | 'start-duration'
                // 暂存区：每个剧集独立存储，操作按钮以此为准
                // key = episodeId, value = { segments: [], editingIndex: -1 }
                stagingMap: {},
                // 当前剧集的工作副本（从 stagingMap 加载/保存）
                stagingSegments: [],
                editingIndex: -1
            }
        }
        const state = this._skipMgrState
        // --- DOM：通过通用弹窗组件创建（每次打开全新构建；关闭即销毁 DOM，状态保留于 this._skipMgrState） ---
        const dialog = openAdjustmentDialog({
            key: 'skip-manager',
            title: '跳过片段管理',
            titleTag: '测试',
            width: 500,
            className: 'skip-manager-dialog',
            content: bodyEl => {
                bodyEl.insertAdjacentHTML('beforeend', getTemplates.skipSegmentManagerPopover)
            }
        })
        const popover = dialog.root
        {
            const content = document.getElementById('SkipSegmentManagerContent')
            appendBtn = document.getElementById('SkipSegmentManagerAppendBtn')
            overwriteBtn = document.getElementById('SkipSegmentManagerOverwriteBtn')
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
            const showInlineMsg = (msg, type = 'warn', duration = 3000) => {
                inlineMsg.textContent = msg
                inlineMsg.className = 'inline-msg' + (type ? ' ' + type : '')
                clearTimeout(inlineMsg._timer)
                if (duration > 0) {
                    inlineMsg._timer = setTimeout(() => {
                        inlineMsg.className = 'inline-msg'
                        inlineMsg.textContent = ''
                    }, duration)
                }
            }
            // 切换输入模式
            inputModeBtn.addEventListener('click', e => {
                e.stopPropagation()
                if (state.inputMode === 'start-end') {
                    state.inputMode = 'start-duration'
                    inputModeBtn.textContent = '起始+时长'
                    timeInputsStartEnd.style.display = 'none'
                    timeInputsStartDuration.style.display = 'flex'
                } else {
                    state.inputMode = 'start-end'
                    inputModeBtn.textContent = '起止时间'
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
                        btn.addEventListener('click', e => {
                            const idx = parseInt(e.currentTarget.dataset.index)
                            state.pendingSegments.splice(idx, 1)
                            renderPendingList()
                        })
                    })
                }
                // 有待添加片段或已有片段时显示更新按钮
                updateBtnsVisible(state.canUpdate && (state.currentSegments.length > 0 || state.pendingSegments.length > 0))
            }
            popover._mgr = { content, appendBtn, overwriteBtn, updateAllBtn, reIdentifyBtn, manualEntry, manualBtn, manualAddBtn, manualStartTime, manualEndTime, inlineMsg, pendingList, showInlineMsg, renderPendingList }
            const renderSegments = (segments, cacheInfo) => {
                segments = mergeSegments(segments)
                let html = ''
                if (cacheInfo) {
                    const time = new Date(cacheInfo.last_updated).toLocaleString('zh-CN')
                    html += '<div class="cache-info"><div class="cache-meta">上传者 UID: ' + (cacheInfo.uploader_uid || '未知') + '</div>'
                    html += '<div class="cache-meta">更新时间: ' + time + '</div>'
                    html += '<div class="cache-meta">版本: v' + (cacheInfo.version || 1) + '</div>'
                    // 仅上传者本人、且当前展示的是已落库缓存时才显示锁定/解锁
                    const ownerUid = getCurrentUid()
                    if (cacheInfo === state.cached && cacheInfo.uploader_uid && cacheInfo.uploader_uid === ownerUid) {
                        html += '<div class="cache-meta cache-lock-row"><span class="cache-lock-state">' + (cacheInfo.locked ? '已锁定：他人无法修改此数据' : '未锁定：他人可修改') + '</span><div class="cache-lock-btn adjustment-button ' + (cacheInfo.locked ? 'info' : 'danger') + '">' + (cacheInfo.locked ? '解锁' : '锁定') + '</div></div>'
                    }
                    html += '</div>'
                }
                if (!segments || segments.length === 0) {
                    html += '<div class="empty-result">未识别到需要跳过的片段</div>'
                } else {
                    html += '<div class="segment-count">共 ' + segments.length + ' 个片段：</div><div class="segment-list">'
                    segments.forEach((seg, i) => {
                        const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                        const summaryHtml = seg.summary ? '<span class="segment-summary" title="' + escapeHtml(seg.summary) + '">' + escapeHtml(seg.summary) + '</span>' : ''
                        html += '<div class="segment-item" data-index="' + i + '"><span class="segment-index">' + (i + 1) + '.</span><span class="segment-time">' + timeStr + '</span>' + summaryHtml + '<div class="segment-delete" data-index="' + i + '" title="删除">×</div></div>'
                    })
                    html += '</div>'
                }
                content.innerHTML = html
                content.querySelectorAll('.segment-delete').forEach(btn => {
                    btn.addEventListener('click', e => {
                        const idx = parseInt(e.currentTarget.dataset.index)
                        state.currentSegments.splice(idx, 1)
                        renderSegments(state.currentSegments, state.cached)
                    })
                })
                // 锁定/解锁（仅上传者本人可见）
                const lockBtn = content.querySelector('.cache-lock-btn')
                if (lockBtn) {
                    lockBtn.addEventListener('click', async e => {
                        e.stopPropagation()
                        if (!state.cached || !self.setCacheLocked) return
                        const nextLock = !state.cached.locked
                        lockBtn.style.pointerEvents = 'none'
                        lockBtn.style.opacity = '0.5'
                        const entry = await self.setCacheLocked(state.bvid, state.cached, nextLock)
                        if (entry) {
                            state.cached = entry
                            renderSegments(entry.segments, entry)
                            showInlineMsg(nextLock ? '已锁定，他人将无法修改此片段数据' : '已解锁，他人可再次修改', 'success', 4000)
                        } else {
                            lockBtn.style.pointerEvents = ''
                            lockBtn.style.opacity = ''
                        }
                    })
                }
                if (state.canUpdate && segments && segments.length > 0) {
                    updateBtnsVisible(true)
                } else {
                    updateBtnsVisible(false)
                }
            }
            popover._mgr.renderSegments = renderSegments
            // ===== 番剧页：手风琴剧集列表相关函数 =====
            // 渲染单个剧集的手风琴展开内容
            const renderAccordionBody = (body, ep) => {
                const cachedSegments = mergeSegments(state.cached?.segments || [])
                const stagingSegments = state.stagingSegments
                let bodyHtml = ''
                // 仅上传者本人显示该集缓存的锁定/解锁
                const ownerUid = getCurrentUid()
                if (state.cached && state.cached.uploader_uid && state.cached.uploader_uid === ownerUid) {
                    bodyHtml += '<div class="accordion-owner-row"><span>' + (state.cached.locked ? '已锁定：他人无法修改此集数据' : '未锁定：他人可修改') + '</span><div class="adjustment-button accordion-lock-btn ' + (state.cached.locked ? 'info' : 'danger') + '">' + (state.cached.locked ? '解锁' : '锁定') + '</div></div>'
                }
                // 已有片段（只读参考）
                bodyHtml += '<div class="cached-section">'
                bodyHtml += '<div class="cached-section-header">已有片段'
                if (cachedSegments.length > 0) {
                    bodyHtml += '<span class="cached-count">' + cachedSegments.length + ' 个</span>'
                }
                bodyHtml += '</div>'
                if (cachedSegments.length === 0) {
                    bodyHtml += '<div class="empty-result">暂无缓存数据</div>'
                } else {
                    bodyHtml += '<div class="segment-list cached-segment-list">'
                    cachedSegments.forEach(seg => {
                        const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                        const summaryHtml = seg.summary ? '<span class="segment-summary" title="' + escapeHtml(seg.summary) + '">' + escapeHtml(seg.summary) + '</span>' : ''
                        bodyHtml += '<div class="segment-item cached-item"><span class="segment-time">' + timeStr + '</span>' + summaryHtml + '</div>'
                    })
                    bodyHtml += '</div>'
                }
                bodyHtml += '</div>'
                // 暂存区（用户添加/编辑的片段）
                bodyHtml += '<div class="staging-section">'
                bodyHtml += '<div class="staging-header">暂存区'
                if (stagingSegments.length > 0) {
                    bodyHtml += '<span class="staging-count">' + stagingSegments.length + ' 个待提交</span>'
                }
                bodyHtml += '</div>'
                bodyHtml += '<div class="staging-list"></div>'
                bodyHtml += '</div>'
                // 手动添加表单
                bodyHtml += '<div class="accordion-manual-entry">'
                bodyHtml += '<div class="accordion-inline-msg"></div>'
                bodyHtml += '<div class="manual-entry-form">'
                bodyHtml += '<div class="input-mode-toggle"><button class="input-mode-btn" title="切换输入模式">起止时间</button></div>'
                bodyHtml += '<div class="time-inputs time-inputs-start-end"><div class="time-input-group"><label>开始</label><input type="text" class="time-input accordion-start-time" placeholder="0:00" value=""></div><span class="time-separator">-</span><div class="time-input-group"><label>结束</label><input type="text" class="time-input accordion-end-time" placeholder="0:00" value=""></div></div>'
                bodyHtml += '<div class="time-inputs time-inputs-start-duration" style="display:none;"><div class="time-input-group"><label>开始</label><input type="text" class="time-input accordion-start-time-2" placeholder="0:00" value=""></div><span class="time-separator">+</span><div class="time-input-group"><label>跳过</label><input type="text" class="time-input accordion-duration" placeholder="30s" value=""></div></div>'
                bodyHtml += '<div class="form-actions"><div class="adjustment-button info accordion-add-btn">添加</div>'
                bodyHtml += '<div class="adjustment-button secondary accordion-cancel-edit-btn" style="display:none;">取消编辑</div></div>'
                bodyHtml += '</div>'
                bodyHtml += '</div>'
                bodyHtml += '<div class="accordion-actions">' +
                    '<div class="adjustment-button secondary" data-action="apply-all"' + (stagingSegments.length === 0 ? ' style="opacity:.4;pointer-events:none;"' : '') + '>应用到全部</div>' +
                    '<div class="adjustment-button danger" data-action="clear-others">清空其他</div>' +
                    '<div class="adjustment-button primary" data-action="update-append"' + (stagingSegments.length === 0 ? ' style="opacity:.4;pointer-events:none;"' : '') + '>追加更新</div>' +
                    '<div class="adjustment-button danger" data-action="update-overwrite"' + (stagingSegments.length === 0 ? ' style="opacity:.4;pointer-events:none;"' : '') + '>覆盖更新</div>' +
                    '</div>'
                body.innerHTML = bodyHtml
                // 锁定/解锁（仅上传者本人可见的行会渲染该按钮）
                const accordionLockBtn = body.querySelector('.accordion-lock-btn')
                if (accordionLockBtn) {
                    accordionLockBtn.addEventListener('click', async e => {
                        e.stopPropagation()
                        if (!state.cached || !self.setCacheLocked) return
                        const nextLock = !state.cached.locked
                        accordionLockBtn.style.pointerEvents = 'none'
                        accordionLockBtn.style.opacity = '0.5'
                        const entry = await self.setCacheLocked(state.bvid, state.cached, nextLock)
                        if (entry) {
                            state.cached = entry
                            renderAccordionBody(body, ep)
                            showInlineMsg(nextLock ? '已锁定，他人将无法修改此集数据' : '已解锁，他人可再次修改', 'success', 4000)
                        } else {
                            accordionLockBtn.style.pointerEvents = ''
                            accordionLockBtn.style.opacity = ''
                        }
                    })
                }
                // 渲染暂存区列表
                const stagingList = body.querySelector('.staging-list')
                const renderStagingList = () => {
                    if (state.stagingSegments.length === 0) {
                        stagingList.innerHTML = '<div class="empty-result">暂无待提交片段，请在下方添加</div>'
                    } else {
                        let html = ''
                        state.stagingSegments.forEach((seg, i) => {
                            const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                            const isEditing = state.editingIndex === i
                            html += '<div class="staging-item' + (isEditing ? ' editing' : '') + '" data-index="' + i + '">'
                            html += '<span class="segment-time">' + timeStr + '</span>'
                            html += '<div class="staging-actions">'
                            html += '<div class="staging-edit" data-index="' + i + '" title="编辑">✎</div>'
                            html += '<div class="staging-delete" data-index="' + i + '" title="移除">×</div>'
                            html += '</div></div>'
                        })
                        stagingList.innerHTML = html
                        // 删除事件
                        stagingList.querySelectorAll('.staging-delete').forEach(dBtn => {
                            dBtn.addEventListener('click', e => {
                                e.stopPropagation()
                                const idx = parseInt(e.currentTarget.dataset.index)
                                state.stagingSegments.splice(idx, 1)
                                if (state.editingIndex === idx) {
                                    state.editingIndex = -1
                                    clearForm()
                                } else if (state.editingIndex > idx) {
                                    state.editingIndex--
                                }
                                renderStagingList()
                                updateActionBtns()
                            })
                        })
                        // 编辑事件
                        stagingList.querySelectorAll('.staging-edit').forEach(eBtn => {
                            eBtn.addEventListener('click', e => {
                                e.stopPropagation()
                                const idx = parseInt(e.currentTarget.dataset.index)
                                const seg = state.stagingSegments[idx]
                                state.editingIndex = idx
                                // 填充表单
                                if (state.inputMode === 'start-end') {
                                    accordionStartTime.value = formatTime(seg.start)
                                    accordionEndTime.value = formatTime(seg.end)
                                } else {
                                    accordionStartTime2.value = formatTime(seg.start)
                                    const dur = seg.end - seg.start
                                    accordionDuration.value = dur >= 60 ? Math.floor(dur / 60) + 'm' + (dur % 60 > 0 ? (dur % 60) + 's' : '') : dur + 's'
                                }
                                // 切换按钮为「保存编辑」
                                accordionAddBtn.textContent = '保存编辑'
                                accordionAddBtn.classList.remove('info')
                                accordionAddBtn.classList.add('primary')
                                cancelEditBtn.style.display = ''
                                renderStagingList()
                            })
                        })
                    }
                    // 更新按钮状态
                    updateActionBtns()
                }
                // 更新操作按钮可用状态
                const updateActionBtns = () => {
                    const hasStaging = state.stagingSegments.length > 0
                    const applyAllBtn = body.querySelector('[data-action="apply-all"]')
                    const appendBtn = body.querySelector('[data-action="update-append"]')
                    const overwriteBtn = body.querySelector('[data-action="update-overwrite"]')
                    if (applyAllBtn) {
                        applyAllBtn.style.opacity = hasStaging ? '' : '.4'
                        applyAllBtn.style.pointerEvents = hasStaging ? '' : 'none'
                    }
                    ;[appendBtn, overwriteBtn].forEach(btn => {
                        if (btn) {
                            btn.style.opacity = hasStaging ? '' : '.4'
                            btn.style.pointerEvents = hasStaging ? '' : 'none'
                        }
                    })
                }
                // 清空表单并重置编辑状态
                const clearForm = () => {
                    state.editingIndex = -1
                    accordionStartTime.value = ''
                    accordionEndTime.value = ''
                    accordionStartTime2.value = ''
                    accordionDuration.value = ''
                    accordionAddBtn.textContent = '添加'
                    accordionAddBtn.classList.remove('primary')
                    accordionAddBtn.classList.add('info')
                    cancelEditBtn.style.display = 'none'
                }
                // 绑定操作按钮事件
                const setAccordionBtnsBusy = busy => {
                    body.querySelectorAll('[data-action]').forEach(b => {
                        if (busy) {
                            b.dataset.originText = b.textContent
                            b.style.pointerEvents = 'none'
                            b.style.opacity = '0.6'
                        } else {
                            b.style.pointerEvents = ''
                            b.style.opacity = ''
                            if (b.dataset.originText) {
                                b.textContent = b.dataset.originText
                                delete b.dataset.originText
                            }
                        }
                    })
                }
                body.querySelectorAll('[data-action]').forEach(btn => {
                    btn.addEventListener('click', async e => {
                        e.stopPropagation()
                        const action = btn.dataset.action
                        const msg = body.querySelector('.accordion-inline-msg')
                        if (action === 'apply-all') {
                            if (state.stagingSegments.length === 0) {
                                if (msg) { msg.textContent = '请先在暂存区添加片段'; msg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            if (!await adjustmentConfirm('确定要将暂存区的 ' + state.stagingSegments.length + ' 个片段追加到同系列全部 ' + state.episodes.length + ' 集吗？（仅暂存，需点击「更新全部缓存」生效）', { container: popover })) return
                            setAccordionBtnsBusy(true)
                            try {
                                const mergedStaging = mergeSegments(state.stagingSegments)
                                let appendCount = 0
                                for (const ep of state.episodes) {
                                    const epId = String(ep.id)
                                    if (epId === state.bvid) continue // 跳过当前集
                                    // 追加到目标剧集的暂存区（不提交缓存）
                                    const existing = state.stagingMap[epId]?.segments || []
                                    const combined = mergeSegments([...existing, ...mergedStaging])
                                    state.stagingMap[epId] = { segments: combined, editingIndex: -1 }
                                    appendCount++
                                }
                                showInlineMsg('已追加到 ' + appendCount + ' 集的暂存区，点击「更新全部缓存」生效', 'success', 4000)
                            } catch (error) {
                                logger.error('跳过片段管理丨批量追加暂存失败:', error)
                                showInlineMsg('批量追加失败，请重试', 'warn', 4000)
                                setAccordionBtnsBusy(false)
                            }
                            await renderAccordionList(state.episodes)
                        } else if (action === 'clear-others') {
                            if (!await adjustmentConfirm('确定要清空同系列其他 ' + (state.episodes.length - 1) + ' 集的跳过片段吗？此操作不可撤销。', { container: popover })) return
                            setAccordionBtnsBusy(true)
                            try {
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
                                    } catch { /* 忽略异常 */ }
                                    clearedCount++
                                }
                                showInlineMsg('已清空 ' + clearedCount + ' 集的跳过片段', 'success', 4000)
                            } catch (error) {
                                logger.error('跳过片段管理丨批量清空失败:', error)
                                showInlineMsg('批量清空失败，请重试', 'warn', 4000)
                                setAccordionBtnsBusy(false)
                            }
                            await renderAccordionList(state.episodes)
                        } else if (action === 'update-append' || action === 'update-overwrite') {
                            if (state.stagingSegments.length === 0) {
                                if (msg) { msg.textContent = '请先在暂存区添加片段'; msg.className = 'accordion-inline-msg warn' }
                                return
                            }
                            const stagingSource = mergeSegments(state.stagingSegments)
                            // 计算最终要写入的片段：追加=保留已有+暂存；覆盖=用暂存替换选中（或全部）已有片段
                            let finalSegments
                            if (action === 'update-overwrite') {
                                const existing = (state.cached?.segments || []).length > 0 ? mergeSegments(state.cached.segments) : []
                                if (existing.length === 0) {
                                    finalSegments = stagingSource
                                } else {
                                    const picked = await selectSegmentsOverwrite(existing)
                                    if (picked === null) return
                                    finalSegments = picked === 'all'
                                        ? stagingSource
                                        : mergeSegments([...existing.filter((_, i) => !picked.includes(i)), ...stagingSource])
                                }
                            } else {
                                finalSegments = mergeSegments([...(state.cached?.segments || []), ...stagingSource])
                            }
                            setAccordionBtnsBusy(true)
                            try {
                                const uid = getCurrentUid()
                                const newCache = createCacheEntry(state.bvid, finalSegments, uid)
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
                                } catch { /* 忽略异常 */ }
                                state.cached = newCache
                                state.stagingSegments = []
                                state.editingIndex = -1
                                // 重建该集内容（暂存已清空、缓存已更新）
                                renderAccordionBody(body, ep)
                                // 重建后在新消息元素上给出结果提示
                                const newMsg = body.querySelector('.accordion-inline-msg')
                                if (newMsg) {
                                    newMsg.textContent = action === 'update-overwrite' ? '缓存已更新（覆盖）' : '缓存已更新（追加）'
                                    newMsg.className = 'accordion-inline-msg success'
                                }
                            } catch (error) {
                                logger.error('跳过片段管理丨更新缓存失败:', error)
                                setAccordionBtnsBusy(false)
                                if (msg) { msg.textContent = '更新缓存失败：' + (error?.message || '请稍后重试'); msg.className = 'accordion-inline-msg warn' }
                            }
                        }
                    })
                })
                // 绑定手动添加表单事件
                const accordionInputModeBtn = body.querySelector('.input-mode-btn')
                const accordionStartTime = body.querySelector('.accordion-start-time')
                const accordionEndTime = body.querySelector('.accordion-end-time')
                const accordionStartTime2 = body.querySelector('.accordion-start-time-2')
                const accordionDuration = body.querySelector('.accordion-duration')
                const accordionAddBtn = body.querySelector('.accordion-add-btn')
                const cancelEditBtn = body.querySelector('.accordion-cancel-edit-btn')
                const accordionInlineMsg = body.querySelector('.accordion-inline-msg')
                const timeInputsSE = body.querySelector('.time-inputs-start-end')
                const timeInputsSD = body.querySelector('.time-inputs-start-duration')
                let localInputMode = 'start-end'
                // 取消编辑
                cancelEditBtn.addEventListener('click', e => {
                    e.stopPropagation()
                    clearForm()
                    renderStagingList()
                })
                // 切换输入模式
                accordionInputModeBtn.addEventListener('click', e => {
                    e.stopPropagation()
                    if (localInputMode === 'start-end') {
                        localInputMode = 'start-duration'
                        state.inputMode = 'start-duration'
                        accordionInputModeBtn.textContent = '起始+时长'
                        timeInputsSE.style.display = 'none'
                        timeInputsSD.style.display = 'flex'
                    } else {
                        localInputMode = 'start-end'
                        state.inputMode = 'start-end'
                        accordionInputModeBtn.textContent = '起止时间'
                        timeInputsSE.style.display = 'flex'
                        timeInputsSD.style.display = 'none'
                    }
                })
                // 添加/保存编辑
                accordionAddBtn.addEventListener('click', e => {
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
                    // 冲突检测：排除自身（编辑模式下）
                    const otherSegs = state.stagingSegments.filter((_, i) => i !== state.editingIndex)
                    const conflict = validateSegment({ start, end }, otherSegs)
                    if (conflict) {
                        if (accordionInlineMsg) { accordionInlineMsg.textContent = conflict; accordionInlineMsg.className = 'accordion-inline-msg warn' }
                        return
                    }
                    if (state.editingIndex >= 0) {
                        // 编辑模式：更新已有片段
                        state.stagingSegments[state.editingIndex] = { start, end }
                    } else {
                        // 新增模式
                        state.stagingSegments.push({ start, end })
                    }
                    state.stagingSegments.sort((a, b) => a.start - b.start)
                    clearForm()
                    renderStagingList()
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
                // 初始渲染暂存区
                renderStagingList()
            }
            // ===== 番剧页：手风琴剧集列表相关函数 =====
            // 生成片段预览文本（如 "0:30-1:00, 5:15-5:45"）
            const formatSegmentPreview = segments => {
                if (!segments || segments.length === 0) return '无片段'
                const merged = mergeSegments(segments)
                return merged.slice(0, 3).map(seg => formatTime(seg.start) + '-' + formatTime(seg.end)).join(', ') + (merged.length > 3 ? '...' : '')
            }
            renderAccordionList = async episodes => {
                if (!episodes || episodes.length === 0) return
                state.bangumiView = 'accordion'
                state.currentEpisodeIndex = -1
                // 隐藏其他区域
                content.style.display = 'none'
                manualEntry.style.display = 'none'
                updateBtnsVisible(false)
                updateAllBtn.style.display = 'none'
                reIdentifyBtn.style.display = 'none'
                // 显示手风琴列表
                episodeAccordionEl.style.display = 'flex'
                // 手风琴模式下隐藏底部的「手动添加」和「重新识别」按钮（每个剧集有独立的操作按钮）
                manualBtn.style.display = 'none'
                // 先渲染基础结构（显示加载中）
                episodeAccordionEl.innerHTML = episodes.map((ep, i) => {
                    const epId = String(ep.id)
                    const isCurrent = epId === state.bvid
                    const epNum = ep.title ? ep.title.replace(/[^\d]/g, '') || String(i + 1) : String(i + 1)
                    // 标题仅为数字时显示「第x集」
                    const titleText = ep.title && /^\d+$/.test(ep.title.trim())
                        ? '第' + ep.title.trim() + '集'
                        : (ep.title || '')
                    const subTitle = ep.long_title ? ' ' + ep.long_title : ''
                    return '<div class="episode-accordion-item" data-ep-index="' + i + '" data-ep-id="' + epId + '">' +
                        '<div class="episode-accordion-header' + (isCurrent ? ' active' : '') + '" data-ep-index="' + i + '">' +
                        '<span class="episode-index">' + epNum + '</span>' +
                        '<span class="episode-title">' + titleText + subTitle + '</span>' +
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
                    } catch { /* 忽略异常 */ }
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
                        state.canUpdate = canUpdateCache(cached, getCurrentUid()) // 渲染编辑区
                        renderAccordionBody(body, episodes[index])
                        // 自动将当前集滚动到顶部
                        requestAnimationFrame(() => {
                            const header = item.querySelector('.episode-accordion-header')
                            if (header) {
                                episodeAccordionEl.scrollTop = 0
                                const itemTop = item.offsetTop - episodeAccordionEl.offsetTop
                                if (itemTop > 0) episodeAccordionEl.scrollTop = itemTop
                            }
                        })
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
                            // 收起前保存当前剧集的暂存区数据
                            if (state.bvid) {
                                const prevStaging = state.stagingMap[state.bvid] || { segments: [], editingIndex: -1 }
                                prevStaging.segments = [...state.stagingSegments]
                                prevStaging.editingIndex = state.editingIndex
                                state.stagingMap[state.bvid] = prevStaging
                            }
                            header.classList.remove('active')
                            body.classList.remove('expanded')
                            state.currentEpisodeIndex = -1
                        } else {
                            // 展开当前项
                            header.classList.add('active')
                            body.classList.add('expanded')
                            // 先保存上一个剧集的暂存区
                            if (state.bvid && state.bvid !== String(episodes[idx].id)) {
                                const prevStaging = state.stagingMap[state.bvid] || { segments: [], editingIndex: -1 }
                                prevStaging.segments = [...state.stagingSegments]
                                prevStaging.editingIndex = state.editingIndex
                                state.stagingMap[state.bvid] = prevStaging
                            }
                            // 加载该集的片段数据并渲染编辑区
                            const ep = episodes[idx]
                            const epId = String(ep.id)
                            state.currentEpisodeIndex = idx
                            state.bvid = epId
                            state.pendingSegments = []
                            // 从 stagingMap 恢复暂存区数据
                            const savedStaging = state.stagingMap[epId]
                            state.stagingSegments = savedStaging ? [...savedStaging.segments] : []
                            state.stagingSegments.sort((a, b) => a.start - b.start)
                            state.editingIndex = savedStaging ? savedStaging.editingIndex : -1
                            let cached = null
                            try {
                                cached = await storageService.adCacheGet(epId)
                            } catch { /* 忽略异常 */ }
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
            // 「更新全部缓存」按钮事件：将各集暂存区合并到缓存并提交
            updateAllBtn.addEventListener('click', async () => {
                // 先把当前展开集的工作副本同步进 stagingMap，避免直接点「更新全部缓存」漏掉刚编辑的暂存
                if (state.bvid && state.stagingSegments?.length > 0) {
                    state.stagingMap[state.bvid] = { segments: [...state.stagingSegments], editingIndex: state.editingIndex }
                }
                // 统计有暂存数据的集数
                let stagingCount = 0
                for (const ep of state.episodes) {
                    const epId = String(ep.id)
                    const stagingData = state.stagingMap[epId]
                    if (stagingData?.segments?.length > 0) stagingCount++
                }
                if (stagingCount === 0) {
                    showInlineMsg('暂存区无数据，无需更新')
                    return
                }
                const confirmResult = await adjustmentConfirm('将 ' + stagingCount + ' 集的暂存区数据合并到缓存，选择上传方式：', {
                    container: popover,
                    buttons: [
                        { key: 'cancel', label: '取消', className: 'secondary' },
                        { key: 'overwrite', label: '覆盖上传', className: 'danger' },
                        { key: 'append', label: '追加上传', className: 'primary' }
                    ]
                })
                if (confirmResult === 'cancel') return
                updateAllBtn.classList.add('disabled')
                updateAllBtn.style.pointerEvents = 'none'
                updateAllBtn.style.opacity = '0.5'
                const originalText = updateAllBtn.textContent
                updateAllBtn.textContent = '更新中...'
                showInlineMsg('正在更新 ' + stagingCount + ' 集缓存...', '', 0)
                try {
                    const uid = getCurrentUid()
                    let successCount = 0
                    for (const ep of state.episodes) {
                        const epId = String(ep.id)
                        // 读取已有缓存
                        let cached = null
                        try {
                            cached = await storageService.adCacheGet(epId)
                        } catch { /* 忽略异常 */ }
                        const existingSegments = cached?.segments || []
                        const stagingData = state.stagingMap[epId]
                        const stagingSegs = stagingData?.segments || []
                        if (stagingSegs.length === 0 && existingSegments.length === 0) continue
                        // 追加模式：合并已有+暂存；覆盖模式：仅用暂存
                        const merged = confirmResult === 'overwrite'
                            ? mergeSegments(stagingSegs)
                            : mergeSegments([...existingSegments, ...stagingSegs])
                        const cacheEntry = createCacheEntry(epId, merged, uid)
                        if (cached) {
                            cacheEntry.version = (cached.version || 0) + 1
                            cacheEntry.verified_by = [...new Set([...(cached.verified_by || []), uid].filter(Boolean))]
                        }
                        await storageService.adCacheSet(epId, cacheEntry)
                        try {
                            await fetch(SKIP_CACHE_API, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(cacheEntry)
                            })
                        } catch { /* 忽略异常 */ }
                        successCount++
                    }
                    // 清空所有剧集的暂存区
                    state.stagingMap = {}
                    state.stagingSegments = []
                    state.editingIndex = -1
                    // 刷新当前展开集的视图（暂存已清空）
                    if (state.currentEpisodeIndex >= 0 && state.episodes[state.currentEpisodeIndex]) {
                        const curIdx = state.currentEpisodeIndex
                        const curItem = episodeAccordionEl.querySelector('.episode-accordion-item[data-ep-index="' + curIdx + '"]')
                        const curBody = curItem && curItem.querySelector('.episode-accordion-body')
                        if (curBody) renderAccordionBody(curBody, state.episodes[curIdx])
                    }
                    showInlineMsg('已更新 ' + successCount + ' 集缓存', 'success', 4000)
                } catch (error) {
                    logger.error('跳过片段管理丨批量更新缓存失败:', error)
                    showInlineMsg('批量更新失败，请重试', 'warn', 5000)
                } finally {
                    updateAllBtn.classList.remove('disabled')
                    updateAllBtn.style.pointerEvents = ''
                    updateAllBtn.style.opacity = ''
                    updateAllBtn.textContent = originalText
                }
            })
            popover._mgr.renderAccordionList = renderAccordionList
            // 手动添加表单：添加片段到待定列表
            manualAddBtn.addEventListener('click', e => {
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
            manualBtn.addEventListener('click', e => {
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
                    state.pendingIdentify = true
                    const newCache = createCacheEntry(state.bvid, state.currentSegments, getCurrentUid())
                    renderSegments(state.currentSegments, newCache)
                    showInlineMsg('重新识别完成，共 ' + state.currentSegments.length + ' 段，可点击「覆盖更新」或「追加更新」生效', 'success', 5000)
                } catch (error) {
                    reIdentifyBtn.disabled = false
                    content.innerHTML = '<div class="error">识别失败: ' + error.message + '</div>'
                }
            })
            // 更新缓存：合并待定片段后保存
            // 主面板缓存提交（追加/覆盖共用），确保写入去重后数据
            // 主面板缓存提交（追加/覆盖共用），确保写入去重后数据
            const setMainBtnsBusy = busy => {
                [appendBtn, overwriteBtn].forEach(btn => {
                    if (!btn) return
                    if (busy) {
                        btn.dataset.originText = btn.textContent
                        btn.textContent = '更新中...'
                        btn.style.pointerEvents = 'none'
                        btn.style.opacity = '0.6'
                    } else {
                        btn.textContent = btn.dataset.originText || btn.textContent
                        btn.style.pointerEvents = ''
                        btn.style.opacity = ''
                    }
                })
            }
            const submitMainCache = async (finalSegments, label) => {
                setMainBtnsBusy(true)
                try {
                    finalSegments = mergeSegments(finalSegments)
                    const uid = getCurrentUid()
                    const newCache = createCacheEntry(state.bvid, finalSegments, uid)
                    if (state.cached) {
                        newCache.version = (state.cached.version || 0) + 1
                        newCache.verified_by = [...new Set([...(state.cached.verified_by || []), uid].filter(Boolean))]
                    }
                    await storageService.adCacheSet(state.bvid, newCache)
                    logger.info('跳过片段管理丨已更新本地缓存')
                    try {
                        await fetch(SKIP_CACHE_API, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newCache)
                        })
                        logger.info('跳过片段管理丨已更新远程缓存')
                    } catch { /* 忽略异常 */ }
                    state.cached = newCache
                    state.currentSegments = finalSegments
                    state.pendingSegments = []
                    state.pendingIdentify = false
                    renderPendingList()
                    self.advertisementIdentified = false
                    await self.identifyAdvertisementTimestamps()
                    renderSegments(finalSegments, state.cached)
                    showInlineMsg(label, 'success', 4000)
                } catch (error) {
                    logger.error('跳过片段管理丨更新缓存失败:', error)
                    showInlineMsg('更新缓存失败：' + (error?.message || '请稍后重试'), 'warn', 5000)
                } finally {
                    setMainBtnsBusy(false)
                }
            }
            // 待提交内容源：手动暂存 + AI 重新识别预览（识别结果未落库前可覆盖/追加上传）
            const getOverwriteSource = () => {
                const parts = []
                if (state.pendingIdentify && state.currentSegments && state.currentSegments.length > 0) parts.push(...state.currentSegments)
                if (state.pendingSegments && state.pendingSegments.length > 0) parts.push(...state.pendingSegments)
                return mergeSegments(parts)
            }
            // 覆盖选择层：让用户挑选要替换（移除）的已有片段
            // 返回 'all'（替换全部）/ 已勾选下标数组（未勾选的保留）/ null（取消）
            const selectSegmentsOverwrite = existingSegments => new Promise(resolve => {
                const overlay = document.createElement('div')
                overlay.className = 'adjustment-confirm-overlay'
                let listHtml = ''
                existingSegments.forEach((seg, i) => {
                    const timeStr = formatTime(seg.start) + ' - ' + formatTime(seg.end)
                    const sumHtml = seg.summary ? '<span class="ow-summary">' + escapeHtml(seg.summary) + '</span>' : ''
                    listHtml += '<label class="ow-item"><input type="checkbox" data-idx="' + i + '" checked><span class="ow-time">' + timeStr + '</span>' + sumHtml + '</label>'
                })
                overlay.innerHTML = '<div class="adjustment-confirm-dialog overwrite-select">'
                        + '<div class="adjustment-confirm-msg"><b>覆盖更新</b><div class="ow-hint">已有 ' + existingSegments.length + ' 段。勾选的片段将被新的待提交片段替换，<b>未勾选</b>的片段将保留。默认全选。</div>'
                        + '<div class="ow-list">' + listHtml + '</div></div>'
                        + '<div class="adjustment-confirm-btns">'
                        + '<div class="adjustment-button secondary" data-act="cancel">取消</div>'
                        + '<div class="adjustment-button danger" data-act="all">覆盖全部</div>'
                        + '<div class="adjustment-button primary" data-act="pick">覆盖选中(0)</div>'
                        + '</div></div>'
                // 用原生 popover（top layer）承载，确保盖在片段管理弹窗之上
                overlay.setAttribute('popover', 'manual')
                document.body.appendChild(overlay)
                if (typeof overlay.showPopover === 'function') overlay.showPopover()
                const updatePickBtn = () => {
                    const n = overlay.querySelectorAll('input[type="checkbox"]:checked').length
                    const pickBtn = overlay.querySelector('[data-act="pick"]')
                    pickBtn.textContent = '覆盖选中(' + n + ')'
                    pickBtn.style.pointerEvents = n > 0 ? '' : 'none'
                    pickBtn.style.opacity = n > 0 ? '' : '0.5'
                }
                updatePickBtn()
                overlay.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', updatePickBtn)
                })
                // 宿主弹窗关闭时同步收起（top layer 中的覆盖层）
                let hostToggleHandler = null
                if (popover) {
                    hostToggleHandler = ev => {
                        if (ev.newState === 'closed') {
                            overlay.remove()
                            resolve(null)
                        }
                    }
                    popover.addEventListener('toggle', hostToggleHandler)
                }
                const close = val => {
                    try { overlay.hidePopover() } catch { /* 忽略异常 */ }
                    if (hostToggleHandler) popover.removeEventListener('toggle', hostToggleHandler)
                    overlay.remove()
                    resolve(val)
                }
                overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null))
                overlay.querySelector('[data-act="all"]').addEventListener('click', () => close('all'))
                overlay.querySelector('[data-act="pick"]').addEventListener('click', () => {
                    const picked = [...overlay.querySelectorAll('input[type="checkbox"]:checked')].map(cb => parseInt(cb.dataset.idx, 10))
                    if (picked.length === 0) return
                    close(picked)
                })
                overlay.addEventListener('click', e => {
                    if (e.target === overlay) close(null)
                })
            })
            // 追加更新：保留已有缓存片段 + 待提交片段（均去重合并）
            appendBtn.addEventListener('click', async () => {
                const source = getOverwriteSource()
                if (source.length === 0) {
                    showInlineMsg('暂无可提交内容，请先手动添加片段或重新识别')
                    return
                }
                const existing = state.cached?.segments || []
                await submitMainCache(mergeSegments([...existing, ...source]), '缓存已更新（追加）')
            })
            // 覆盖更新：用待提交片段替换选中的已有片段（支持部分/全部），并清理识别预览
            overwriteBtn.addEventListener('click', async () => {
                const source = getOverwriteSource()
                if (source.length === 0) {
                    showInlineMsg('暂无可覆盖内容，请先手动添加片段或重新识别')
                    return
                }
                const existing = (state.cached?.segments || []).length > 0 ? mergeSegments(state.cached.segments) : []
                let finalSegments
                if (existing.length === 0) {
                    // 无已有片段：直接上传待提交内容
                    finalSegments = source
                } else {
                    const picked = await selectSegmentsOverwrite(existing)
                    if (picked === null) return
                    if (picked === 'all') {
                        finalSegments = source
                    } else {
                        const keep = existing.filter((_, i) => !picked.includes(i))
                        finalSegments = mergeSegments([...keep, ...source])
                    }
                }
                await submitMainCache(finalSegments, '缓存已更新（覆盖）')
            })
        }
        // --- 每次打开时更新状态并渲染 ---
        const { content, updateAllBtn, reIdentifyBtn, manualEntry, renderPendingList, renderSegments } = popover._mgr
        state.bvid = bvid
        state.currentSegments = []
        state.pendingSegments = []
        state.pendingIdentify = false
        renderPendingList()
        const uid = getCurrentUid()
        // ===== 番剧页：先打开弹窗再异步加载剧集列表 =====
        // 不因视频信息接口慢/挂起而导致点击管理无任何反应
        if (this.userConfigs.page_type === 'bangumi') {
            if (reIdentifyBtn) reIdentifyBtn.style.display = 'none'
            content.style.display = ''
            content.innerHTML = '<div class="loading">正在加载剧集列表...</div>'
            manualEntry.style.display = 'none'
            updateBtnsVisible(false)
            updateAllBtn.style.display = 'none'
            let videoInfo = null
            try {
                videoInfo = await biliApis.getVideoInformation('bangumi', bvid)
            } catch (error) {
                logger.debug('跳过片段管理丨获取番剧信息失败', error)
            }
            if (videoInfo?.episodes?.length > 0) {
                state.episodes = videoInfo.episodes
                // ss/季链接模式（id 带 ss 前缀）：没有可对应的当前分集，默认展开第一集作为编辑对象
                const seasonMode = typeof bvid === 'string' && bvid.startsWith('ss')
                if (seasonMode) {
                    state.bvid = String(state.episodes[0].id)
                }
                await renderAccordionList(state.episodes)
            } else {
                content.style.display = ''
                content.innerHTML = '<div class="error">获取剧集列表失败（接口超时或无法获取该番剧剧集），请刷新页面后重试</div>'
                const epAcc = document.getElementById('SkipSegmentManagerEpisodeAccordion')
                if (epAcc) epAcc.style.display = 'none'
                const mBtn = document.getElementById('SkipSegmentManagerManualBtn')
                if (mBtn) mBtn.style.display = 'none'
            }
            return
        }
        // ===== 普通视频页：原有逻辑 =====
        // 获取视频信息（用于检测字幕和系列信息）
        let videoInfo = null
        try {
            videoInfo = await biliApis.getVideoInformation('video', bvid)
        } catch (error) {
            logger.debug('跳过片段管理丨获取视频信息失败', error)
        }
        // 检测字幕，无字幕则隐藏「重新识别」按钮
        if (reIdentifyBtn) {
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
        // 先检查本地缓存
        const cached = await storageService.adCacheGet(bvid)
        const hasCache = cached && cached.segments
        state.currentSegments = hasCache ? [...cached.segments] : []
        state.cached = cached
        state.canUpdate = canUpdateCache(cached, uid)
        if (hasCache) {
            renderSegments(cached.segments, cached)
            manualEntry.style.display = 'none'
        } else {
            content.innerHTML = '<div class="loading">正在查询缓存...</div>'
            updateBtnsVisible(false)
            manualEntry.style.display = 'none'
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
            updateBtnsVisible(false)
            manualEntry.style.display = 'none'
        }
    },
    // 番剧页专用：仅从缓存加载跳过片段（片头片尾等），不执行AI识别
    async loadCachedSkipSegments () {
        if (!this.userConfigs.auto_skip) return
        if (this._skipCacheApplied) return
        const bvid = biliApis.getCurrentVideoID(window.location.href)
        // ss/季链接无法确定具体分集，跳过自动识别（可在片段管理弹窗内按集手动操作）
        if (!bvid || bvid === 'error' || (typeof bvid === 'string' && bvid.startsWith('ss'))) return
        // 先查本地缓存
        try {
            const cached = await storageService.adCacheGet(bvid)
            if (cached?.segments?.length > 0) {
                logger.info('跳过片段丨命中本地缓存，共', cached.segments.length, '个片段')
                this._markSkipCacheApplied()
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
                        logger.info('跳过片段丨命中远程缓存，共', segments.length, '个片段')
                        try { await storageService.adCacheSet(bvid, result.data) } catch { /* 忽略异常 */ }
                        this._markSkipCacheApplied()
                        this.autoSkipAdvertisementSegments(segments)
                        return segments
                    }
                }
            }
        } catch (error) {
            logger.debug('跳过片段丨远程缓存查询失败', error)
        }
        logger.debug('跳过片段丨未找到缓存数据')
    },
    // 标记「缓存片段已应用」：30 秒后自动复位，供本页新增片段后再次应用；SPA 切集时由 video.module 显式复位
    _markSkipCacheApplied () {
        this._skipCacheApplied = true
        setTimeout(() => { this._skipCacheApplied = false }, 30000)
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
    },
    // 锁定/解锁片段缓存（仅上传者本人操作）：locked=1 后他人无法修改，上传者解锁后可继续编辑
    async setCacheLocked (bvid, cacheEntry, locked) {
        if (!cacheEntry) return null
        const entry = { ...cacheEntry, locked: locked ? 1 : 0 }
        try {
            await storageService.adCacheSet(bvid, entry)
        } catch (error) {
            logger.error('跳过片段管理丨缓存锁定状态本地保存失败', error)
            return null
        }
        try {
            await fetch(SKIP_CACHE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            })
            logger.info('跳过片段管理丨缓存已' + (locked ? '锁定' : '解锁'))
        } catch (error) {
            logger.debug('跳过片段管理丨缓存锁定状态远程同步失败', error)
        }
        return entry
    }
}
