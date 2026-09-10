<template>
    <div v-show="isVisible" class="adjustment-setting-item-wrapper" :data-config-id="item.id">
        <!-- inline 开关：与 V2 一致的紧凑布局（标签 + 开关一行，无 info/control 分区） -->
        <div v-if="item.inline" class="adjustment-setting-item inline-checkbox">
            <div class="adjustment-setting-label">{{ item.label }}<AdjTips v-if="tipsText" :text="tipsText" /></div>
            <AdjSwitch
                :model-value="Boolean(configs[item.id])"
                :input-id="item.id"
                @update:model-value="value => emit('change', item.id, value)"
            />
        </div>
        <div v-else class="adjustment-setting-main">
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
                <!-- input：文本/数字输入 + 可选校验按钮 -->
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
                            :value="String(configs[item.id] ?? '')"
                            @change="emit('change', item.id, $event.target.value)"
                        >
                            <template v-if="selectOptions.length > 0">
                                <option v-for="opt in selectOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                            </template>
                            <option v-else value="" disabled selected>暂无可用选项</option>
                        </select>
                    </div>
                    <div
                        v-if="item.hasRefreshButton"
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
                @change="(key, value) => emit('change', key, value)"
                @validate="key => emit('validate', key)"
                @refresh="key => emit('refresh', key)"
            />
        </div>
    </div>
</template>
<script setup>
/**
 * 单个设置项（V3）：schema 驱动，覆盖 checkbox / input / select / radio 与 children 联动。
 *
 * 与 V2 的等价性要点（迁移对照见 docs/settings-v3-migration.md）：
 * - 不可见时用 v-show（V2 用 display:none 占位），保持「始终渲染、按需显示」的语义；
 * - children 容器可见条件 = 父开关开启 && 至少一个子项自身可见（与 V2 anyChildVisible 一致）；
 * - inline 开关使用 .inline-checkbox 紧凑布局；
 * - tips 通过 data-tooltip 复用全局 tooltip；description 独立成行；
 * - select 无选项时禁用并展示「暂无可用选项」。
 */
import { computed } from 'vue'
import AdjTips from './AdjTips.vue'
import AdjSwitch from './AdjSwitch.vue'

const props = defineProps({
    item: { type: Object, required: true },
    configs: { type: Object, required: true },
    dynamicOptions: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change', 'validate', 'refresh'])
// 校验/刷新按钮样式与 V2 一致（内联属性，避免引入未定义 class）
const sideButtonStyle = 'padding:4px 12px;font-size:12px;white-space:nowrap;cursor:pointer;height:32px;'

const isVisible = computed(() => {
    if (props.item.visible === undefined) return true
    if (typeof props.item.visible === 'function') return Boolean(props.item.visible(props.configs))
    return Boolean(props.item.visible)
})
const tipsText = computed(() => {
    const { tips } = props.item
    if (!tips) return ''
    return typeof tips === 'function' ? String(tips(props.configs) || '') : String(tips)
})
const selectOptions = computed(() => props.dynamicOptions[props.item.id] || props.item.options || [])
const childItems = computed(() => props.item.children || [])
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
