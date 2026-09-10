<template>
    <div class="skip-manager-bangumi adjustment-popover-content">
        <div v-if="error" class="error">{{ error }}</div>
        <template v-else-if="loading && episodesView.length === 0">
            <div class="loading">正在加载剧集列表...</div>
        </template>
        <template v-else>
            <!-- 剧集手风琴列表（当前展开/播放集置顶，其余保持原顺序） -->
            <div ref="accordionListEl" class="episode-accordion">
                <div v-for="(ep, i) in episodesView" :key="epId(ep)" class="episode-accordion-item">
                    <div class="episode-accordion-header" :class="{ active: expandedId === epId(ep) }" @click="toggleEpisode(epId(ep))">
                        <span class="episode-index">{{ epNum(ep, i) }}</span>
                        <span class="episode-title">{{ epTitle(ep) }}</span>
                        <span class="episode-segment-preview" :class="{ 'has-segments': previewOf(epId(ep)) !== '无片段' }">{{ previewOf(epId(ep)) }}</span>
                        <span class="accordion-arrow">▼</span>
                    </div>
                    <div v-if="expandedId === epId(ep)" class="episode-accordion-body expanded">
                        <!-- 锁定（仅上传者本人） -->
                        <div v-if="ownerLockVisible" class="accordion-owner-row">
                            <span>{{ lockedState }}</span>
                            <div class="adjustment-button accordion-lock-btn" :class="lockedStateText === '已锁定' ? 'info' : 'danger'" @click="toggleLock">
                                {{ lockedStateText === '已锁定' ? '解锁' : '锁定' }}
                            </div>
                        </div>
                        <!-- 已有片段（只读参考） -->
                        <div class="cached-section">
                            <div class="cached-section-header">
                                已有片段
                                <span v-if="cachedSegments.length > 0" class="cached-count">{{ cachedSegments.length }} 个</span>
                            </div>
                            <div v-if="cachedSegments.length === 0" class="empty-result">暂无缓存数据</div>
                            <div v-else class="segment-list cached-segment-list">
                                <div v-for="(seg, si) in cachedSegments" :key="'c' + si" class="segment-item cached-item">
                                    <span class="segment-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                                    <span v-if="seg.summary" class="segment-summary" :title="seg.summary">{{ seg.summary }}</span>
                                </div>
                            </div>
                        </div>
                        <!-- 暂存区 -->
                        <div class="staging-section">
                            <div class="staging-header">
                                暂存区
                                <span v-if="stagingView.length > 0" class="staging-count">{{ stagingView.length }} 个待提交</span>
                            </div>
                            <div class="staging-list">
                                <div v-if="stagingView.length === 0" class="empty-result">暂无待提交片段，请在下方添加</div>
                                <div v-else v-for="(seg, si) in stagingView" :key="'s' + si" class="staging-item" :class="{ editing: editing === si }">
                                    <span class="segment-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                                    <div class="staging-actions">
                                        <div class="staging-edit" title="编辑" @click.stop="startEdit(si)">✎</div>
                                        <div class="staging-delete" title="移除" @click.stop="removeStaging(si)">×</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- 手动添加表单 -->
                        <div class="accordion-manual-entry">
                            <div class="accordion-inline-msg" :class="epMsg.type">{{ epMsg.text }}</div>
                            <div class="manual-entry-form">
                                <div class="input-mode-toggle">
                                    <button class="input-mode-btn" type="button" title="切换输入模式" @click="toggleInputMode">{{ epMode === 'start-end' ? '起止时间' : '起始+时长' }}</button>
                                </div>
                                <template v-if="epMode === 'start-end'">
                                    <div class="time-inputs time-inputs-start-end">
                                        <div class="time-input-group"><label>开始</label><input v-model="sTime" class="time-input accordion-start-time" placeholder="0:00" type="text"></div>
                                        <span class="time-separator">-</span>
                                        <div class="time-input-group"><label>结束</label><input v-model="eTime" class="time-input accordion-end-time" placeholder="0:00" type="text"></div>
                                    </div>
                                </template>
                                <template v-else>
                                    <div class="time-inputs time-inputs-start-duration">
                                        <div class="time-input-group"><label>开始</label><input v-model="sTime" class="time-input accordion-start-time-2" placeholder="0:00" type="text"></div>
                                        <span class="time-separator">+</span>
                                        <div class="time-input-group"><label>跳过</label><input v-model="dur" class="time-input accordion-duration" placeholder="30s" type="text"></div>
                                    </div>
                                </template>
                                <div class="form-actions">
                                    <div class="adjustment-button info accordion-add-btn" @click="commitStaging">{{ viewEditing >= 0 ? '保存编辑' : '添加' }}</div>
                                    <div v-if="viewEditing >= 0" class="adjustment-button secondary accordion-cancel-edit-btn" @click="cancelEdit">取消编辑</div>
                                </div>
                            </div>
                        </div>
                        <!-- 单集操作 -->
                        <div class="accordion-actions">
                            <div class="adjustment-button secondary" :style="stagingView.length ? '' : 'opacity:.4;pointer-events:none;'" @click="applyToAll">应用到全部</div>
                            <div class="adjustment-button danger" @click="clearOthers">清空其他</div>
                            <div class="adjustment-button primary" :style="stagingView.length ? '' : 'opacity:.4;pointer-events:none;'" @click="updateEpisode('append')">追加更新</div>
                            <div class="adjustment-button danger" :style="stagingView.length ? '' : 'opacity:.4;pointer-events:none;'" @click="updateEpisode('overwrite')">覆盖更新</div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- 更新全部缓存 -->
            <div class="adjustment-buttonGroup bangumi-update-all">
                <div class="adjustment-button primary" :style="anyStaging ? '' : 'opacity:.5;pointer-events:none;'" @click="openUpdateAll">{{ allBusy ? '更新中...' : '更新全部缓存' }}</div>
            </div>
        </template>

        <!-- 内联消息（updateAll 进度/结果） -->
        <div v-show="message.text" class="inline-msg" :class="message.type">{{ message.text }}</div>

        <!-- 模态：覆盖选择 / 更新全部确认 -->
        <div v-if="modal" class="skip-ow-overlay" @click.self="closeModal(null)">
            <div class="adjustment-confirm-dialog overwrite-select">
                <div class="adjustment-confirm-msg">
                    <b v-if="modal.kind === 'overwrite'">覆盖更新</b>
                    <b v-else>批量更新缓存</b>
                    <template v-if="modal.kind === 'overwrite'">
                        <div class="ow-hint">已有 {{ modal.existing.length }} 段。勾选的片段将被新的待提交片段替换，<b>未勾选</b>的片段将保留。默认全选。</div>
                        <div class="ow-list">
                            <label v-for="(seg, i) in modal.existing" :key="i" class="ow-item">
                                <input v-model="modal.picked" type="checkbox" :value="i">
                                <span class="ow-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                                <span v-if="seg.summary" class="ow-summary">{{ seg.summary }}</span>
                            </label>
                        </div>
                    </template>
                    <template v-else-if="modal.kind === 'all-confirm'">
                        <div class="ow-hint">将 {{ modal.count }} 集暂存区数据合并到缓存，选择上传方式：</div>
                    </template>
                    <template v-else>
                        <div class="ow-hint">{{ modal.text }}</div>
                    </template>
                </div>
                <div class="adjustment-confirm-btns">
                    <div class="adjustment-button secondary" @click="closeModal(null)">取消</div>
                    <template v-if="modal.kind === 'overwrite'">
                        <div class="adjustment-button danger" @click="closeModal('all')">覆盖全部</div>
                        <div class="adjustment-button primary" :style="modal.picked.length ? '' : 'pointer-events:none;opacity:.5'" @click="closeModal('pick')">覆盖选中({{ modal.picked.length }})</div>
                    </template>
                    <template v-else-if="modal.kind === 'all-confirm'">
                        <div class="adjustment-button danger" @click="closeModal('overwrite')">覆盖上传</div>
                        <div class="adjustment-button primary" @click="closeModal('append')">追加上传</div>
                    </template>
                    <template v-else>
                        <div class="adjustment-button danger" @click="closeModal(true)">确定</div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { commitCache, loadEpisodesCache, commitBatch } from './skip-manager-service'
import { formatTime, mergeSegments, validateSegment, parseTime, parseDuration, getCurrentUid } from './pure'

const props = defineProps({
    bvid: { type: String, required: true },
    env: { type: Object, required: true }
})
const env = props.env
const uid = () => (env.uidProvider ? env.uidProvider() : getCurrentUid())

const tick = ref(0)
const bump = () => { tick.value++ }
const accordionListEl = ref(null)
const error = ref('')
const loading = ref(true)
const expandedId = ref(null)
const allBusy = ref(false)
const message = reactive({ text: '', type: '' })
const epMsg = reactive({ text: '', type: '' })
const modal = ref(null)
let modalResolve = null
// —— 视图数据全部为「普通结构」，渲染经 computed + tick 版本号触发，
//    彻底避开 Vue 响应式代理数组的迭代递归（此前 RangeError 栈溢出根因）——
const episodes = { value: [] } // 精简剧集 {id, ep_id, cid, title, long_title}
const cacheMap = {} // epId -> cached（普通对象）
const persistedStaging = { map: {} } // 各集暂存（普通对象）
const activeStaging = { value: [] } // 当前展开集暂存（普通数组）
const editingIndex = { value: -1 } // 当前编辑下标
const epMode = ref('start-end')
const sTime = ref('')
const eTime = ref('')
const dur = ref('')

const epId = ep => String(ep && ep.id != null ? ep.id : (ep && ep.ep_id != null ? ep.ep_id : ''))
/** 依据标题文本在剧集中匹配（兼容「第N集」/「上中下」/任意集名）：先精确匹配，再按候选长度降序包含匹配 */
const matchEpisodeByTitle = titleText => {
    const norm = s => String(s || '').replace(/\s+/g, '')
    const key = norm(titleText)
    if (!key) return null
    const labelsOf = ep => {
        const raw = String(ep.title || '').trim()
        const numLabel = /^\d+$/.test(raw) ? '第' + raw + '集' : raw
        const long = String(ep.long_title || '').trim()
        return [numLabel, [raw, long].filter(Boolean).join(' '), long].filter(Boolean).map(norm)
    }
    for (const ep of episodes.value) {
        if (labelsOf(ep).includes(key)) return epId(ep)
    }
    const cands = []
    episodes.value.forEach(ep => labelsOf(ep).forEach(l => cands.push({ ep, l })))
    cands.sort((a, b) => b.l.length - a.l.length)
    for (const { ep, l } of cands) {
        if (key.includes(l) || l.includes(key)) return epId(ep)
    }
    return null
}
/** 解析当前播放分集的 epId（用于默认展开），优先级：URL ep → 播放器视频 cid → 页面状态 → DOM 高亮 → 传入 id → null */
const resolveCurrentEpId = episodes => {
    const list = episodes.map(epId)
    const inList = v => list.includes(String(v))
    try {
        const m = window.location.pathname.match(/\/bangumi\/play\/ep(\d+)/)
        if (m && inList(m[1])) return m[1]
    } catch { /* 忽略异常 */ }
    // ss 季页/SPA 场景 URL 无 ep：从播放器正在播放的视频 src 提取 cid 反查当前集（纯 DOM，沙盒可用）
    try {
        const video = document.querySelector('#bilibili-player video, .bpx-player-video-wrap video')
        const src = video ? (video.currentSrc || video.getAttribute('src') || '') : ''
        const cidMatch = src.match(/[?&]cid=(\d+)/)
        if (cidMatch) {
            const hit = episodes.find(ep => String(ep.cid) === cidMatch[1])
            if (hit) return epId(hit)
        }
    } catch { /* 忽略异常 */ }
    try {
        const st = window.__INITIAL_STATE__
        let curId = null
        if (st && st.epInfo && st.epInfo.id != null) {
            curId = st.epInfo.id
        } else if (Array.isArray(st && st.epList)) {
            const cur = st.epList.find(e => e && (e.now === true || e.now === 1))
            if (cur) curId = cur.id != null ? cur.id : cur.ep_id
        }
        if (curId != null && inList(curId)) return String(curId)
    } catch { /* 忽略异常 */ }
    // #player-title 为当前播放分集标题（ss 季页也提供），兼容「第N集/上中下/任意集名」
    try {
        const pt = document.getElementById('player-title')
        const titleText = pt && pt.textContent ? pt.textContent.trim() : ''
        if (titleText) {
            const hit = matchEpisodeByTitle(titleText)
            if (hit) return hit
        }
    } catch { /* 忽略异常 */ }
    try {
        const active = [...document.querySelectorAll('a[href*="/bangumi/play/ep"]')].find(a => /(^|\s)(active|current)(\s|$)/.test(a.className || ''))
        const domId = active && active.getAttribute('href') ? active.getAttribute('href').match(/ep(\d+)/) : null
        if (domId && inList(domId[1])) return domId[1]
    } catch { /* 忽略异常 */ }
    // 从页面标题反查当前集（ss 季页播放中的标题通常为当前分集名）
    try {
        // ①「第 N 集」序号（顺序即 B 站剧集顺序）
        const nm = document.title.match(/第\s*(\d+)\s*集/)
        if (nm) {
            const n = Number(nm[1])
            if (n >= 1 && n <= episodes.length) return epId(episodes[n - 1])
        }
        // ②集名包含匹配（标题为集名且长度足够避免误判）
        const norm = s => String(s || '').replace(/\s+/g, '')
        const dt = norm(document.title)
        for (const ep of episodes) {
            const raw = String(ep.title || '').trim()
            const label = /^\d+$/.test(raw) ? '第' + raw + '集' : raw
            if (label && label.length >= 2 && dt.includes(label)) return epId(ep)
        }
    } catch { /* 忽略异常 */ }
    if (inList(props.bvid)) return String(props.bvid)
    return null
}
const epNum = (ep, i) => {
    const t = (ep.title || '').replace(/[^\d]/g, '')
    return t || String(i + 1)
}
const epTitle = ep => {
    const t = (ep.title || '').trim()
    const label = /^\d+$/.test(t) ? '第' + t + '集' : t
    const long = ep.long_title ? ' ' + ep.long_title : ''
    return label + long
}
// —— 渲染视图（普通数据经 tick 触发重算）——
const episodesView = computed(() => {
    void tick.value
    return episodes.value
})
const stagingView = computed(() => {
    void tick.value
    return activeStaging.value
})
const viewEditing = computed(() => {
    void tick.value
    return editingIndex.value
})
const cachedSegments = computed(() => {
    void tick.value
    const c = cacheMap[expandedId.value]
    return c && c.segments ? mergeSegments(c.segments) : []
})
const ownerLockVisible = computed(() => {
    void tick.value
    const c = cacheMap[expandedId.value]
    return !!(c && c.uploader_uid && c.uploader_uid === uid())
})
const lockedState = computed(() => {
    void tick.value
    const c = cacheMap[expandedId.value]
    return c && c.locked ? '已锁定：他人无法修改此集数据' : '未锁定：他人可修改'
})
const lockedStateText = computed(() => {
    void tick.value
    const c = cacheMap[expandedId.value]
    return c && c.locked ? '已锁定' : '未锁定'
})
const anyStaging = computed(() => {
    void tick.value
    return Object.values(persistedStaging.map).some(s => s && s.segments && s.segments.length > 0)
})
const previewOf = id => {
    void tick.value
    const c = cacheMap[id]
    if (!c || !c.segments || c.segments.length === 0) return '无片段'
    const merged = mergeSegments(c.segments)
    return merged.slice(0, 3).map(s => formatTime(s.start) + '-' + formatTime(s.end)).join(', ') + (merged.length > 3 ? '...' : '')
}
const showMsg = (text, type = '', duration = 3000) => {
    message.text = text
    message.type = type
    if (duration > 0) {
        clearTimeout(showMsg._t)
        showMsg._t = setTimeout(() => {
            message.text = ''
            message.type = ''
        }, duration)
    }
}
const showEpMsg = (text, type = 'warn', duration = 3000) => {
    epMsg.text = text
    epMsg.type = type
    if (duration > 0) {
        clearTimeout(showEpMsg._t)
        showEpMsg._t = setTimeout(() => {
            epMsg.text = ''
            epMsg.type = ''
        }, duration)
    }
}

const saveActiveToMap = () => {
    if (!expandedId.value) return
    persistedStaging.map[expandedId.value] = { segments: [...activeStaging.value], editingIndex: editingIndex.value }
    bump()
}
const syncActiveFromMap = () => {
    const saved = persistedStaging.map[expandedId.value]
    activeStaging.value = saved && saved.segments ? [...saved.segments].sort((a, b) => a.start - b.start) : []
    editingIndex.value = saved && typeof saved.editingIndex === 'number' ? saved.editingIndex : -1
    bump()
}

const toggleEpisode = async id => {
    if (expandedId.value === id) {
        saveActiveToMap()
        expandedId.value = null
        return
    }
    saveActiveToMap()
    expandedId.value = id
    syncActiveFromMap()
    // 展开后把列表滚动到当前条目（保持原顺序，对齐旧实现 renderAccordionList 行为）
    nextTick(() => requestAnimationFrame(scrollToExpanded))
}
/** 列表滚动到当前展开条目的标题处（top-layer 弹窗内 offsetTop 不可靠，用视口矩形差值） */
const scrollToExpanded = () => {
    const el = accordionListEl.value
    if (!el) return
    const header = el.querySelector('.episode-accordion-header.active')
    if (!header) return
    const elRect = el.getBoundingClientRect()
    const headerRect = header.getBoundingClientRect()
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0
    // header 滚动到容器内容顶（含内边距）：向下滚用正增量，向上滚用负增量
    el.scrollTop += headerRect.top - elRect.top - padTop
}
const toggleLock = async () => {
    const id = expandedId.value
    const entry = cacheMap[id]
    if (!entry || !env.lockCache) return
    try {
        const next = await env.lockCache(id, entry, !entry.locked)
        if (next) {
            cacheMap[id] = next
            showEpMsg(next.locked ? '已锁定，他人将无法修改此集数据' : '已解锁，他人可再次修改', 'success', 4000)
            bump()
        }
    } catch (error) {
        showEpMsg('操作失败，请稍后重试')
    }
}

const toggleInputMode = () => {
    epMode.value = epMode.value === 'start-end' ? 'start-duration' : 'start-end'
    sTime.value = ''
    eTime.value = ''
    dur.value = ''
}
const clearForm = () => {
    editingIndex.value = -1
    sTime.value = ''
    eTime.value = ''
    dur.value = ''
    bump()
}
const commitStaging = () => {
    let start = null
    let end = null
    if (epMode.value === 'start-end') {
        if (!sTime.value.trim() || !eTime.value.trim()) { showEpMsg('请输入开始和结束时间'); return }
        start = parseTime(sTime.value.trim())
        end = parseTime(eTime.value.trim())
        if (start === null || end === null) { showEpMsg('时间格式错误，请使用 M:SS 或秒数'); return }
        if (start >= end) { showEpMsg('开始时间必须小于结束时间'); return }
    } else {
        if (!sTime.value.trim() || !dur.value.trim()) { showEpMsg('请输入开始时间和跳过时长'); return }
        start = parseTime(sTime.value.trim())
        const d = parseDuration(dur.value.trim())
        if (start === null) { showEpMsg('开始时间格式错误'); return }
        if (d === null || d <= 0) { showEpMsg('跳过时长格式错误，请输入正数（支持 30s, 1m30s, 90 等格式）'); return }
        end = start + d
    }
    const others = activeStaging.value.filter((_, i) => i !== editingIndex.value)
    const conflict = validateSegment({ start, end }, others)
    if (conflict) { showEpMsg(conflict); return }
    if (editingIndex.value >= 0) {
        activeStaging.value.splice(editingIndex.value, 1, { start, end })
    } else {
        activeStaging.value.push({ start, end })
    }
    activeStaging.value.sort((a, b) => a.start - b.start)
    clearForm()
    saveActiveToMap()
}
const startEdit = i => {
    const seg = activeStaging.value[i]
    editingIndex.value = i
    if (epMode.value === 'start-end') {
        sTime.value = formatTime(seg.start)
        eTime.value = formatTime(seg.end)
    } else {
        sTime.value = formatTime(seg.start)
        const d = seg.end - seg.start
        dur.value = d >= 60 ? Math.floor(d / 60) + 'm' + (d % 60 > 0 ? d % 60 + 's' : '') : d + 's'
    }
    bump()
}
const removeStaging = i => {
    activeStaging.value.splice(i, 1)
    if (editingIndex.value === i) clearForm()
    else if (editingIndex.value > i) editingIndex.value--
    saveActiveToMap()
    bump()
}
const cancelEdit = () => {
    clearForm()
}

const closeModal = value => {
    if (modalResolve) modalResolve(value)
    modal.value = null
    modalResolve = null
}

const updateEpisode = async kind => {
    if (activeStaging.value.length === 0) { showEpMsg('请先在暂存区添加片段'); return }
    const id = expandedId.value
    const source = mergeSegments(activeStaging.value)
    const cached = cacheMap[id]
    const existing = cached && cached.segments && cached.segments.length > 0 ? mergeSegments(cached.segments) : []
    let finalSegments
    if (kind === 'append') {
        finalSegments = mergeSegments([...existing, ...source])
    } else {
        if (existing.length === 0) {
            finalSegments = source
        } else {
            const picked = await new Promise(resolve => {
                modal.value = { kind: 'overwrite', existing, picked: existing.map((_, i) => i) }
                modalResolve = v => {
                    if (v === 'pick') resolve(modal.value ? modal.value.picked : [])
                    else resolve(v)
                }
            }).finally(() => {
                if (modal.value) { modal.value = null; modalResolve = null }
            })
            if (picked === null) return
            if (picked === 'all') finalSegments = source
            else finalSegments = mergeSegments([...existing.filter((_, i) => !picked.includes(i)), ...source])
        }
    }
    try {
        const result = await commitCache(env, id, cached, finalSegments)
        cacheMap[id] = result.cached
        activeStaging.value = []
        editingIndex.value = -1
        persistedStaging.map[id] = { segments: [], editingIndex: -1 }
        showEpMsg(kind === 'append' ? '缓存已更新（追加）' : '缓存已更新（覆盖）', 'success')
        bump()
    } catch (error) {
        showEpMsg('更新缓存失败：' + (error && error.message ? error.message : '请稍后重试'))
    }
}

const applyToAll = async () => {
    const id = expandedId.value
    if (activeStaging.value.length === 0) { showEpMsg('请先在暂存区添加片段'); return }
    const source = mergeSegments(activeStaging.value)
    for (const ep of episodes.value) {
        const eid = epId(ep)
        if (eid === id) continue
        const cur = persistedStaging.map[eid] || { segments: [], editingIndex: -1 }
        persistedStaging.map[eid] = { segments: mergeSegments([...cur.segments, ...source]), editingIndex: -1 }
    }
    showEpMsg('已同步暂存到同系列其他集（可点「更新全部缓存」生效）', 'success', 4000)
    bump()
}
const clearOthers = async () => {
    if (episodes.value.length <= 1) { showEpMsg('当前无其他集可清空'); return }
    const id = expandedId.value
    const items = []
    for (const ep of episodes.value) {
        const eid = epId(ep)
        if (eid === id) continue
        const cur = cacheMap[eid]
        if (cur && cur.segments && cur.segments.length > 0) {
            items.push({ episodeId: eid, cached: cur, replaceSegments: [] })
        }
        persistedStaging.map[eid] = { segments: [], editingIndex: -1 }
    }
    if (items.length === 0) { showEpMsg('同系列其他集均无缓存片段'); return }
    const ok = await confirmEp('确定要清空同系列其他 ' + items.length + ' 集的跳过片段吗？此操作不可撤销。')
    if (!ok) return
    try {
        await commitBatch(env, items)
        for (const ep of episodes.value) {
            const eid = epId(ep)
            if (eid !== id) cacheMap[eid] = { ...(cacheMap[eid] || {}), segments: [], last_updated: Date.now() }
        }
        showEpMsg('已清空 ' + items.length + ' 集的跳过片段', 'success', 4000)
        bump()
    } catch (error) {
        showEpMsg('批量清空失败，请重试')
    }
}
const confirmEp = text => new Promise(resolve => {
    modal.value = { kind: 'confirm', text, picked: [] }
    modalResolve = resolve
})

const openUpdateAll = async () => {
    saveActiveToMap()
    const count = Object.values(persistedStaging.map).filter(s => s && s.segments && s.segments.length > 0).length
    if (count === 0) { showMsg('暂存区无数据，无需更新'); return }
    const mode = await new Promise(resolve => {
        modal.value = { kind: 'all-confirm', count, picked: [] }
        modalResolve = resolve
    }).finally(() => {
        if (modal.value && modal.value.kind === 'all-confirm') { modal.value = null; modalResolve = null }
    })
    if (!mode || mode === 'cancel') return
    allBusy.value = true
    showMsg('正在更新 ' + count + ' 集缓存...', '', 0)
    try {
        const items = []
        for (const ep of episodes.value) {
            const eid = epId(ep)
            const stagingSegs = (persistedStaging.map[eid] && persistedStaging.map[eid].segments) || []
            const cached = cacheMap[eid] || null
            if (stagingSegs.length === 0 && !(cached && cached.segments && cached.segments.length > 0)) continue
            items.push({
                episodeId: eid,
                cached,
                addSegments: stagingSegs,
                replaceSegments: mode === 'overwrite' ? mergeSegments(stagingSegs) : undefined
            })
        }
        const done = await commitBatch(env, items)
        for (const ep of episodes.value) {
            const eid = epId(ep)
            try {
                const fresh = await env.storage.adCacheGet(eid)
                if (fresh) cacheMap[eid] = fresh
            } catch (error) { /* 忽略异常 */ }
        }
        for (const k of Object.keys(persistedStaging.map)) persistedStaging.map[k] = { segments: [], editingIndex: -1 }
        activeStaging.value = []
        editingIndex.value = -1
        showMsg('已更新 ' + done + ' 集缓存', 'success', 4000)
        bump()
    } catch (error) {
        showMsg('批量更新失败，请重试', 'warn', 5000)
    } finally {
        allBusy.value = false
    }
}

onMounted(async () => {
    const id = props.bvid
    let info = null
    try {
        info = await env.season(id)
        console.info('[BA-Bangumi] season 返回 episodes 数量 =', info && info.episodes ? info.episodes.length : '无 episodes 字段')
    } catch (err) {
        console.warn('[BA-Bangumi] 加载番剧失败：', err && err.message ? err.message : err)
    }
    if (info && Array.isArray(info.episodes) && info.episodes.length > 0) {
        // 仅保留渲染所需最小字段，避免把 B 站接口大对象整块放入响应式（深代理递归/性能）
        episodes.value = info.episodes.map(raw => ({
            id: raw.id != null ? raw.id : raw.ep_id,
            ep_id: raw.ep_id != null ? raw.ep_id : raw.id,
            cid: raw.cid != null ? raw.cid : null,
            title: raw.title,
            long_title: raw.long_title
        }))
        loading.value = false
        // 默认展开当前播放分集（URL ep → 页面状态 → DOM 高亮 → 传入 id → 首集兜底）
        const target = resolveCurrentEpId(episodes.value) || epId(episodes.value[0])
        // 列表已可渲染；缓存装载/展开等辅助步骤异常仅告警，不覆盖界面
        try {
            const result = await loadEpisodesCache(env, episodes.value.map(ep => epId(ep)))
            result.forEach((cached, eid) => {
                cacheMap[eid] = cached
            })
            expandedId.value = target
            syncActiveFromMap()
            bump()
            nextTick(() => requestAnimationFrame(scrollToExpanded))
        } catch (err) {
            console.warn('[BA-Bangumi] 装载剧集数据异常（列表仍可用）：', err && err.message ? err.message : err)
            expandedId.value = target
            bump()
            nextTick(() => requestAnimationFrame(scrollToExpanded))
        }
    } else {
        loading.value = false
        error.value = '获取剧集列表失败（接口超时或无法获取该番剧剧集），请刷新页面后重试'
    }
})
</script>

<style scoped>
.skip-manager-bangumi {
    position: relative;
}
.bangumi-update-all {
    margin-top: 12px;
}
.skip-ow-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--adj-z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--adj-bg-scrim, rgba(0, 0, 0, 0.5));
}
</style>
