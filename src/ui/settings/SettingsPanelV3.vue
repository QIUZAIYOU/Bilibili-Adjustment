<template>
    <div class="adjustment-form">
        <template v-for="item in schema" :key="item.id || item.label">
            <!-- section：V2 用 .adjustment-section + 紧凑网格（全为 inline checkbox 时） -->
            <div v-if="item.type === 'section'" class="adjustment-section" :class="item.id">
                <div class="adjustment-section-title">{{ item.label }}</div>
                <div :class="sectionLayoutClass(item)">
                    <SettingItemV3
                        v-for="child in item.items || []"
                        :key="child.id || child.label"
                        :item="child"
                        :configs="configs"
                        :dynamic-options="dynamicOptions"
                        @change="onChange"
                        @validate="onValidate"
                        @refresh="onRefresh"
                    />
                </div>
            </div>
            <SettingItemV3
                v-else
                :item="item"
                :configs="configs"
                :dynamic-options="dynamicOptions"
                @change="onChange"
                @validate="onValidate"
                @refresh="onRefresh"
            />
        </template>
    </div>
    <div v-if="loading" class="adjustment-settings-loading">正在加载设置...</div>
</template>
<script setup>
/**
 * 设置面板 V3（P0-4）
 *
 * schema 驱动的 Vue 版设置表单：以 src/config/settings-config.js 为唯一事实源，
 * 覆盖 checkbox / input / select / radio / section、children 联动、visible 条件、
 * 动态选项（模型列表）、校验/刷新按钮，DOM 结构与 class 与 V2 一致。
 *
 * 迁移说明：当前 V2（settings-component-v2 + settings-renderer）仍在线上运行，
 * 本组件是「先建 V3 文件、后续按分区替换」的落地物（批次与验收见 docs/settings-v3-migration.md）。
 * 接线时由宿主（video.module / dynamic.module 的设置弹窗）传入 schema、configs 与 dynamicOptions，
 * 并实现 change/validate/refresh 三个事件（对应 ConfigService.setValue / validateApiKey / fetchModels）。
 */
import SettingItemV3 from './controls/SettingItemV3.vue'

const props = defineProps({
    /** 设置项 schema 数组（videoSettingsConfig / dynamicSettingsConfig） */
    schema: { type: Array, default: () => [] },
    /** 当前配置值（扁平标量 map） */
    configs: { type: Object, default: () => ({}) },
    /** 动态选项：{ [configId]: [{ value, label }] }（如模型列表） */
    dynamicOptions: { type: Object, default: () => ({}) },
    /** 是否处于加载态（首帧未就绪时展示骨架提示） */
    loading: { type: Boolean, default: false }
})
const emit = defineEmits(['change', 'validate', 'refresh'])
const onChange = (key, value) => emit('change', key, value)
const onValidate = key => emit('validate', key)
const onRefresh = key => emit('refresh', key)
/** 全为 inline checkbox 的子项使用紧凑网格布局（与 V2 一致） */
const sectionLayoutClass = item => {
    const allInline = (item.items || []).every(subItem => subItem.inline && subItem.type === 'checkbox')
    return allInline ? 'adjustment-section-content compact-grid' : 'adjustment-section-content'
}
const schema = computed(() => props.schema)
</script>
