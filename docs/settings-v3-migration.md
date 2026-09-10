# 设置弹窗 Vue 化（V3）迁移说明

> 对应报告 P0-4：设置弹窗是高风险区，按「schema 驱动 + 等价迁移」推进。
> 当前状态：**已接线并生效**（`settings_panel` 默认 `v3`），保留经典渲染器作为回退与对比排查手段。

## 1. 当前状态

| 产物 | 状态 | 说明 |
|---|---|---|
| `src/ui/settings/controls/AdjTips.vue` | ✅ 生效 | 提示图标（`data-tooltip` 复用全局 tooltip） |
| `src/ui/settings/controls/AdjSwitch.vue` | ✅ 生效 | 开关（class 与经典一致：`.adjustment-switch` / `.on`） |
| `src/ui/settings/controls/SettingItemV3.vue` | ✅ 生效 | 单设置项：checkbox / input / select / radio + children + visible + inline |
| `src/ui/settings/SettingsPanelV3.vue` | ✅ 生效 | schema 驱动的整表渲染（含 section 与紧凑网格判定） |
| `src/ui/settings/index.js` | ✅ 生效 | `mountVueSettingsPanel`：懒加载 Vue + SFC，返回 `bridge` 与 `unmount` |
| `src/ui/settings/useSettingsPanel.js` | ✅ 备用 | 数据层（批量读 / `setValue` / 模型列表 / 跨标签同步）；宿主当前直接复用自己的事件链，故未强制使用 |
| `src/components/settings-component-v2.js` | ✅ 宿主 | 弹窗壳、事件归一、AI 特殊联动、导入导出、版本检查；表单渲染按 `settings_panel` 分流 |
| `src/ui/settings/DynamicSettingsForm.vue` | ➖ 已删除 | 动态页试点合并进 `SettingsPanelV3`（同一 schema 驱动实现，避免双实现） |

### 回退开关（便于本地对比验证）

设置项 **`settings_panel`**（在「基础设置」区，单选）：

- `v3`（默认）= Vue 面板 `SettingsPanelV3`；
- `v2` = 经典渲染器（`settings-renderer` 生成 HTML + 命令式事件绑定）。

切换后设置面板**立即重建并重新打开**，无需刷新页面；跨标签页切换也会触发本地重建。
若 V3 面板挂载失败（Vue/SFC 加载异常），宿主会**自动回退 v2** 并写入该配置，保证设置永远可用。

## 2. 等价性矩阵（V3 ↔ 经典）

| 行为 | 经典实现 | V3 实现 |
|---|---|---|
| 可见性 | `renderItem` 计算 `display:none/block` 包裹层 | 包裹层 `v-show`，条件同源（`visible(configs)`） |
| checkbox + children | `.adjustment-setting-children` + `anyChildVisible` | `childrenStyle` computed，条件与方向规则一致 |
| inline 紧凑开关 | `.adjustment-setting-item.inline-checkbox` | 同 class 的独立分支 |
| input + 校验按钮 | 内联样式按钮，`data-validate-for` | 同 class/同内联样式，`data-validate-for` 保留（宿主据此显示反馈） |
| select + 刷新按钮 | 原生 select 为数据中枢，无选项时 disabled + 「暂无可用选项」 | 同结构；选项来自 `dynamicOptions[id] || item.options` |
| radio | `.adjustment-radio-group` + `.adjustment-radio-item` | 同结构（受控 `:checked`，无需手动同步同组状态） |
| section | `.adjustment-section` + `.adjustment-section-content(.compact-grid)` | 同 class，`sectionLayoutClass` 判定 allInline |
| tips | `data-tooltip` + 全局 tooltip | `AdjTips` 输出相同属性 |
| 主题 | 全局 `--adj-*` 变量 | 未新增任何色值，沿用全局变量 |
| 自绘下拉 | `enhanceCustomSelects` + `refreshCustomSelects` | 同（挂载后再增强，列表刷新后同步） |

## 2.1 已知坑（务必遵守）

1. **SystemJS 下动态导入 SFC 取不到 `default`**：产物以 SystemJS（`@require systemjs` + `named-register`）承载模块，
   `await import('*.vue')` 得到的模块命名空间里 `default === undefined`，`createApp(mod.default)` 会在 Vue mount 阶段抛
   `Cannot read properties of undefined (reading 'render')`。**解决**：动态导入 `src/ui/settings/lazy-panel.js`
   （内部 `import SettingsPanelV3 from './SettingsPanelV3.vue'` + `export const SettingsPanelV3Component = ...`），
   宿主用命名导出取组件并做一次「像不像组件」的校验（`render/setup/template/props` 任一存在）。
   桥模块**禁止被静态 import**（否则 Vue 与 SFC 会进首屏关键路径）。同类修复见
   `src/modules/video/skip-manager/lazy-panels.js`（片段管理两个面板）。
2. **不要让 Vue 深度代理面板数据**：`schema` 用 `markRaw`；`configs` / `dynamicOptions` 走「普通对象快照 + 整引用替换」
   （`bridge.configs = { ...bridge.configs, [k]: v }`）。历史事故：`reactive({ schema, ... })` 会深度代理 schema 的嵌套数组，
   组件内 `every/some` 迭代代理数组时形成代理递归 → `Maximum call stack size exceeded`。
3. **递归渲染保险**：`SettingItemV3` 的 `depth` 上限（4 层），即使 schema 异常自引用也不会渲染溢出。
4. **渲染期错误自动回退**：`app.config.errorHandler → onError → fallbackToClassicPanel()`，写入 `settings_panel=v2` 并重建，
   保证面板异常时设置仍可用（带 `_fallingBack` 去重）。

## 3. 接线实现要点

1. **懒加载（红线）**：`settings-component-v2` 内**不再静态 import `vue` 或 `.vue`**；
   打开设置弹窗时经 `mountVueSettingsPanel`（`src/ui/settings/index.js`）动态加载 Vue 运行时与面板。
2. **响应式桥（host ↔ panel）**：`bridge = reactive({ schema, configs, dynamicOptions })`，
   `configs` 直接指向宿主的 `userConfigs`；宿主每次写配置都会经 `syncVueBridge(key, value)`
   再写一次代理，从而驱动面板重渲染（含跨标签同步、模型列表刷新）。
3. **事件归一**：面板的 `onChange` 统一进入 `handleVueConfigChange`，按设置项类型归一
   （input 去空格、checkbox 布尔化），随后复用经典模式的特殊联动
   （AI 供应商切换/凭证、自定义模型、日志级别、字幕开关），最后按需重建弹窗（`settings_panel` 切换）。
4. **按钮行为复用**：`handleValidateClick` / `handleRefreshClick` 从经典 DOM 绑定中抽出，
   经典模式由 DOM 事件调用，V3 由 `onValidate` / `onRefresh` 回调调用（反馈样式一致）。
5. **可见性归属**：V3 模式下宿主的 `refreshVisibility` / `handleChildrenVisibility` 直接返回，
   显隐完全由组件按 `configs` 派生，避免与 `v-show` 抢 DOM 造成抖动。
6. **生命周期**：弹窗 `closed` 事件与面板重建前均调用 `unmountVuePanel()`，避免 Vue 实例/副作用泄漏。

## 4. 本地验证清单

- [ ] 打开播放页设置：面板为 Vue 渲染（「基础设置 / AI 服务 / 更新配置 / 日志配置」四区）
- [ ] 开关、单选、下拉、输入框修改后即时生效，刷新页面后持久
- [ ] `自动定位至播放器` 子项（普通视频/番剧）显隐；`网页全屏模式解锁` 仅在默认模式为网页全屏时出现
- [ ] AI 区：提供商切换（保留各自 Key/模型）、API Key 校验反馈、模型列表刷新、自定义模型联动
- [ ] 「设置面板实现」切到经典渲染器 → 面板重建为经典样式；再切回新版 → 重建为 Vue 面板
- [ ] 跨标签页改设置：另一标签页的设置弹窗同步（不重启）
- [ ] 导出/导入配置、版本号点击检查更新、弹窗外点击/Esc 关闭、关闭后重新打开无报错
- [ ] 反复开关设置弹窗，无 detached DOM / 无滚动锁残留
