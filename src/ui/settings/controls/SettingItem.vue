<template>
    <!-- wrapper 的 display 显式为 block / none（不依赖 CSS 回落，避免与 v-show 抢 DOM） -->
    <div class="adjustment-setting-item-wrapper" :data-config-id="item.id" :style="visibleStyle">
        <!-- inline 开关：紧凑布局（标签 + 开关一行，无 info/control 分区，无 children） -->
        <div v-if="item.inline" class="adjustment-setting-item inline-checkbox" :data-config-id="item.id">
            <div class="adjustment-setting-label">{{ item.label }}<AdjTips v-if="tipsText" :text="tipsText" /></div>
            <AdjSwitch
                :model-value="Boolean(configs[item.id])"
                :input-id="item.id"
                @update:model-value="value => emit('change', item.id, value)"
            />
        </div>
        <!-- 普通项：.adjustment-setting-item 内部 = main + children -->
        <div v-else class="adjustment-setting-item" :data-config-id="item.id">
            <div class="adjustment-setting-main">
                <div class="adjustment-setting-info">
                    <div class="adjustment-setting-label">{{ item.label }}<AdjTips v-if="tipsText" :text="tipsText" /></div>
                    <div v-if="item.description" class="adjustment-setting-desc">{{ item.description }}</div>
                </div>
                <div class="adjustment-setting-control">
                    <!-- checkbox：开关 -->
                    <AdjSwitch
                        v-if="item.type === 'checkbox'"
                        :model-value="Boolean(configs[item.id])"
                        :input-id="item.id"
                        @update:model-value="value => emit('change', item.id, value)"
                    />
                    <!-- input：文本/数字输入 + 可选校验按钮（id = Validate + PascalCase(id)） -->
                    <template v-else-if="item.type === 'input'">
                        <input
                            :id="item.id"
                            class="adjustment-input"
                            :type="item.inputType || 'text'"
                            data-config-type="input"
                            :value="configs[item.id] ?? ''"
                            :placeholder="item.placeholder || ''"
                            @change="emit('change', item.id, ($event.target as HTMLInputElement).value)"
                        >
                        <div
                            v-if="item.hasValidateButton"
                            :id="'Validate' + pascalId"
                            class="adjustment-button secondary"
                            :style="sideButtonStyle"
                            :data-validate-for="item.id"
                            @click="emit('validate', item.id)"
                        >{{ item.validateButtonText }}</div>
                    </template>
                    <!-- select：原生 select 是数据与事件中枢，自绘下拉只是它的视觉替身（custom-select） -->
                    <template v-else-if="item.type === 'select'">
                        <div class="adjustment-select">
                            <!-- 值必须绑在 <select> 上（:value → 写 DOM property）：
                                 只在 <option> 上绑 :selected 时，Vue 动态更新 selected 属性
                                 无法可靠改变 <select> 的当前值，导致「外部来源改配置后控件不刷新
                                 （如 Stylus 夜间样式自动切换主题），关掉弹窗重开才正确」 -->
                            <select
                                :id="item.id"
                                data-config-type="select"
                                :disabled="selectOptions.length === 0"
                                :value="String(configs[item.id] ?? '')"
                                @change="emit('change', item.id, ($event.target as HTMLInputElement).value)"
                            >
                                <template v-if="selectOptions.length > 0">
                                    <option
                                        v-for="opt in selectOptions"
                                        :key="opt.value"
                                        :value="opt.value"
                                    >{{ opt.label }}</option>
                                </template>
                                <option v-else value="" disabled>暂无可用选项</option>
                            </select>
                        </div>
                        <div
                            v-if="item.hasRefreshButton"
                            :id="'Refresh' + pascalId"
                            class="adjustment-button secondary"
                            :style="sideButtonStyle"
                            :data-refresh-for="item.id"
                            @click="emit('refresh', item.id)"
                        >{{ item.refreshButtonText }}</div>
                    </template>
                    <!-- radio：单选框组 -->
                    <div v-else-if="item.type === 'radio'" class="adjustment-radio-group">
                        <label v-for="opt in item.options || []" :key="opt.value" class="adjustment-radio-item">
                            <input
                                class="radio"
                                type="radio"
                                data-config-type="radio"
                                :name="item.id"
                                :value="opt.value"
                                :checked="configs[item.id] === opt.value"
                                @change="emit('change', item.id, opt.value)"
                            >
                            <span>{{ opt.label }}</span>
                        </label>
                    </div>
                </div>
            </div>
            <!-- 子项：全为纯开关时横向排列，否则纵向堆叠（.adjustment-setting-children 的 flex 规则） -->
            <div
                v-if="childItems.length > 0"
                class="adjustment-setting-children"
                :style="childrenStyle"
            >
                <!-- 递归渲染子项：`SettingItem` 是本组件自身（SFC 按文件名隐式自引用） -->
                <SettingItem
                    v-for="child in childItems"
                    :key="child.id || child.label"
                    :item="child"
                    :configs="configs"
                    :dynamic-options="dynamicOptions"
                    :depth="depth + 1"
                    @change="(key, value) => emit('change', key, value)"
                    @validate="key => emit('validate', key)"
                    @refresh="key => emit('refresh', key)"
                />
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
/**
 * 单个设置项（Vue）：schema 驱动，覆盖 checkbox / input / select / radio 与 children 联动。
 *
 * DOM/class 契约（全局样式与事件委托依赖这些名字，改动前先看 src/shared/styles 与 custom-select/tooltip）：
 * - wrapper 显式 `display: block|none`（不依赖 CSS 回落，避免与 v-show 抢 DOM）；
 * - 内层 `.adjustment-setting-item[data-config-id]` 带同款属性，保证既有 CSS 选择器全部命中；
 * - **children 容器位于 `.adjustment-setting-item` 内部**（main 之后）；
 * - 校验/刷新按钮 id 为 `ValidateXxx` / `RefreshXxx`（PascalCase 由 pascalId 生成）；
 * - select 用 option 的 `selected` 表达选中，避免依赖 select.value 的时序；
 * - children 容器可见条件 = 父开关开启 && 至少一个子项自身可见；
 * - inline 开关使用 `.inline-checkbox` 紧凑布局（inline 项不渲染 children）；
 * - `depth` 限制递归渲染层数：即使 schema 出现异常自引用也不会渲染溢出（防御性约束）。
 */
import { computed } from 'vue'
import type { SettingItemSchema, SettingOption } from '@/config/settings-config'
import AdjTips from './AdjTips.vue'
import AdjSwitch from './AdjSwitch.vue'
/** 递归渲染层数上限：设置 schema 实际最深为 section > checkbox > children（2 层），留足余量 */
const MAX_DEPTH = 4
const props = withDefaults(defineProps<{
    /** 设置项 schema（唯一字段契约见 src/config/settings-config.ts） */
    item: SettingItemSchema
    /** 当前配置值（宿主响应式扁平 map） */
    configs: Record<string, unknown>
    /** 动态选项：{ [configId]: SettingOption[] }（宿主响应式对象） */
    dynamicOptions?: Record<string, SettingOption[]>
    /** 递归渲染层数（上限 MAX_DEPTH） */
    depth?: number
}>(), {
    dynamicOptions: () => ({}),
    depth: 0
})
const emit = defineEmits<{
    change: [key: string, value: unknown]
    validate: [key: string]
    refresh: [key: string]
}>()
// 校验/刷新按钮样式（内联属性，避免引入未定义 class）
const sideButtonStyle = 'padding:4px 12px;font-size:12px;white-space:nowrap;cursor:pointer;height:32px;'

/** 设置项 id → PascalCase：`ai_apikey` → `AiApikey`（校验/刷新按钮 id 依赖它） */
const pascalId = computed(() => String(props.item.id || '')
    .split('_')
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(''))
const isVisible = computed(() => {
    if (props.item.visible === undefined) return true
    if (typeof props.item.visible === 'function') return Boolean(props.item.visible(props.configs))
    return Boolean(props.item.visible)
})
const visibleStyle = computed(() => `display: ${isVisible.value ? 'block' : 'none'};`)
/**
 * 提示文案：换行转 `<br>`，其余字符原样（tooltip 以 innerHTML 渲染，故 `<br>`/`<a>` 生效）。
 * 说明：`data-tooltip` 属性值必须是**未转义**文本——Vue 的 setAttribute 本就不做 HTML 转义，
 * 因此这里只做换行转换即可（若改用属性拼接 HTML 字符串，需自行避免二次转义带来的双转义）。
 */
const tipsText = computed(() => {
    const { tips } = props.item
    if (!tips) return ''
    const raw = typeof tips === 'function' ? tips(props.configs) : tips
    return String(raw ?? '').replace(/\n/g, '<br>')
})
const selectOptions = computed(() => props.dynamicOptions[props.item.id] || props.item.options || [])
const childItems = computed(() => {
    if (props.depth >= MAX_DEPTH) return []
    return props.item.children || []
})
const childrenStyle = computed(() => {
    const value = Boolean(props.configs[props.item.id])
    const anyChildVisible = childItems.value.some(child => {
        if (child.visible === undefined) return true
        if (typeof child.visible === 'function') return Boolean(child.visible(props.configs))
        return Boolean(child.visible)
    })
    const display = value && anyChildVisible ? 'flex' : 'none'
    const isRowLayout = childItems.value.length > 0 && childItems.value.every(child => child.type === 'checkbox' && !child.children?.length && !child.items?.length)
    const direction = isRowLayout ? '' : ' flex-direction: column; align-items: stretch; overflow-x: visible;'
    return `display: ${display};${direction}`
})
</script>
