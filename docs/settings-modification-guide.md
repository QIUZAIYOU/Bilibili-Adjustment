# 修改设置项指南

> ⚠️ 本文件曾长期指向**已删除的文件与 API**（`settings.component.js`、`config.service.js` 的 `DEFAULT_VALUES` Map、`templates.js` 的 `[[占位符]]` 模板），已于 2026-10-23 整篇重写。
> 现在设置项只有**一套实现**（Vue 面板 + schema 驱动），细节见 [`docs/settings-panel.md`](./settings-panel.md)。

## 一、设置项长什么样

设置项全部由 **schema** 描述，宿主与组件都按 schema 渲染 —— **新增一个设置项只需要改 schema**，不要往宿主/渲染器里加任何分支代码。

schema 在 [`src/config/settings-config.ts`](../src/config/settings-config.ts)，分两组：`videoSettingsConfig`（播放页 / 首页共用）与 `dynamicSettingsConfig`（动态页）。

单个设置项的字段（节选自 `SettingItemSchema`）：

| 字段 | 作用 |
|---|---|
| `id` | 配置键名，**同时是存储键**（IndexedDB `user` 表） |
| `type` | 控件类型：`checkbox` / `select` / `input` / `radio` / `button` 等 |
| `label` | 显示名 |
| `tips` | 说明文字。**可以是字符串，也可以是函数** `(configs) => string`（用于插值其它配置值） |
| `category` | 左侧分组导航的归属 |
| `defaultValue` | 默认值；写在 schema 里，`ConfigService.DEFAULT_VALUES` 会自动派生，**不需要另行维护** |
| `options` | `select` / `radio` 的候选项（`{ value, label }`） |
| `inputType` | `input` 的类型（`text` / `number` / `password` …） |
| `children` | 子项数组，**递归渲染**（组件内用 `<SettingItem>` 自引用） |
| `visible` | `(configs) => boolean`，按当前配置决定是否显示 |

## 二、新增一个设置项要动哪些地方

1. **schema**（`src/config/settings-config.ts`）：加一条 `SettingItemSchema`。
2. **默认值的类型**：`defaultValue` 写在 schema 里即可，`ConfigService` 会据此派生默认类型（布尔项存 `'false'` 这类字符串时会被归一化，见下文「三」）。
3. **需要页面内交互**（比如要在播放器旁边加个按钮）：走模板 —— 放到 `src/shared/templates/` 下并在 `src/shared/templates/index.js` 合并，调用点用 `getTemplates.<key>`。
   模板契约：**必须保留全部 `[[占位符]]` 与 `id="..."`**（热更覆盖表据此校验），禁 `<script>`、禁内联事件、禁 `javascript:`。
4. **需要读 B 站页面结构**：走注册表 —— 选择器加进 `src/shared/element-selectors.ts` 的 `CSS_MAP`，结构正则加进 `src/shared/regexps.ts`。
   ⚠️ 模块里**不允许**写死 B 站页面选择器/结构正则，`npm run check:hot-content` 会拦。

## 三、几个必须知道的约定

- **配置归一化在写边界**：`ConfigService.setValue` / `setValues` / `initializeDefaults` / 跨标签页同步都会先跑 `normalizeConfigValue` 再写库。原生 `<select>` 的 value 恒为字符串（存的是 `'72'` 而不是 `72`），历史数据里复选框也可能存 `'false'` —— 不归一化会让 `Boolean(x)` 判断反了（issue #27 一类故障）。
- **必须写「Vue 响应式代理」而不是原始对象**：面板对 `configs` 做 `reactive()` 代理，trigger 只发生在代理上。宿主写配置必须走 `bridge.configs` / `bridge.dynamicOptions` 代理，写原始对象会绕过 set trap，表现为「开关点了不刷新 / `visible` 联动失效」。
- **Vue API 必须从桥模块的命名导出取**：`src/ui/settings/lazy-panel.ts`、`src/modules/video/skip-manager/lazy-panels.ts` 导出 `createApp` / `reactive` / `markRaw` 与组件。**禁止再 `import('vue')`** —— 产物按 chunk 分别压缩，`import('vue')` 与 SFC 依赖的运行时是**两份实例**（体积差约 19 KB gzip，行为也会不一致）。
- **组件模板里原生 select/input/radio 的事件绑定不可漏**：`select` 必须带 `@change`（历史上漏了 → 主题/模型下拉完全不触发）。
- **颜色一律 `var(--adj-*)`，层级一律 `var(--adj-z-*)`**：`npm run check:colors` 全仓断言兜底。
- **`tips` 里插值配置值有安全约束**：提示最终进 `tooltip.innerHTML`，配置值又可能来自用户导入的配置文件 —— `tips` 的插值结果会经 `sanitizeTooltipHtml`（`src/utils/sanitize-html.ts`）白名单消毒，只放行 `<br>` 与 http(s) 的 `<a>`。
- **页型判据只有一处**：`src/utils/page-type.ts`；不要在别处另写一份路径正则。

## 四、导入导出

设置项的导入导出在 `src/components/settings-dialog.ts`，纯逻辑在 `src/utils/settings-transfer.ts`：

- 导出：`buildSettingsExportPayload` 生成 JSON，文件名用**本地日期**（`formatLocalDateStamp`）。
- 导入：`parseSettingsPayload` → `splitKnownEntries`（已知项生效、未知项原样保留并**明确告知**用户有几项没生效，不静默丢数据）→ `storageService.batchSet`。
- 上限 `MAX_IMPORT_ENTRIES = 500` 项。
- 回归：`test/settings-transfer.test.ts`。

## 五、相关文件速查

| 文件 | 职责 |
|---|---|
| `src/config/settings-config.ts` | 设置项 schema（**新增设置项改这里**） |
| `src/services/config.service.ts` | 读写配置、默认值派生、跨标签页同步 |
| `src/config/config-normalize.ts` | 配置值类型归一化（纯函数，可单测） |
| `src/components/settings-dialog.ts` | 宿主：弹窗壳装配、事件归一、AI 联动、导入导出、版本检查 |
| `src/components/settings-shell-renderer.ts` | 弹窗壳 HTML |
| `src/ui/settings/SettingsPanel.vue` | 面板主体 |
| `src/ui/settings/controls/SettingItem.vue` | 单个设置项控件（递归渲染 children） |
| `src/ui/settings/index.ts` | `mountVueSettingsPanel`（懒加载入口） |
| `src/ui/settings/lazy-panel.ts` | 命名导出桥（组件 + Vue API 同源） |
| `src/utils/settings-transfer.ts` | 导入导出纯函数 |
