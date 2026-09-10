/**
 * 设置面板 V3 数据层（P0-4）
 *
 * 与 SettingsPanelV3.vue 配套：负责「schema ↔ ConfigService」的读写桥接，
 * 取代 V2 中散落在 settings-component-v2 的命令式读写与 DOM 绑定。
 *
 * 约定（与迁移红线一致）：
 * - configs 为扁平标量 map（无嵌套大对象、无数组代理），可安全交给 Vue 响应式；
 * - 读取走一次批量事务（storageService.userBatchGet），缺失项用 schema 默认值补齐并缓存；
 * - 写入统一走 ConfigService.setValue（缓存 + 跨标签广播 + theme 事件）；
 * - 动态选项（模型列表）按需加载并缓存，失败回退到 schema 静态 options。
 */
import { ref, onScopeDispose } from 'vue'
import { ConfigService } from '@/services/config.service'
import { storageService } from '@/services/storage.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { fetchModels } from '@/services/ai.service'
/** 收集 schema 中所有可配置项键（含 children/items） */
export const collectConfigKeys = schema => {
    const keys = []
    const walk = items => {
        for (const item of items || []) {
            if (item.id && item.type !== 'section') keys.push(item.id)
            if (item.children?.length) walk(item.children)
            if (item.items?.length) walk(item.items)
        }
    }
    walk(schema)
    return keys
}
/** 从 schema 收集默认值（defaultValue 为函数时惰性求值） */
export const collectDefaults = schema => {
    const defaults = {}
    const walk = items => {
        for (const item of items || []) {
            if (item.id && 'defaultValue' in item) {
                defaults[item.id] = typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue
            }
            if (item.children?.length) walk(item.children)
            if (item.items?.length) walk(item.items)
        }
    }
    walk(schema)
    return defaults
}
/**
 * @param {Array} schema 设置项 schema
 * @returns {{configs: import('vue').Ref<object>, dynamicOptions: import('vue').Ref<object>, loading: import('vue').Ref<boolean>, load: Function, setValue: Function, refreshModels: Function, validateItem: Function}}
 */
export const useSettingsPanel = schema => {
    const configs = ref({})
    const dynamicOptions = ref({})
    const loading = ref(true)
    const offHandlers = []
    const load = async () => {
        loading.value = true
        try {
            const keys = collectConfigKeys(schema)
            const defaults = collectDefaults(schema)
            const stored = await storageService.userBatchGet(keys)
            const merged = { ...defaults }
            for (const key of keys) {
                if (stored[key] !== undefined && stored[key] !== null) merged[key] = stored[key]
            }
            configs.value = merged
        } finally {
            loading.value = false
        }
    }
    const setValue = async (key, value) => {
        configs.value = { ...configs.value, [key]: value }
        await ConfigService.setValue(key, value)
    }
    /** 动态加载模型列表（AI 设置区的 select 选项） */
    const refreshModels = async (configId = 'ai_model') => {
        const apiKey = configs.value.custom_model_api_key || configs.value.ai_apikey || ''
        const provider = configs.value.use_custom_model ? 'custom' : (configs.value.ai_provider || 'siliconflow')
        const baseURL = configs.value.custom_model_api_url || configs.value.custom_base_url || ''
        const models = await fetchModels(apiKey, provider, baseURL)
        dynamicOptions.value = {
            ...dynamicOptions.value,
            [configId]: models.map(model => ({ value: model.id, label: model.label || model.id }))
        }
    }
    /** 跨标签页/多组件同步：其它来源改配置时刷新本地副本 */
    offHandlers.push(eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_, payload) => {
        const { key, value } = payload || {}
        if (!key || configs.value[key] === value) return
        configs.value = { ...configs.value, [key]: value }
    }))
    onScopeDispose(() => {
        offHandlers.forEach(off => off())
        offHandlers.length = 0
    })
    return { configs, dynamicOptions, loading, load, setValue, refreshModels }
}
