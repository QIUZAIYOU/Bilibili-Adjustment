<template>
    <div class="skip-manager-main adjustment-popover-content">
        <!-- 内容区：加载 / 识别错误 / 缓存信息 + 片段列表 -->
        <div v-if="loading" class="loading">正在查询缓存...</div>
        <div v-else-if="recognizeError" class="error">{{ recognizeError }}</div>
        <template v-else>
            <div v-if="cacheInfoVisible" class="cache-info">
                <div class="cache-meta">上传者 UID: {{ metaUid }}</div>
                <div class="cache-meta">更新时间: {{ metaTime }}</div>
                <div class="cache-meta">版本: v{{ metaVersion }}</div>
                <div v-if="lockVisible" class="cache-meta cache-lock-row">
                    <span class="cache-lock-state">{{ lockText }}</span>
                    <div class="cache-lock-btn adjustment-button" :class="lockedView ? 'info' : 'danger'" @click.stop="toggleLock" :style="lockBusy ? 'pointer-events:none;opacity:.5' : ''">
                        {{ lockedView ? '解锁' : '锁定' }}
                    </div>
                </div>
            </div>
            <template v-if="showNoData">
                <div class="empty-result">暂无跳过片段数据</div>
                <div class="empty-tip">可点击下方「手动添加」填写片头片尾等固定片段，或点击「重新识别」通过 AI 识别</div>
            </template>
            <template v-else-if="currentView.length === 0">
                <div class="empty-result">未识别到需要跳过的片段</div>
            </template>
            <template v-else>
                <div class="segment-count">共 {{ currentView.length }} 个片段：</div>
                <div class="segment-list">
                    <div v-for="(seg, i) in currentView" :key="seg.start + '-' + seg.end" class="segment-item">
                        <span class="segment-index">{{ i + 1 }}.</span>
                        <span class="segment-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                        <span v-if="seg.summary" class="segment-summary" :title="seg.summary">{{ seg.summary }}</span>
                        <span v-if="segmentEditable" class="segment-edit" title="编辑" @click="editExisting(i)">✎</span>
                        <div class="segment-delete" title="删除" @click="removeSegment(i)">×</div>
                    </div>
                </div>
                <div v-if="clearableExisting" class="adjustment-button danger clear-existing-btn" @click="clearExisting">清空已有片段</div>
            </template>
        </template>

        <!-- 手动添加表单 -->
        <div v-show="manualOpen" class="manual-entry-section">
            <div class="manual-entry-form">
                <div class="input-mode-toggle">
                    <button class="input-mode-btn" type="button" title="切换输入模式" @click="toggleInputMode">
                        {{ inputMode === 'start-end' ? '起止时间' : '起始+时长' }}
                    </button>
                </div>
                <template v-if="inputMode === 'start-end'">
                    <div class="time-inputs">
                        <div class="time-input-group"><label>开始</label><input v-model="startTime" type="text" class="time-input" placeholder="0:00"></div>
                        <span class="time-separator">-</span>
                        <div class="time-input-group"><label>结束</label><input v-model="endTime" type="text" class="time-input" placeholder="0:00"></div>
                    </div>
                </template>
                <template v-else>
                    <div class="time-inputs">
                        <div class="time-input-group"><label>开始</label><input v-model="startTime" type="text" class="time-input" placeholder="0:00"></div>
                        <span class="time-separator">+</span>
                        <div class="time-input-group"><label>跳过</label><input v-model="duration" type="text" class="time-input" placeholder="30s"></div>
                    </div>
                </template>
                <div class="adjustment-button info manual-add-btn" @click="addOrSave">{{ editingExistingIndex >= 0 ? '保存修改' : '添加' }}</div>
                <div v-if="editingExistingIndex >= 0" class="adjustment-button secondary cancel-edit-btn" @click="cancelExistingEdit">取消编辑</div>
            </div>
            <div v-if="pendingView.length > 0" class="pending-list">
                <div v-for="(seg, i) in pendingView" :key="'p' + i" class="pending-item">
                    <span class="segment-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                    <div class="pending-delete" title="移除" @click="removePending(i)">×</div>
                </div>
            </div>
        </div>

        <!-- 按钮组 -->
        <div class="adjustment-buttonGroup">
            <div class="adjustment-button secondary" @click="manualOpen = !manualOpen">手动添加</div>
            <div v-if="showReIdentify" class="adjustment-button secondary" :style="(busy || identifying) ? 'pointer-events:none;opacity:.6' : ''" @click="reIdentify">{{ identifying ? '正在识别...' : '重新识别' }}</div>
            <div v-if="canSubmit" class="adjustment-button primary" :style="busy ? 'pointer-events:none;opacity:.6' : ''" @click="appendUpdate">
                {{ busy ? '更新中...' : '追加更新' }}
            </div>
            <div v-if="canSubmit" class="adjustment-button danger" :style="busy ? 'pointer-events:none;opacity:.6' : ''" @click="overwriteUpdate">
                {{ busy ? '更新中...' : '覆盖更新' }}
            </div>
        </div>

        <!-- 内联消息 -->
        <div v-show="messageText" class="inline-msg" :class="messageType">{{ messageText }}</div>

        <!-- 覆盖选择层 -->
        <div v-if="overlay" class="skip-ow-overlay" @click.self="overlayResolve(null)">
            <div class="adjustment-confirm-dialog overwrite-select">
                <div class="adjustment-confirm-msg">
                    <b>覆盖更新</b>
                    <div class="ow-hint">已有 {{ overlay.existing.length }} 段。勾选的片段将被新的待提交片段替换，<b>未勾选</b>的片段将保留。默认全选。</div>
                    <div class="ow-list">
                        <label v-for="(seg, i) in overlay.existing" :key="i" class="ow-item">
                            <input v-model="overlay.picked" type="checkbox" :value="i">
                            <span class="ow-time">{{ formatTime(seg.start) }} - {{ formatTime(seg.end) }}</span>
                            <span v-if="seg.summary" class="ow-summary">{{ seg.summary }}</span>
                        </label>
                    </div>
                </div>
                <div class="adjustment-confirm-btns">
                    <div class="adjustment-button secondary" @click="overlayResolve(null)">取消</div>
                    <div class="adjustment-button danger" @click="overlayResolve('all')">覆盖全部</div>
                    <div class="adjustment-button primary" :style="overlay.picked.length ? '' : 'pointer-events:none;opacity:.5'" @click="overlayResolve('pick')">
                        覆盖选中({{ overlay.picked.length }})
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { loadCache, commitCache, detectSubtitles } from './skip-manager-service'
import { formatTime, mergeSegments, validateSegment, parseTime, parseDuration, canUpdateCache, getCurrentUid } from './pure'

const props = defineProps({
    bvid: { type: String, required: true },
    env: { type: Object, required: true }
})
const env = props.env
const uid = () => (env.uidProvider ? env.uidProvider() : getCurrentUid())

// —— 视图数据全部为「普通结构 + tick 版本号」，避免响应式代理数组迭代递归（栈溢出）——
const tick = ref(0)
const bump = () => { tick.value++ }
let cached = null // 缓存条目（普通对象）
let currentSegments = [] // 合并后的展示片段（普通数组）
let pendingSegments = [] // 待提交片段（普通数组）
let canUpdate = true
const inputMode = ref('start-end')
const loading = ref(true)
const recognizeError = ref('')
const manualOpen = ref(false)
const busy = ref(false)
const lockBusy = ref(false)
const showReIdentify = ref(false)
const identifyPreview = ref(false)
const identifying = ref(false)
const editingExistingIndex = ref(-1)
const messageText = ref('')
const messageType = ref('')
const startTime = ref('')
const endTime = ref('')
const duration = ref('')
const overlay = ref(null)
let overlayResolveFn = null

// —— 渲染视图 ——
const currentView = computed(() => { void tick.value; return currentSegments })
const pendingView = computed(() => { void tick.value; return pendingSegments })
const cacheInfoVisible = computed(() => { void tick.value; return Boolean(cached) || identifyPreview.value })
const metaUid = computed(() => { void tick.value; return (cached ? cached.uploader_uid : uid()) || '未知' })
const metaTime = computed(() => {
    void tick.value
    const t = cached ? cached.last_updated : Date.now()
    return new Date(t).toLocaleString('zh-CN')
})
const metaVersion = computed(() => { void tick.value; return cached ? cached.version || 1 : 1 })
const lockedView = computed(() => { void tick.value; return Boolean(cached && cached.locked) })
const lockVisible = computed(() => { void tick.value; return Boolean(cached && cached.uploader_uid && cached.uploader_uid === uid()) })
const lockText = computed(() => (lockedView.value ? '已锁定：他人无法修改此数据' : '未锁定：他人可修改'))
const showNoData = computed(() => { void tick.value; return !cached && !identifyPreview.value && currentSegments.length === 0 })
const canSubmit = computed(() => { void tick.value; return !loading.value && canUpdate && (currentSegments.length > 0 || pendingSegments.length > 0) })
// 已有片段可编辑（未锁定；识别预览 cached 为空也可编辑后一并落库）
const segmentEditable = computed(() => { void tick.value; return canUpdate && !(cached && cached.locked) })
// 可清空：存在缓存中的已有片段且未锁定
const clearableExisting = computed(() => { void tick.value; return Boolean(canUpdate && cached && cached.segments && cached.segments.length > 0 && !cached.locked) })

const showMessage = (text, type = '', durationMs = 3000) => {
    messageText.value = text
    messageType.value = type
    if (durationMs > 0) {
        clearTimeout(showMessage._t)
        showMessage._t = setTimeout(() => {
            messageText.value = ''
            messageType.value = ''
        }, durationMs)
    }
}

const load = async () => {
    loading.value = true
    recognizeError.value = ''
    identifyPreview.value = false
    detectSubtitles(env, props.bvid).then(ok => {
        showReIdentify.value = ok
    }).catch(() => { showReIdentify.value = false })
    try {
        const { cached: entry } = await loadCache(env, props.bvid)
        cached = entry
        currentSegments = entry && entry.segments ? mergeSegments([...entry.segments]) : []
        canUpdate = canUpdateCache(entry, uid())
    } catch (error) {
        cached = null
        currentSegments = []
        canUpdate = true
    } finally {
        loading.value = false
        bump()
    }
}

const toggleInputMode = () => {
    inputMode.value = inputMode.value === 'start-end' ? 'start-duration' : 'start-end'
    startTime.value = ''
    endTime.value = ''
    duration.value = ''
}

const addPending = () => {
    let start = null
    let end = null
    if (inputMode.value === 'start-end') {
        if (!startTime.value.trim() || !endTime.value.trim()) {
            showMessage('请输入开始和结束时间', 'warn')
            return
        }
        start = parseTime(startTime.value.trim())
        end = parseTime(endTime.value.trim())
        if (start === null || end === null) {
            showMessage('时间格式错误，请使用 M:SS 或秒数', 'warn')
            return
        }
        if (start >= end) {
            showMessage('开始时间必须小于结束时间', 'warn')
            return
        }
    } else {
        if (!startTime.value.trim() || !duration.value.trim()) {
            showMessage('请输入开始时间和跳过时长', 'warn')
            return
        }
        start = parseTime(startTime.value.trim())
        const dur = parseDuration(duration.value.trim())
        if (start === null) {
            showMessage('开始时间格式错误，请使用 M:SS 或秒数', 'warn')
            return
        }
        if (dur === null || dur <= 0) {
            showMessage('跳过时长格式错误，请输入正数（支持 30s, 1m30s, 90 等格式）', 'warn')
            return
        }
        end = start + dur
    }
    const allSegments = [...currentSegments, ...pendingSegments]
    const conflict = validateSegment({ start, end }, allSegments)
    if (conflict) {
        showMessage(conflict, 'warn')
        return
    }
    pendingSegments.push({ start, end })
    pendingSegments.sort((a, b) => a.start - b.start)
    bump()
    startTime.value = ''
    endTime.value = ''
    duration.value = ''
}

// 表单统一入口：编辑已有片段时进入「保存修改」，否则走手动添加
const addOrSave = () => {
    if (editingExistingIndex.value >= 0) {
        saveExistingEdit()
        return
    }
    addPending()
}
const editExisting = i => {
    if (i < 0 || i >= currentSegments.length) return
    const seg = currentSegments[i]
    editingExistingIndex.value = i
    manualOpen.value = true
    inputMode.value = 'start-end'
    startTime.value = formatTime(seg.start)
    endTime.value = formatTime(seg.end)
    duration.value = ''
}
const cancelExistingEdit = () => {
    editingExistingIndex.value = -1
    startTime.value = ''
    endTime.value = ''
    duration.value = ''
}
const saveExistingEdit = () => {
    const i = editingExistingIndex.value
    if (i < 0 || i >= currentSegments.length) {
        cancelExistingEdit()
        return
    }
    const startStr = startTime.value.trim()
    const endStr = endTime.value.trim()
    if (!startStr || !endStr) {
        showMessage('请输入开始和结束时间', 'warn')
        return
    }
    const start = parseTime(startStr)
    const end = parseTime(endStr)
    if (start === null || end === null) {
        showMessage('时间格式错误，请使用 M:SS 或秒数', 'warn')
        return
    }
    if (start >= end) {
        showMessage('开始时间必须小于结束时间', 'warn')
        return
    }
    const others = currentSegments.filter((_, idx) => idx !== i)
    const conflict = validateSegment({ start, end }, others)
    if (conflict) {
        showMessage(conflict, 'warn')
        return
    }
    const next = [...currentSegments]
    next[i] = { start, end }
    const final = mergeSegments(next)
    editingExistingIndex.value = -1
    startTime.value = ''
    endTime.value = ''
    duration.value = ''
    // keepPending=true：编辑已有片段不影响待提交列表；识别预览则一并落库（identifyPreview 在 commit 内清除）
    commit(final, '缓存已更新（修改片段）', true)
}
const clearExisting = async () => {
    if (!clearableExisting.value) return
    if (!window.confirm('确定要清空全部已有片段吗？此操作不可撤销。')) return
    await commit([], '已清空已有片段', true)
}

const removePending = index => {
    pendingSegments.splice(index, 1)
    bump()
}
const removeSegment = index => {
    currentSegments.splice(index, 1)
    bump()
}

const toggleLock = async () => {
    if (!cached || !env.lockCache) return
    lockBusy.value = true
    try {
        const entry = await env.lockCache(props.bvid, cached, !cached.locked)
        if (entry) {
            cached = entry
            currentSegments = entry && entry.segments ? mergeSegments([...entry.segments]) : []
            canUpdate = canUpdateCache(entry, uid())
            showMessage(entry.locked ? '已锁定，他人将无法修改此片段数据' : '已解锁，他人可再次修改', 'success', 4000)
            bump()
        }
    } catch (error) {
        showMessage('操作失败，请稍后重试', 'warn')
    } finally {
        lockBusy.value = false
    }
}

const submitSource = () => {
    const parts = []
    if (identifyPreview.value && currentSegments.length > 0) parts.push(...currentSegments)
    if (pendingSegments.length > 0) parts.push(...pendingSegments)
    return mergeSegments(parts)
}

const commit = async (finalSegments, label, keepPending = false) => {
    busy.value = true
    try {
        const result = await commitCache(env, props.bvid, cached, finalSegments)
        cached = result.cached
        currentSegments = result.segments
        canUpdate = result.canUpdate
        if (!keepPending) pendingSegments = []
        identifyPreview.value = false
        showMessage(label, 'success', 4000)
        bump()
        if (env.afterCommit) env.afterCommit().catch(() => {})
    } catch (error) {
        showMessage('更新缓存失败：' + (error && error.message ? error.message : '请稍后重试'), 'warn', 5000)
    } finally {
        busy.value = false
    }
}

const appendUpdate = async () => {
    const source = submitSource()
    if (source.length === 0) {
        showMessage('暂无可提交内容，请先手动添加片段或重新识别', 'warn')
        return
    }
    const existing = cached && cached.segments ? cached.segments : []
    await commit(mergeSegments([...existing, ...source]), '缓存已更新（追加）')
}

const overlayResolve = value => {
    if (overlayResolveFn) overlayResolveFn(value)
    overlay.value = null
    overlayResolveFn = null
}

const overwriteUpdate = async () => {
    const source = submitSource()
    if (source.length === 0) {
        showMessage('暂无可覆盖内容，请先手动添加片段或重新识别', 'warn')
        return
    }
    const existing = cached && cached.segments && cached.segments.length > 0 ? mergeSegments(cached.segments) : []
    if (existing.length === 0) {
        await commit(source, '缓存已更新（覆盖）')
        return
    }
    const picked = await new Promise(resolve => {
        overlayResolveFn = resolve
        overlay.value = { existing, picked: existing.map((_, i) => i) }
    })
    if (picked === null) return
    let finalSegments
    if (picked === 'all') {
        finalSegments = source
    } else {
        const keep = existing.filter((_, i) => !picked.includes(i))
        finalSegments = mergeSegments([...keep, ...source])
    }
    await commit(finalSegments, '缓存已更新（覆盖）')
}

const reIdentify = async () => {
    identifying.value = true
    busy.value = true
    recognizeError.value = ''
    try {
        const result = await env.recognize(props.bvid)
        if (result && result.error) {
            recognizeError.value = result.error
            return
        }
        const segments = result && result.segments ? result.segments : []
        currentSegments = mergeSegments(segments)
        identifyPreview.value = true
        showMessage('重新识别完成，共 ' + currentSegments.length + ' 段，可点击「覆盖更新」或「追加更新」生效', 'success', 5000)
        bump()
    } catch (error) {
        recognizeError.value = '识别失败: ' + (error && error.message ? error.message : '未知错误')
    } finally {
        identifying.value = false
        busy.value = false
    }
}

onMounted(load)
</script>

<style scoped>
.skip-ow-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--adj-bg-scrim, rgba(0, 0, 0, 0.5));
}
.segment-edit {
    cursor: pointer;
    color: var(--adj-text-muted);
    padding: 0 4px;
    border-radius: 4px;
    margin-left: 6px;
    font-size: 13px;
}
.segment-edit:hover {
    color: var(--adj-brand);
    background: var(--adj-bg-hover);
}
.clear-existing-btn {
    margin-top: 10px;
    padding: 4px 12px;
    font-size: 12px;
    align-self: flex-start;
}
.cancel-edit-btn {
    padding: 4px 12px;
    font-size: 12px;
}
</style>
