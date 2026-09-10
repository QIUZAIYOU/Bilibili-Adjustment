/**
 * 设置弹窗外壳渲染器
 *
 * Vue 化后表单内容全部由 Vue 面板（SettingsPanelV3.vue）渲染，本类只负责生成弹窗「壳」HTML：
 * 标题、版本号、推荐样式表、底部按钮组，以及由调用方传入的表单挂载点（formContent）。
 *
 * 原先的命令式表单渲染方法（render / renderItem / renderSection / renderCheckbox / renderInput /
 * renderSelect / renderRadio / renderTipsIcon / isVisible / resolveTips / escapeHtml / toPascalCase）
 * 已随经典渲染器一并移除：DOM 结构与 class 契约现由 Vue 组件保证
 * （见 src/ui/settings/SettingsPanelV3.vue 与 docs/settings-v3-migration.md）。
 */
export class SettingsRenderer {
    /**
     * 生成播放页设置弹窗 HTML
     * @param {string} title 标题
     * @param {string} version 版本号
     * @param {string} formContent 表单挂载点 HTML（由调用方提供，如 <div class="adjustment-form" id="VideoSettingsFormMount"></div>）
     * @param {string} [extraButtons] 额外按钮 HTML
     * @returns {string} 弹窗 HTML
     */
    renderPopover (title, version, formContent, extraButtons = '') {
        return `
            <bilibili-adjustment-video-setting id="VideoSettingsPopover" class="adjustment-popover" popover="manual" bilibili-adjustment-element>
                <div class="adjustment-popover-header">
                    <div class="adjustment-popover-header-top">
                        <div class="adjustment-popover-title">${title}</div>
                        <div class="adjustment-popover-version-wrap">
                            <div class="adjustment-popover-version" title="点击检查更新">v${version}</div>
                            <div class="adjustment-popover-version-status"></div>
                        </div>
                    </div>
                    <div class="adjustment-popover-subtitle">以下设置更改即生效，刷新页面即可应用</div>
                </div>
                <div class="adjustment-recommend">
                    推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a>
                </div>
                ${formContent}
                <div class="adjustment-buttonGroup">
                    <div id="ExportUserConfigs" class="adjustment-button secondary">导出配置</div>
                    <div id="ImportUserConfigs" class="adjustment-button primary">导入配置</div>
                    <input type="file" id="ImportUserConfigsFileInput" accept=".json" style="display:none">
                    ${extraButtons}
                </div>
            </bilibili-adjustment-video-setting>
        `.trim()
    }
    /**
     * 生成动态页设置弹窗 HTML
     * @param {string} title 标题
     * @param {string} version 版本号
     * @param {string} formContent 表单挂载点 HTML
     * @returns {string} 弹窗 HTML
     */
    renderDynamicPopover (title, version, formContent) {
        return `
            <bilibili-adjustment-dynamic-setting id="DynamicSettingsPopover" class="adjustment-popover" popover="manual" bilibili-adjustment-element>
                <div class="adjustment-popover-header">
                    <div class="adjustment-popover-header-top">
                        <div class="adjustment-popover-title">${title}</div>
                        <div class="adjustment-popover-version-wrap">
                            <div class="adjustment-popover-version" title="点击检查更新">v${version}</div>
                            <div class="adjustment-popover-version-status"></div>
                        </div>
                    </div>
                    <div class="adjustment-popover-subtitle">以下设置更改即生效，刷新页面即可应用</div>
                </div>
                <div class="adjustment-recommend">
                    推荐使用样式表：<a href="https://userstyles.world/style/241/nightmode-for-bilibili-com" target="_blank">「夜间哔哩 NightMode For Bilibili」</a>
                </div>
                ${formContent}
                <div class="adjustment-buttonGroup">
                    <button id="DynamicSettingsSaveButton" class="adjustment-button primary">保存</button>
                </div>
            </bilibili-adjustment-dynamic-setting>
        `.trim()
    }
}
