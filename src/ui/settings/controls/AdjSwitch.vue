<template>
    <div class="adjustment-switch" :class="{ on: modelValue }">
        <input
            :id="inputId"
            class="adjustment-checkbox checkbox"
            type="checkbox"
            data-config-type="checkbox"
            :checked="modelValue"
            @change="emit('update:modelValue', $event.target.checked)"
        >
        <div class="adjustment-switch-knob"></div>
    </div>
</template>
<script setup>
/**
 * 设置开关（V3）
 * DOM 结构与 class 与 V2（settings-renderer.renderCheckbox）一致，直接复用既有全局样式与
 * .adjustment-switch.on 主题态，保证迁移过程中视觉零差异。
 */
defineProps({
    modelValue: { type: Boolean, default: false },
    inputId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])
</script>
