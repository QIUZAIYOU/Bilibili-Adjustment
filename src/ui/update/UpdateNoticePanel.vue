<template>
    <!-- 根节点与旧实现拼接的 HTML 完全一致：.adjustment-form > .adjustment-form-item > 版本信息 + 更新列表 -->
    <div class="adjustment-form">
        <div class="adjustment-form-item">
            <div class="adjustment-version">
                <div>当前版本: {{ currentVersion }}</div>
                <div>最新版本: {{ latestVersion }}</div>
            </div>
            <ul v-if="!isLatest && items.length > 0" class="adjustment-update-contents">
                <li
                    v-for="(item, index) in items"
                    :key="index"
                    class="adj-update-item"
                    :class="{ 'is-latest': index === 0 && item.version !== '' }"
                >
                    <span v-if="item.version" class="adj-update-ver">{{ item.version }}</span>
                    <span class="adj-update-desc">{{ item.desc }}</span>
                </li>
            </ul>
            <div v-else class="adjustment-update-contents">{{ isLatest ? '当前已是最新版本' : '暂无更新说明' }}</div>
        </div>
    </div>
</template>
<script setup>
/**
 * 更新通知弹窗内容面板
 *
 * 由 src/services/update.service.js 通过懒加载挂载进通用弹窗 openAdjustmentDialog 的
 * 内容区（见 src/ui/update/index.js）。弹窗外壳、标题、按钮与 a11y 均由宿主提供。
 *
 * 保真要点（旧实现为字符串拼接 HTML）：
 * - class 契约完全保留：.adjustment-form/.adjustment-form-item/.adjustment-version/
 *   .adjustment-update-contents/.adj-update-item/.is-latest/.adj-update-ver/.adj-update-desc，
 *   因此 src/shared/styles/index.js 中的更新弹窗样式无需改动；
 * - 无更新说明时渲染的是 div.adjustment-update-contents（旧实现同样是 div，不是 ul）；
 * - is-latest 仅加在第一条带版本号的条目上（与旧实现正则命中分支一致）。
 */
defineProps({
    /** 当前版本号 */
    currentVersion: { type: String, default: '' },
    /** 最新版本号 */
    latestVersion: { type: String, default: '' },
    /** 已解析的更新条目：[{ version, desc }]，version 为空表示该条无版本号 */
    items: { type: Array, default: () => [] },
    /** 已是最新版本（手动检查时的反馈弹窗）：不展示更新列表，只提示已是最新 */
    isLatest: { type: Boolean, default: false }
})
</script>
