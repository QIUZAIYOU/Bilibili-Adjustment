# 设置弹窗（弹窗壳 + Vue 面板）

> 2026-09-16：设置弹窗只有**一套**实现——弹窗壳由 TS 宿主生成、表单由 Vue 面板按 schema 渲染。
> 历史上的命令式表单渲染器（`settings.component.js`）与 `settings_panel`（`v3`/`v2` 切换项）、
> 渲染期错误自动回退等分支已全部删除；本轮又把残留的 `v2`/`V3` 命名与注释清理干净
> （`settings-component-v2` → `settings-dialog`、`settings-renderer` → `settings-shell-renderer`、
> `SettingsPanelV3` → `SettingsPanel`、`SettingItemV3` → `SettingItem`）。
> **以后所有设置弹窗的调整都改这套代码，仓库里不存在"旧版本"可回退。**

## 1. 文件与职责

| 文件 | 职责 |
|---|---|
| `src/components/settings-dialog.ts`（`SettingsDialogHost`） | 宿主：装配弹窗壳、挂载/卸载 Vue 面板、配置与动态选项同步、特殊联动（AI 凭证与模型、日志级别、字幕开关）、导入导出、版本检查、左侧分组导航 |
| `src/components/settings-shell-renderer.ts`（`SettingsShellRenderer`） | 只生成弹窗「壳」HTML（标题、版本号、推荐样式表、底部按钮组 + 表单挂载点），**不含任何表单/设置项渲染** |
| `src/ui/settings/SettingsPanel.vue` | schema 驱动的整表渲染（section、紧凑网格判定、visible） |
| `src/ui/settings/controls/SettingItem.vue` | 单设置项：checkbox / input / select / radio + children 递归 + visible + inline；`depth` 上限 4 层防递归溢出 |
| `src/ui/settings/controls/AdjSwitch.vue` / `AdjTips.vue` | 开关与提示图标（DOM/class 直接复用全局样式与 tooltip 事件委托） |
| `src/ui/settings/index.ts` | `mountVueSettingsPanel`：懒加载 Vue + SFC，建立响应式桥，返回 `bridge` / `unmount` |
| `src/ui/settings/lazy-panel.ts` | 懒加载桥：导出面板组件与**同源** Vue API（只能被动态 import） |
| `src/ui/settings/nav-scroll-spy.ts` | 左侧悬浮导航的「当前分组」判定（纯函数，回归用例 `test/settings-nav-spy.test.ts`） |

数据源唯一：`src/config/settings-config.ts` 的 schema（`videoSettingsConfig` / `dynamicSettingsConfig`）。
新增设置项只改 schema，不要往宿主或渲染器里加实现。

## 2. 红线（改动前必读）

1. **懒加载**：任何首屏路径（`main.ts`、模块顶层、宿主文件顶层）**禁止**静态 import `vue` 或 `.vue`；
   只能在交互处 `await import('./lazy-panel')`。桥模块本身也禁止被静态引入。
2. **Vue API 必须与组件同源**：产物按 chunk 分别压缩，`import('vue')` 与 SFC 依赖的 `runtime-core`/`runtime-dom`
   是两份运行时实例；宿主一律用桥导出的 `createApp/reactive/markRaw`。
3. **必须写响应式代理**：`mountVueSettingsPanel` 回传 `bridge.configs` / `bridge.dynamicOptions`，
   宿主所有写入路径（`saveConfig`、`syncVueDynamicOptions`、跨标签 `config:changed`）都必须经它们；
   写原始对象会绕过 set trap，面板永不重渲染。
4. **禁 `terser.mangle.properties`**：产物按 chunk 分别压缩，同名属性在不同 chunk 会被压成不同名字，
   破坏 Vue 内部属性协议，表现为所有 Vue 弹窗 mount 抛 `reading 'render'`。
5. **DOM/class/id 是契约**：`.adjustment-setting-item`、`.adjustment-setting-children`、`.inline-checkbox`、
   `ValidateXxx` / `RefreshXxx` 按钮 id、`data-validate-for` / `data-refresh-for` / `data-tooltip`
   被全局样式、自绘下拉与 tooltip 事件委托依赖，改名前先看 `src/shared/styles` 与 `components/custom-select.ts`。
6. **主题色只走变量**：一律 `var(--adj-*)`，`npm run check:colors` 全仓断言兜底。
7. **递归子项按文件名自引用**：`SettingItem.vue` 内部用 `<SettingItem>` 渲染 children
   （SFC 隐式自引用，编译为 `_resolveComponent("SettingItem", true)`），改名时两处要同步。
8. **弹窗元素上禁止直接写 `display`**：popover 关闭态的隐藏依赖 UA 规则
   `[popover]:not(:popover-open) { display: none }`，作者级 `display` 会覆盖它导致关闭后仍可见；
   需要 flex 布局时放在弹窗内部容器上。

## 3. 宿主 ↔ 面板接线

1. 宿主渲染弹窗壳（表单挂载点 `#VideoSettingsFormMount` / `#DynamicSettingsFormMount` 本身就是 `.adjustment-form` 容器）；
2. `mountVuePanel` 动态加载面板，把宿主持有的 `userConfigs` 与动态选项对象**按引用**交给桥，
   桥对它们做 `reactive` 代理并回传（schema 用 `markRaw`）；
3. 面板交互经 `onChange` / `onValidate` / `onRefresh` 回到宿主：
   `handleVueConfigChange`（input 去空格、checkbox 布尔化 → 落库 → 特殊联动）、
   `handleValidateClick`、`handleRefreshClick`；
4. 可见性/children 显隐完全由组件按 `configs` 派生，宿主不再操作 DOM（避免与组件 patch 抢 DOM）；
5. 弹窗 `closed` 与面板重建前必须 `unmountVuePanel()`（同时清理分组导航的 observer 与滚动监听），
   否则 Vue 实例、响应式副作用与全局监听都会泄漏；
6. 面板渲染期异常经 `app.config.errorHandler → onError → showPanelLoadFailure` 在挂载点内显示
   轻量提示 + 重试按钮（不回退任何旧实现，也不写库）。

## 4. 悬浮分组导航

- 与弹窗同开同关，作为弹窗的兄弟节点挂在 `document.body`（弹窗自身 `overflow-x: hidden` 会裁掉它）；
- 顶部按**实测的头部下边框**定位，不写死高度；
- 点击跳转与「当前分组高亮」必须用**同一个基准**（头部下边框）：跳转会在头部下缘下留 12px，
  高亮容差 16px；若改用弹窗顶边加固定阈值，sticky 头部高度会把判定压低一格，
  出现「点『评论区』右侧停在评论区，导航却亮『画质、音质与字幕』」的错位（已由回归用例锁定）；
- 滚到底时按边界兜底高亮最后一个可见分组（内容高度不足时末尾分组顶不到头部下缘）。

## 5. 验证清单

- [ ] 打开播放页设置：面板渲染为「基础设置 / AI 服务 / 更新配置 / 日志配置」等分组
- [ ] 开关、单选、下拉、输入框修改后即时生效，刷新页面后持久
- [ ] 点击左侧导航每一项：右侧停靠位置与导航高亮一致（含末尾分组、隐藏分组）
- [ ] `自动定位至播放器` 子项（普通视频/番剧）显隐；`网页全屏模式解锁` 仅在默认模式为网页全屏时出现
- [ ] AI 区：提供商切换（保留各自 Key/模型）、API Key 校验反馈、模型列表刷新、自定义模型联动
- [ ] 跨标签页改设置：另一标签页的设置弹窗同步（不重启）
- [ ] 导出/导入配置、版本号点击检查更新、弹窗外点击/Esc 关闭、关闭后重新打开无报错
- [ ] 反复开关设置弹窗，无 detached DOM / 无滚动锁残留
- [ ] `npm run typecheck && npm test && npm run check:colors && npm run build && npm run stats`
