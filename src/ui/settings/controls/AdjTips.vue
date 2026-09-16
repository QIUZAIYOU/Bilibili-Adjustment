<template>
    <span class="adjustment-tips-icon" :data-tooltip="text">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
    </span>
</template>
<script setup lang="ts">
/**
 * 设置项提示图标
 * data-tooltip 由全局 tooltip 组件（initTooltip）的事件委托消费，改属性名会让提示失效。
 */
withDefaults(defineProps<{ text?: string }>(), { text: '' })
</script>
