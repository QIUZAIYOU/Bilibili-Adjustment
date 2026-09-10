<template>
    <div class="history-body">
        <!-- 分类栏：结构与 class 与旧实现一致（全部 = .all_v2，选中态 .active） -->
        <ul id="indexRecommendVideoHistoryCategoryV2">
            <li class="all_v2" :class="{ active: selectedTag === '' }" @click="selectTag('')">全部</li>
            <li
                v-for="tag in allTags"
                :key="tag"
                :class="{ active: selectedTag === tag }"
                @click="selectTag(tag)"
            >{{ tag }}</li>
        </ul>
        <!-- 列表：li[data-url] + li > span > img + .video-info > a/.video-author（旧样式依赖这些结构选择器） -->
        <ul id="indexRecommendVideoHistoryList" ref="listEl" @click="onListClick">
            <li v-for="video in visibleList" :key="video._key" :data-url="video.safeUrl">
                <span><img :src="video.safePic" loading="lazy" :alt="video.title"></span>
                <div class="video-info">
                    <a :href="video.safeUrl" target="_blank" rel="noopener noreferrer" :title="video.title">{{ video.title }}</a>
                    <div class="video-author">UP: {{ video.author }}</div>
                </div>
            </li>
            <div v-if="isLoading" id="indexHistoryLoading" class="loading-state">
                <div class="loading-spinner"></div><span>加载中...</span>
            </div>
            <div v-if="hasMore" id="indexHistorySentinel" ref="sentinelEl" class="sentinel"></div>
            <div v-if="filteredList.length === 0" class="empty-state">没有找到匹配的视频</div>
        </ul>
    </div>
</template>
<script setup>
/**
 * 首页推荐历史弹窗「列表区」面板
 *
 * 由 src/modules/home/history.js 通过懒加载挂载（见 src/ui/home/index.js）：
 * 宿主负责弹窗外壳、标题计数、清空按钮与「关闭即销毁」；本组件负责分类栏、视频列表、
 * 搜索过滤、分页懒加载与列表点击。
 *
 * 保真要点（旧实现为命令式 DOM，结构与样式契约必须逐字保留）：
 * - 沿用 #indexRecommendVideoHistoryCategoryV2 / #indexRecommendVideoHistoryList /
 *   #indexHistoryLoading / #indexHistorySentinel 与 .history-body/.empty-state/.loading-state 等 class
 *   （样式 src/shared/styles/home-page.js 全按这些 id/结构选择器书写）；
 * - 列表点击为「容器委托」：命中 li 才打开，点击链接 a 时走浏览器默认行为；
 * - 分页每页 50 条，IntersectionObserver(root=列表, rootMargin=100px) + 100ms 模拟延迟；
 * - 搜索 300ms 防抖，由宿主模板里的搜索框触发；
 * - URL 经 sanitizeHttpUrl 白名单处理（与旧实现一致，非 http(s) 一律为空）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sanitizeHttpUrl } from '@/utils/common'
/** 与旧实现一致的分页大小 */
const PAGE_SIZE = 50
const props = defineProps({
    /** 已由宿主排序好的记录（批次时间倒序 → 页面顺序升序） */
    records: { type: Array, default: () => [] },
    /** 宿主弹窗模板内的搜索输入框（用于绑定 300ms 防抖的 input 监听） */
    searchInput: { type: Object, default: null }
})
const selectedTag = ref('')
const keyword = ref('')
const visibleCount = ref(PAGE_SIZE)
const isLoading = ref(false)
const listEl = ref(null)
const sentinelEl = ref(null)
let observer = null
let searchTimer = null
let searchCleanup = null
const toSafeUrl = value => {
    try {
        return sanitizeHttpUrl(value) || ''
    } catch {
        return ''
    }
}
/** 预计算安全 URL，避免模板里重复调用白名单函数 */
const decorated = computed(() => props.records.map(video => ({
    ...video,
    safeUrl: toSafeUrl(video.url),
    safePic: toSafeUrl(video.pic)
})))
/** 分类去重排序（与旧实现 [...new Set(...)].sort() 一致） */
const allTags = computed(() => [...new Set(decorated.value.flatMap(video => (video.category ? [video.category] : [])))].sort())
/** 分类 + 关键字过滤（大小写不敏感，标题或作者命中即可） */
const filteredList = computed(() => {
    const kw = keyword.value.toLowerCase().trim()
    return decorated.value.filter(video => {
        if (selectedTag.value && video.category !== selectedTag.value) return false
        if (kw &&
            !(video.title && video.title.toLowerCase().includes(kw)) &&
            !(video.author && video.author.toLowerCase().includes(kw))) return false
        return true
    })
})
const visibleList = computed(() => filteredList.value.slice(0, visibleCount.value))
const hasMore = computed(() => filteredList.value.length > visibleCount.value)
const selectTag = tag => {
    selectedTag.value = tag
    visibleCount.value = PAGE_SIZE
}
/** 列表点击委托：命中 li 开新窗口；点击 a 时放行（保留旧行为，包括 opener 策略） */
const onListClick = event => {
    const li = event.target.closest('li')
    if (!li || event.target.closest('a')) return
    const url = li.dataset.url
    if (url) window.open(url, '_blank', 'noopener')
}
const teardownObserver = () => {
    if (observer) {
        observer.disconnect()
        observer = null
    }
}
/** 还有更多数据时挂 -> 进入视口加载下一页（保留 100ms 模拟延迟） */
const setupObserver = async () => {
    teardownObserver()
    if (!hasMore.value) return
    await nextTick()
    const target = sentinelEl.value
    const root = listEl.value
    if (!target || !root) return
    observer = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting || isLoading.value) return
        isLoading.value = true
        setTimeout(() => {
            visibleCount.value += PAGE_SIZE
            isLoading.value = false
        }, 100)
    }, { root, rootMargin: '100px' })
    observer.observe(target)
}
watch([hasMore, filteredList, sentinelEl], () => {
    setupObserver()
}, { immediate: true })
onMounted(() => {
    const input = props.searchInput
    if (!input || typeof input.addEventListener !== 'function') return
    const onInput = event => {
        clearTimeout(searchTimer)
        searchTimer = setTimeout(() => {
            keyword.value = event.target.value
            visibleCount.value = PAGE_SIZE
        }, 300)
    }
    input.addEventListener('input', onInput)
    searchCleanup = () => input.removeEventListener('input', onInput)
})
onBeforeUnmount(() => {
    teardownObserver()
    clearTimeout(searchTimer)
    if (searchCleanup) {
        searchCleanup()
        searchCleanup = null
    }
})
</script>
