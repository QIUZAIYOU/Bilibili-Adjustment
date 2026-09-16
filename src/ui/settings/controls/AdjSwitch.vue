<template>
    <!-- class 名与全局样式/主题态严格对应：未选中时 class 尾随一个空格（`adjustment-switch `） -->
    <div :class="'adjustment-switch ' + (modelValue ? 'on' : '')">
        <input
            :id="inputId"
            class="adjustment-checkbox checkbox"
            type="checkbox"
            data-config-type="checkbox"
            :checked="modelValue"
            @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        >
        <div class="adjustment-switch-knob"></div>
    </div>
</template>
<script setup lang="ts">
/**
 * 设置开关
 * DOM 结构与 class 直接复用既有全局样式（`.adjustment-switch` 与 `.adjustment-switch.on` 主题态），
 * 改类名会让开关失去样式与主题跟随。
 */
withDefaults(defineProps<{ modelValue?: boolean; inputId?: string }>(), {
    modelValue: false,
    inputId: ''
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
