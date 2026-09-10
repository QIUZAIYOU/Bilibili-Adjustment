# 设置弹窗 Vue 化（V3）迁移说明

> 对应报告 P0-4：设置弹窗是下一个高风险区，必须「schema 驱动 + 分区等价迁移」，不建议一次性重写。
> 用户决策：**先创建 V3 版本文件，后续再替换当前 V2**（本文件即为该决策的落地说明）。

## 1. 当前状态

| 产物 | 状态 | 说明 |
|---|---|---|
| `src/ui/settings/controls/AdjTips.vue` | ✅ 新建 | 提示图标（`data-tooltip` 复用全局 tooltip） |
| `src/ui/settings/controls/AdjSwitch.vue` | ✅ 新建 | 开关（class 与 V2 一致：`.adjustment-switch` / `.on`） |
| `src/ui/settings/controls/SettingItemV3.vue` | ✅ 新建 | 单设置项：checkbox / input / select / radio + children + visible + inline |
| `src/ui/settings/SettingsPanelV3.vue` | ✅ 新建 | schema 驱动的整表渲染（含 section 与紧凑网格判定） |
| `src/ui/settings/useSettingsPanel.js` | ✅ 新建 | 数据层：批量读、`setValue`、模型列表动态选项、跨标签同步 |
| `src/components/settings-renderer.js` + `settings-component-v2.js` | ⏳ 仍在运行 | V2 线上生效，未接线 V3 |
| `src/ui/settings/DynamicSettingsForm.vue` | ✅ 已接入（动态页试点） | 由 `settings-component-v2.renderDynamicSettings` 挂载 |

V3 组件当前**未接线**（无消费者），仅作为替换 V2 的落地物；这是刻意的阶段性状态，
避免「试点 + 旧实现」双轨同时生效造成行为漂移。

## 2. 等价性矩阵（V3 ↔ V2）

| 行为 | V2 实现 | V3 实现 |
|---|---|---|
| 可见性 | `renderItem` 计算 `display:none/block` 包裹层 | 包裹层 `v-show`，条件同源（`visible` 函数以 configs 求值） |
| checkbox + children | `.adjustment-setting-children`，`anyChildVisible` 判定 | `childrenStyle` computed，条件与方向规则一致 |
| inline 紧凑开关 | `.adjustment-setting-item.inline-checkbox` | 同 class 的独立分支 |
| input + 校验按钮 | 内联样式按钮，`data-validate-for` | 同 class/同内联样式，`data-validate-for` 保留 |
| select + 刷新按钮 | 原生 select 为数据中枢，无选项时 disabled + 「暂无可用选项」 | 同结构；选项来自 `dynamicOptions[id] || item.options` |
| radio | `.adjustment-radio-group` + `.adjustment-radio-item` | 同结构 |
| section | `.adjustment-section` + `.adjustment-section-content(.compact-grid)` | 同 class，`sectionLayoutClass` 判定 allInline |
| tips | `data-tooltip` + 全局 tooltip 组件 | `AdjTips` 输出相同属性 |
| 主题 | 全局 `--adj-*` 变量 | 未新增任何色值，沿用全局变量 |

## 3. 接线步骤（后续替换 V2 时）

1. **宿主改造**：设置弹窗（`video.module` / `dynamic.module` 的 `SettingsComponentV2`）中，
   把 `settingsRenderer.render(userConfigs, dynamicOptions)` 的 HTML 注入替换为 Vue 挂载点，
   参考动态页试点的 `#DynamicSettingsFormMount` 模式（`createApp` + `closed` 时 `unmount`）。
2. **数据层接线**：`useSettingsPanel(videoSettingsConfig)` 提供 `configs/dynamicOptions/loading`，
   `setValue` 走 `ConfigService.setValue`（缓存 + 跨标签广播 + theme 即时生效）。
3. **事件接线**：
   - `change` → `setValue(key, value)`（数字型 input 需 `Number()` 转换，与 V2 一致）；
   - `validate` → `validateApiKey` 并回写提示；
   - `refresh` → `refreshModels('ai_model')` 刷新模型下拉；
   - `ConfigService` 的 `config:changed` → 已由 `useSettingsPanel` 订阅，跨标签同步自动生效。
4. **分区批次**（建议顺序）：动态页表单（已在试点）→ 基础设置区 → AI 区（最重）→ 更新/日志区 → 导出/导入按钮区。
5. **删除 V2**：全部区迁移且验收通过后再移除 `settings-renderer.js` 与 `settings-component-v2.js` 中的
   表单渲染分支，避免长期双轨。

## 4. 验收清单（每批次）

- [ ] 默认值 → 渲染 → 修改 → `ConfigService.setValue` → `config:changed` → 跨标签同步 → 刷新页面后持久
- [ ] `visible` / `children` 联动在切换父项后即时重算
- [ ] AI 区：provider / 自定义模型 / API Key（password）/ 模型列表刷新 / Key 校验
- [ ] `npm run check:colors` 无字面色值；无贴边（内容 padding 归属正确）
- [ ] 开关/输入/下拉/Tab 键盘操作可用；弹窗 Esc 关闭并归还焦点
- [ ] 反复打开关闭 50 次无 detached Vue app（性能面板手动确认）
