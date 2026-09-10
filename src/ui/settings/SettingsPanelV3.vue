<template>
    <!-- 多根 fragment：挂载点本身即 .adjustment-form 容器（由宿主输出），
         这样最终 DOM 与经典渲染器完全一致（.adjustment-popover > .adjustment-form > 设置项） -->
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
                    @change="handleChange"
                    @validate="handleValidate"
                    @refresh="handleRefresh"
                />
            </div>
        </div>
        <SettingItemV3
            v-else
            :item="item"
            :configs="configs"
            :dynamic-options="dynamicOptions"
            @change="handleChange"
            @validate="handleValidate"
            @refresh="handleRefresh"
        />
    </template>
</template>
<script setup>
/**
 * 设置面板 V3
 *
 * schema 驱动的 Vue 版设置表单：以 src/config/settings-config.js 为唯一事实源，
 * 覆盖 checkbox / input / select / radio / section、children 联动、visible 条件、
 * 动态选项（模型列表）、校验/刷新按钮，DOM 结构与 class 与 V2 一致。
 *
 * 接线方式（src/ui/settings/index.js#mountVueSettingsPanel）：
 * 宿主传入 schema / configs / dynamicOptions 三个响应式数据源，并通过
 * onChange / onValidate / onRefresh 回调承接交互（也可监听同名 emits）。
 * configs、dynamicOptions 为宿主持有的响应式对象：宿主侧修改即驱动面板重渲染
 * （跨标签同步、模型列表刷新都不需要再操作 DOM）。
 */
import SettingItemV3 from './controls/SettingItemV3.vue'

const props = defineProps({
    /** 设置项 schema 数组（videoSettingsConfig / dynamicSettingsConfig） */
    schema: { type: Array, default: () => [] },
    /** 当前配置值（扁平标量 map，宿主响应式对象） */
    configs: { type: Object, default: () => ({}) },
    /** 动态选项：{ [configId]: [{ value, label }] }（如模型列表，宿主响应式对象） */
    dynamicOptions: { type: Object, default: () => ({}) },
    /** 配置变更回调（key, value） */
    onChange: { type: Function, default: null },
    /** 校验按钮回调（key） */
    onValidate: { type: Function, default: null },
    /** 刷新按钮回调（key） */
    onRefresh: { type: Function, default: null }
})
const emit = defineEmits(['change', 'validate', 'refresh'])
const handleChange = (key, value) => {
    if (typeof props.onChange === 'function') props.onChange(key, value)
    else emit('change', key, value)
}
const handleValidate = key => {
    if (typeof props.onValidate === 'function') props.onValidate(key)
    else emit('validate', key)
}
const handleRefresh = key => {
    if (typeof props.onRefresh === 'function') props.onRefresh(key)
    else emit('refresh', key)
}
/** 全为 inline checkbox 的子项使用紧凑网格布局（与 V2 一致） */
const sectionLayoutClass = item => {
    const allInline = (item.items || []).every(subItem => subItem.inline && subItem.type === 'checkbox')
    return allInline ? 'adjustment-section-content compact-grid' : 'adjustment-section-content'
}
</script>
