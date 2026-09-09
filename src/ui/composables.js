/**
 * Vue 组合式函数：把脚本既有能力（配置 / 事件总线 / 主题）桥接为响应式 API。
 * 供 Vue 弹窗/面板组件使用（在组件 setup 或 effectScope 内调用，
 * 卸载时通过 onScopeDispose 自动解除订阅）。
 *
 * 设计约定：
 * - 不引入额外状态层，直接对接 ConfigService / eventBus / ThemeManager；
 * - 所有订阅都返回取消函数并在作用域销毁时自动清理，避免弹窗重建泄漏；
 * - 组件内用户内容一律经 escapeHtml 转义后插值。
 */
import { shallowRef, onScopeDispose } from 'vue'
import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { ThemeManager } from '@/shared/theme'
import { escapeHtml } from '@/utils/common'
/** 注册作用域级自动清理 */
const disposeOnScope = cleanup => {
    onScopeDispose(() => {
        try {
            cleanup()
        } catch {
            // 清理失败不阻断作用域销毁
        }
    })
}
/**
 * 响应式订阅单个配置项。
 * - value：当前值（首次异步读取完成前为 undefined，可配合 loading）
 * - loading：首次读取是否完成
 * - set(value)：写入配置（本地立即同步 value；跨标签页由 config:changed 事件同步）
 */
export const useConfig = key => {
    const value = shallowRef(undefined)
    const loading = shallowRef(true)
    const load = async () => {
        try {
            value.value = await ConfigService.getValue(key)
        } finally {
            loading.value = false
        }
    }
    load()
    const off = eventBus.on(EVENT_NAMES.CONFIG_CHANGED, (_ctx, payload) => {
        if (payload && payload.key === key) value.value = payload.value
    })
    disposeOnScope(off)
    return {
        value,
        loading,
        set: async next => {
            await ConfigService.setValue(key, next)
            value.value = next
        }
    }
}
/** 订阅一个事件，作用域销毁时自动退订。handler 签名与 eventBus.on 一致：(ctx, ...payload) */
export const useEvent = (eventName, handler) => {
    const off = eventBus.on(eventName, handler)
    disposeOnScope(off)
}
/** 当前实际生效的主题 id（night/light/dark），随主题切换自动更新 */
export const useCurrentTheme = () => {
    const theme = shallowRef(ThemeManager.getTheme())
    disposeOnScope(ThemeManager.onChange(id => {
        theme.value = id
    }))
    return theme
}
export { escapeHtml }
