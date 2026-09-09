<template>
    <div class="adjustment-setting-item-wrapper" data-config-id="dynamic_video_link" style="display:block;">
        <div class="adjustment-setting-item" data-config-id="dynamic_video_link">
            <div class="adjustment-setting-main">
                <div class="adjustment-setting-info">
                    <div class="adjustment-setting-label">
                        「投稿视频」链接
                        <span class="adjustment-tips-icon" data-tooltip="点击「投稿视频」选项后，填入当前浏览器地址栏链接，即可自动跳转至该链接">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        </span>
                    </div>
                </div>
                <div class="adjustment-setting-control">
                    <input id="dynamic_video_link" class="adjustment-input" type="text" :value="inputValue" placeholder="https://t.bilibili.com/?tab=video" data-config-type="input" @change="onChange">
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useConfig } from '@/ui/composables'
// 设置项 Vue 化试点（分区 X）：动态页「投稿视频」链接
// 数据/保存复用 useConfig（ConfigService + config:changed 实时同步），DOM 结构与原渲染器一致
const props = defineProps({
    initial: { type: String, default: '' }
})
const { value, set } = useConfig('dynamic_video_link')
const inputValue = ref(props.initial || '')
watch(value, v => {
    if (v !== null && v !== undefined) inputValue.value = String(v)
}, { immediate: true })
const onChange = event => {
    set(String(event.target.value || '').trim()).catch(() => {})
}
</script>
