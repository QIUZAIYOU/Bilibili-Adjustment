<template>
    <!-- 多根 fragment：挂载点本身即 .adjustment-form 容器（由宿主输出），
         最终 DOM 为 .adjustment-popover > .adjustment-form > 设置项 -->
    <template v-for="item in schema" :key="item.id || item.label">
        <!-- section：.adjustment-section + 紧凑网格（子项全为 inline checkbox 时） -->
        <div v-if="item.type === 'section'" class="adjustment-section" :class="item.id" :style="sectionVisibleStyle(item)">
            <div class="adjustment-section-title">{{ item.label }}</div>
            <div :class="sectionLayoutClass(item)">
                <SettingItem
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
        <SettingItem
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
<script setup lang="ts">
/**
 * 设置面板（Vue）
 *
 * schema 驱动的设置表单：以 src/config/settings-config.ts 为唯一事实源，
 * 覆盖 checkbox / input / select / radio / section、children 联动、visible 条件、
 * 动态选项（模型列表）、校验/刷新按钮（DOM 结构与 class 见 controls/ 下的组件注释）。
 *
 * 接线方式（src/ui/settings/index.ts#mountVueSettingsPanel）：
 * 宿主传入 schema / configs / dynamicOptions 三个响应式数据源，并通过
 * onChange / onValidate / onRefresh 回调承接交互（也可监听同名 emits）。
 * configs、dynamicOptions 为宿主持有的响应式对象：宿主侧修改即驱动面板重渲染
 * （跨标签同步、模型列表刷新都不需要再操作 DOM）。
 */
import type { SettingItemSchema, SettingOption } from '@/config/settings-config'
import SettingItem from './controls/SettingItem.vue'

const props = withDefaults(defineProps<{
    /** 设置项 schema 数组（videoSettingsConfig / dynamicSettingsConfig） */
    schema?: SettingItemSchema[]
    /** 当前配置值（扁平标量 map，宿主响应式对象） */
    configs?: Record<string, unknown>
    /** 动态选项：{ [configId]: [{ value, label }] }（如模型列表，宿主响应式对象） */
    dynamicOptions?: Record<string, SettingOption[]>
    /** 配置变更回调（key, value） */
    onChange?: ((key: string, value: unknown) => void) | null
    /** 校验按钮回调（key） */
    onValidate?: ((key: string) => void) | null
    /** 刷新按钮回调（key） */
    onRefresh?: ((key: string) => void) | null
}>(), {
    schema: () => [],
    configs: () => ({}),
    dynamicOptions: () => ({}),
    onChange: null,
    onValidate: null,
    onRefresh: null
})
const emit = defineEmits<{
    change: [key: string, value: unknown]
    validate: [key: string]
    refresh: [key: string]
}>()
const handleChange = (key: string, value: unknown) => {
    if (typeof props.onChange === 'function') props.onChange(key, value)
    else emit('change', key, value)
}
const handleValidate = (key: string) => {
    if (typeof props.onValidate === 'function') props.onValidate(key)
    else emit('validate', key)
}
const handleRefresh = (key: string) => {
    if (typeof props.onRefresh === 'function') props.onRefresh(key)
    else emit('refresh', key)
}
/** section 也支持 visible：不可见时整块（含标题与全部子项）隐藏，避免只剩孤零零的标题 */
const isItemVisible = (item: SettingItemSchema): boolean => {
    if (item.visible === undefined) return true
    if (typeof item.visible === 'function') return Boolean(item.visible(props.configs))
    return Boolean(item.visible)
}
// 可见时**返回空字符串**（不写 display）：.adjustment-section 自身是 display: flex，
// 若在此写死 display: block 会覆盖它 —— gap 失效，且宽度收缩行为从 flex item 变为 block，
// 表现为「悬停控件时（滚动条加宽导致内容宽度变化）控件位移几个像素」。
const sectionVisibleStyle = (item: SettingItemSchema): string => isItemVisible(item) ? '' : 'display: none;'
/** 全为 inline checkbox 的子项使用紧凑网格布局（一行多个开关） */
const sectionLayoutClass = (item: SettingItemSchema) => {
    const allInline = (item.items || []).every(subItem => subItem.inline && subItem.type === 'checkbox')
    return allInline ? 'adjustment-section-content compact-grid' : 'adjustment-section-content'
}
</script>
