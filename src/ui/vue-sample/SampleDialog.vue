<template>
    <div class="vs-sample">
        <div class="vs-row">
            <span class="vs-label">配置项（界面主题）</span>
            <code class="vs-value">{{ themeSetting }}</code>
        </div>
        <div class="vs-row">
            <span class="vs-label">实际生效主题</span>
            <code class="vs-value">{{ currentTheme }}</code>
        </div>
        <p class="vs-note">Vue 渲染探针：响应式订阅 config:changed 与 ThemeManager，样式仅引用主题变量 var(--adj-*)。</p>
    </div>
</template>

<script setup>
import { useConfig, useCurrentTheme } from '@/ui/composables'
// useConfig('theme')：值变化由跨标签页 config:changed 事件实时同步
const { value: themeSetting } = useConfig('theme')
// useCurrentTheme()：跟随 data-adj-theme 实际生效主题（night/light/dark）
const currentTheme = useCurrentTheme()
</script>

<style scoped>
.vs-sample {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 14px;
}
.vs-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border: 1px solid var(--adj-border);
    border-radius: var(--adj-radius-sm);
    background: var(--adj-bg-surface);
}
.vs-label {
    color: var(--adj-text-secondary);
}
.vs-value {
    font-family: var(--adj-font-mono, ui-monospace, monospace);
    font-size: 13px;
    color: var(--adj-text-strong);
    background: var(--adj-bg-page);
    padding: 2px 8px;
    border-radius: 6px;
}
.vs-note {
    font-size: 12px;
    color: var(--adj-text-muted);
    line-height: 1.6;
}
</style>
