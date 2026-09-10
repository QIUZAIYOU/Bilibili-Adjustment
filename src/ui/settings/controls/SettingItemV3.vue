<template>
    <!-- wrapper 的 display 与经典渲染器逐字符一致（block / none），不依赖 CSS 回落 -->
    <div class="adjustment-setting-item-wrapper" :data-config-id="item.id" :style="visibleStyle">
        <!-- inline 开关：与 V2 一致的紧凑布局（标签 + 开关一行，无 info/control 分区，无 children） -->
        <div v-if="item.inline" class="adjustment-setting-item inline-checkbox" :data-config-id="item.id">
            <div class="adjustment-setting-label">{{ item.label }}<AdjTips v-if="tipsText" :text="tipsText" /></div>
            <AdjSwitch
                :model-value="Boolean(configs[item.id])"
                :input-id="item.id"
                @update:model-value="value => emit('change', item.id, value)"
            />
        </div>
        <!-- 普通项：.adjustment-setting-item 内部 = main + children（与 V2 renderCheckbox 结构完全一致） -->
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
                    <!-- input：文本/数字输入 + 可选校验按钮（id 与 V2 一致：ValidateXxx） -->
                    <template v-else-if="item.type === 'input'">
                        <input
                            :id="item.id"
                            class="adjustment-input"
                            :type="item.inputType || 'text'"
                            data-config-type="input"
                            :value="configs[item.id] ?? ''"
                            :placeholder="item.placeholder || ''"
                            @change="emit('change', item.id, $event.target.value)"
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
                    <!-- select：原生 select 作为数据与事件中枢（与 V2 过渡方案一致） -->
                    <template v-else-if="item.type === 'select'">
                        <div class="adjustment-select">
                            <select
                                :id="item.id"
                                data-config-type="select"
                                :disabled="selectOptions.length === 0"
                                @change="emit('change', item.id, $event.target.value)"
                            >
                                <template v-if="selectOptions.length > 0">
                                    <option
                                        v-for="opt in selectOptions"
                                        :key="opt.value"
                                        :value="opt.value"
                                        :selected="String(configs[item.id] ?? '') === String(opt.value)"
                                    >{{ opt.label }}</option>
                                </template>
                                <option v-else value="" disabled selected>暂无可用选项</option>
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
            <!-- 子项：全为纯开关时横向排列，否则纵向堆叠（与 V2 renderCheckbox 布局规则一致） -->
            <div
                v-if="childItems.length > 0"
                class="adjustment-setting-children"
                :style="childrenStyle"
            >
                <SettingItemV3
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
<script setup>
/**
 * 单个设置项（V3）：schema 驱动，覆盖 checkbox / input / select / radio 与 children 联动。
 *
 * 与经典渲染器（settings-renderer.js）的等价性要点：
 * - wrapper 显式 `display: block|none`（与 V2 逐字符一致，不依赖 CSS 回落）；
 * - 内层 `.adjustment-setting-item[data-config-id]` 带同款属性，保证既有 CSS 选择器全部命中；
 * - **children 容器位于 `.adjustment-setting-item` 内部**（main 之后），与 V2 renderCheckbox 一致；
 * - 校验/刷新按钮 id（`ValidateXxx` / `RefreshXxx`）与 V2 一致；
 * - select 用 option 的 `selected` 表达选中（与 V2 相同），避免依赖 select.value 的时序；
 * - children 容器可见条件 = 父开关开启 && 至少一个子项自身可见（同 V2 anyChildVisible）；
 * - inline 开关使用 `.inline-checkbox` 紧凑布局（V2 的 inline 项同样不渲染 children）；
 * - `depth` 限制递归渲染层数：即使 schema 出现异常自引用也不会渲染溢出（防御性约束）。
 */
import { computed } from 'vue'
import AdjTips from './AdjTips.vue'
import AdjSwitch from './AdjSwitch.vue'
/** 递归渲染层数上限：设置 schema 实际最深为 section > checkbox > children（2 层），留足余量 */
const MAX_DEPTH = 4
const props = defineProps({
    item: { type: Object, required: true },
    configs: { type: Object, required: true },
    dynamicOptions: { type: Object, default: () => ({}) },
    depth: { type: Number, default: 0 }
})
const emit = defineEmits(['change', 'validate', 'refresh'])
// 校验/刷新按钮样式与 V2 一致（内联属性，避免引入未定义 class）
const sideButtonStyle = 'padding:4px 12px;font-size:12px;white-space:nowrap;cursor:pointer;height:32px;'

/** 与 V2 toPascalCase 一致：`ai_apikey` → `AiApikey` */
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
 * 提示文案：与经典渲染器的「最终效果」一致 —— 换行转 `<br>`，其余字符原样。
 * 说明：V2 把文案写入 HTML 属性时做了实体转义，浏览器解析后 `dataset.tooltip` 得到的是
 * 未转义文本（`<br>`/`<a>` 生效，tooltip 以 innerHTML 渲染）；Vue 的 setAttribute 不做 HTML 转义，
 * 因此这里**只做换行转换**即可得到与 V2 完全相同的属性值。
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
