# TypeScript 迁移方案

> 结论：**可行**，且只作用于源码期 —— 产物仍是「vite + terser + obfuscator」单文件用户脚本，
> 发布链路（`dist/*.user.js` → `scripts/upload.py`）完全不变，AGENTS.md 里的产物级红线
> （禁 `mangle.properties`、SystemJS 命名导出桥、Vue 懒加载）与源码语言无关。
>
> 阶段 0（基建 + 护栏）已落地，业务代码尚未迁移。
>
> **⚠️ 命名已变更（2026-09-16）**：本文下面的阶段记录里出现的旧文件名是**当时的事实**（连同当时的行数），
> 保留不改。当前对应关系：`components/settings-component-v2` → `components/settings-dialog`、
> `components/settings-renderer` → `components/settings-shell-renderer`、
> `ui/settings/SettingsPanelV3.vue` → `ui/settings/SettingsPanel.vue`、
> `ui/settings/controls/SettingItemV3.vue` → `ui/settings/controls/SettingItem.vue`
> （原因：设置弹窗只剩 Vue 一套实现，去掉 v2/V3 版本号命名；详见 `docs/settings-panel.md`）。

## 1. 实测证据（阶段 0 验收）

| 验证项 | 结果 |
|---|---|
| `.ts` 入口经全管线构建 | `vite build`（terser + obfuscator + vite-plugin-monkey）通过，4.2s |
| 产物与 `.js` 入口对比 | **逐字节相同**：raw 466680 / gzip 144204（相同配置、相同 userscript 元数据） |
| 给入口加真实类型后 | 仍逐字节相同 —— `import type`、`Map<string, unknown>`、`Record<string, () => Promise<unknown>>`、返回类型标注全部被剥离，不留运行时代码 |
| `npm run typecheck` | 通过（`vue-tsc --noEmit`，TS 6.0.3） |
| `npm test` | 146 passed（`test/hooks.js` 已支持 `.ts` 解析） |
| `python scripts/check-theme-colors.py` | 通过（扩展名已覆盖 `.js/.ts/.vue`） |

## 2. 阶段 0 落地的文件

| 文件 | 作用 |
|---|---|
| `tsconfig.json` | `allowJs: true` + `checkJs: false`：`.js` 与 `.ts` 并存，类型检查只对有类型的文件生效 |
| `src/types/global.d.ts` | 全局补丁：`window.__INITIAL_STATE__`、`window.__TemplateRegistry__`、`unsafeWindow`、`import.meta.env` |
| `package.json` | 新增 `typecheck` 脚本；`test` 覆盖 `*.test.ts`；`lint:fix` 覆盖 `.ts` |
| `eslint.config.js` | `.ts` 走 `typescript-eslint` 解析；关闭与 TS 冲突的 `no-undef` / `no-unused-vars` |
| `test/hooks.js` | 省略扩展名的导入按 `.js` → `.ts` 顺序补全（Node 22 原生类型剥离，无需 ts-node） |
| `scripts/check-theme-colors.py` | 扫描范围 `.js/.ts/.vue`（否则主题红线在迁移后**无声失效**） |
| `.github/workflows/build.yml` | PR 增加 `npm run typecheck` |

新增 devDependencies：`typescript@^6.0.3`、`vue-tsc@^3.3.11`、`typescript-eslint@^8.70.0`。

## 3. 迁移阶段（每阶段独立可发布）

| 阶段 | 内容 | 说明 |
|---|---|---|
| 1 ✅ | 8 个 `.vue` 加 `lang="ts"`，`defineProps`/`defineEmits` 泛型化 | **已完成**，实测记录见 §7 |
| 2 🔄 | `src/shared/`、`src/utils/` 改 `.ts` | 进行中，已完成 21 个模块（见 §8–§12） |
| 3 | `src/services/`（config、storage、`IndexedDBService` 泛型化、logger、update、ai） | 类型收益最大的一段 |
| 4 | `src/modules/`、`src/components/`、`src/core/module-system.ts`、`src/main.ts` | 需要先定义模块接口 |
| 5 | 收尾：`allowJs: false`、`checkJs: true`，可选启用类型感知 lint | —— |

**不建议迁移**：`src/shared/styles/*.js`（纯 CSS 字符串，约 2000 行）、`src/shared/templates/*`（字符串模板）——
几乎不需要类型，强行标注只是增加维护成本。

## 4. 硬性约束（迁移期间必须遵守）

1. **禁 `enum` / `namespace` / 构造函数参数属性**：esbuild 与 Node 的类型剥离都**不做类型转换**，且 `enum` 会产出运行时代码。实测转译结果：
   - `enum Probe { A = 'a' }` → `var Probe = ((Probe2) => { Probe2["A"] = "a"; return Probe2 })(Probe || {})`（IIFE + 改写属性访问）
   - `const Probe = { A: 'a' } as const` → 与源码一致，零运行时开销
   - 统一用 `as const` 对象（与现有 `EVENT_NAMES` / `STORAGE_KEYS` 风格一致）。
2. **`tsconfig` 的 `target` 保持 `ESNext`**：语法降级统一交给 terser（`ecma: 5`），避免 esbuild 提前降级破坏 `#private` 语义、或与 terser 重复处理。
3. **不引入 `ts-node` / `tsx`**：Node 22.18+ 默认启用类型剥离，测试直接跑 `.ts` 即可。
4. **`.d.ts` 与 `.ts` 同样受代码风格约束**：`no-multiple-empty-lines` 的 `max: 0` 意味着源码中不留空行（`src/types/global.d.ts` 已按此写）。
5. **主题红线**：新增 `.ts`/`.vue` 同样禁止字面色值，`npm run check:colors` 已覆盖；改颜色仍须三主题同步（见 theme-system 文档）。
6. **Vue 侧红线不变**：桥模块导出 `createApp` 等 API，禁止再 `import('vue')`；类型层也走桥导出的类型，不要为图省事引入第二份 Vue 类型来源。

## 5. 已实测的迁移阻力（按影响面排序）

1. **`catch (error)` 的变量在 `strict` 下是 `unknown`**：全仓 **86 个 catch 块**、其中 **27 处**直接访问 `error.message` / `error?.message`。
   迁移到 `.ts` 时会逐个报 `TS18046` / `TS2339`。推荐统一写法（可先在 utils 加一个 `toError(e: unknown): Error` 归一化函数）。
2. **`unknown` 沿数据结构传播**：`Map<string, unknown>` 这类容器一旦标注过宽，下游取值立刻报错（阶段 0 探针即复现 `TS18046: 'module' is of type 'unknown'`）。
   真实迁移时应在 `src/core` 定义 `ModuleDefinition` / `ModuleInstance` 接口，而不是到处断言。
3. **`Object.create(moduleDef)` + 逐方法 `bind` 的动态实例化**（`src/core/module-system.js`）：TS 无法推导，必须显式接口 + 断言。
4. **配置键与值（`ConfigService.getValue(name)`）**：字符串键、值来自 IndexedDB。建议从 `src/config/settings-config.js` 用 `as const` 派生键/值映射，先 `getValue<T = unknown>` 过渡。
5. **测试 stub（`test/browser-stubs.js`）**：手工 DOM stub 满足不了 DOM 接口定义。测试侧建议保持 `checkJs: false`，或集中用一次 `as unknown as typeof document` 断言。
6. **动态属性挂载**（`error.moduleSystemContext = ...`、`el._xxx = ...`）：需在 `src/types/` 里声明，别用 `as any` 铺开。

## 6. 验证清单（每次改动后）

```bash
npm run typecheck                  # vue-tsc --noEmit
npm test                           # 146+ 用例，含 .ts 用例
python scripts/check-theme-colors.py
npx eslint . --ext .js,.ts
npm run build && npm run stats     # 产物体积门禁（相对 scripts/build-baseline.json）
```

## 7. 阶段 1 已完成：8 个 SFC 迁移到 TS

改动：全部 SFC 的 `<script setup>` → `<script setup lang="ts">`；props/emits 改为类型化声明
（`defineProps<T>()` + `withDefaults` / `defineEmits<{...}>()`），并新增两个共享类型契约文件：

| 文件 | 内容 |
|---|---|
| `src/config/settings-schema.d.ts` | 设置项 schema 类型（`SettingItemSchema` / `SettingOption`），供 V3 设置面板消费 |
| `src/modules/video/skip-manager/types.d.ts` | `SkipSegment` / `SkipCacheEntry` / `SkipEpisode` / `SkipManagerEnv`（含 storage / season / recognize 精确签名） |

实测：`npm run typecheck` 从 **207 个错误 → 0**；`npm test` 146 passed；构建与体积门禁通过
（主产物 gzip 146.47 KB，迁移前 146.39 KB，差 0.05%）。

### 7.1 运行时契约差异（已逐项核对，生产构建无影响）

用 `@vue/compiler-sfc` 编译 HEAD 版本与迁移后版本对比 props/emits 运行时声明，差异只有三类：

1. **`interface` 类型的 prop 被推断为 `type: null`**（原为 `type: Object`），函数类型变 `[Function, null]`
   （如 `env`、`item`、`searchInput`、`onChange`）——原因是编译器无法从 interface 推断运行时构造器。
   **影响**：Vue 的 prop 类型校验只在 dev 构建（`__DEV__`）执行，用户脚本是生产构建，产物行为完全一致，
   仅开发期少一层类型警告。
2. **显式 `required: false`**：`{ type: Boolean, default: false }` → 多出 `required: false`（语义等价）。
3. **emits 引号**：`['change']` → `["change"]`（等价）。

另一处编译产物差异：`lang="ts"` 后 SFC 编译为 `_defineComponent({...})`（并 import `defineComponent`）；
TS 模式下模板绑定分析更精确，`__returned__` 不再暴露模板未使用的 setup 绑定（体积略减、无行为影响）。

### 7.2 类型迁移暴露的既有缺陷（2 处）

1. `BangumiSkipManager.vue` 模板引用未定义变量 `editing`（实际绑定为 `viewEditing`）——
   「暂存区正在编辑」高亮从未生效。**已修复**为 `viewEditing === si`（不修无法通过编译）。
2. `SkipManagerMainPanel.vue` 的覆盖选择：`overlayResolve` 回传的是 `'pick'` 字符串，而 `picked.includes(i)`
   期望索引数组 → 恒为 false，「覆盖选中」实际等价于「覆盖全部」。
   **已修复**：改为在 overlay 清空前回传勾选索引（与 `BangumiSkipManager` 的 `modalResolve` 写法一致），
   未勾选的已有片段现在会被保留，与弹层文案（「未勾选的片段将保留」）一致。

### 7.3 下一步（阶段 2）

`src/shared/`、`src/utils/` 改 `.ts`（叶子模块，有单测兜底）。建议同时把 `src/config/settings-config.js`
与 `src/utils/update-items.js` 迁到 `.ts`，即可删除本阶段新增的两个 `.d.ts` 契约文件（类型改由事实源导出）。

## 8. 阶段 2 进展：叶子模块迁移（已完成 7 个文件）

已迁移文件（重命名，导入处无需改动 —— 例外见 §8.1）：

| 原文件 | 产出类型 |
|---|---|
| `src/shared/constants.js` → `.ts` | `EventName` / `StorageKey`（`as const` 字面量联合，事件名拼写可静态校验） |
| `src/utils/update-items.js` → `.ts` | `UpdateItem`（`UpdateNoticePanel.vue` 已改为复用，删掉了重复 interface） |
| `src/utils/ai-json.js` → `.ts` | 三个解析函数的签名精确化 |
| `src/utils/lodash-lite.js` → `.ts` | `DebounceOptions` / `DebouncedFn` / `ThrottledFn`，`chunk` 泛型化 |
| `src/shared/perf.js` → `.ts` | `PerfRecord`（`window.BA_PERF` 已在 `src/types/global.d.ts` 声明） |
| `src/utils/dom-wait.js` → `.ts` | `WaitForConditionOptions` |
| `src/utils/retry-queue.js` → `.ts` | `RetryResult` |

验收：`npm run typecheck` 0 错误、`npm test` 146 passed、`eslint` / `check:colors` 通过、
构建与体积门禁通过（主产物 gzip 146.48 KB，迁移前 146.39 KB）。

### 8.1 迁移期踩到的两个坑（已固化处理方式）

1. **显式带 `.js` 扩展名的导入不会回退到 `.ts`**（vite 与 Node 行为一致）：
   `test/ai-json.test.js` 原本写 `'../src/utils/ai-json.js'` → 迁移后 `ERR_MODULE_NOT_FOUND`，
   表现为「单个测试文件整体失败、用例数从 146 掉到 130」。
   **处理：调用点去掉扩展名**。同类隐患：`src/main.js` 的 3 处 `import('@/modules/*.module.js')`，
   迁移 `video/home/dynamic.module.js` 时必须同步改。
2. **`@typescript-eslint/no-this-alias` 会拦截 lodash 语义**：`lodash-lite` 的 `debounce`/`throttle`
   需要把 `this` 透传给原函数，已在 `eslint.config.js` 的 `.ts` 块显式关闭该规则（附理由注释）。

### 8.2 阶段 2 剩余

`src/utils/common.js`（664 行，有单测）、`src/shared/regexps.js`（477 行，有单测）、
`src/shared/element-selectors.js`（521 行）、`src/shared/theme/*`、`src/shared/bili-apis.js`、
`src/utils/http.js`、`src/utils/dialog-a11y.js` 等。
`src/shared/styles/*`、`src/shared/templates/*` 为纯字符串常量，**保持 `.js` 不迁移**。

## 9. 阶段 2 续：两个核心工具模块迁移

| 原文件 | 行数 | 产出类型 |
|---|---|---|
| `src/utils/common.js` → `.ts` | 664 | `PageType`、`ElementSizeChangeCallback`、`DocumentScrollToOptions`、`ExecuteFunctionsOptions`、`IsTabActiveOptions`、`HrefChangeCallback`、`AdjustmentConfirmButton`、`AdjustmentConfirmOptions`、`InsertionMethod`、`PopoverInstance`、`PopoverInitOptions`、`PopoverManager` |
| `src/shared/regexps.js` → `.ts` | 477 | `MentionDescItem`（模块内 `TextNodeReplacer`） |

`common.ts` 是调用面最广的工具模块（`detectivePageType` / `insertStyleToDocument` / `monitorHrefChange` /
`adjustmentConfirm` / `popoverManager` 等），所以这轮顺带收敛了几类边界形状：

- `documentScrollTo` / `isTabActive` / `executeFunctionsSequentially` 的 options 具备显式接口（以前只能靠 JSDoc）；
- popover 管理器（`register` / `init` / `show` / `hide` / `destroy` / `get`）具备 `PopoverManager` 接口；
- DOM 事件回调统一标注为 `MouseEvent` / `KeyboardEvent` / `ToggleEvent`，`ToggleEvent.newState` 不再走 any。

### 9.1 本轮的三处等价改写（行为不变）

1. `createElementAndInsert` 的 `target[method](...)` 动态调用 → 显式 `inserters` 映射（并一次性收窄为 `Node & ParentNode & ChildNode`）；
2. `replacer(textNode.textContent)` → `replacer(textNode.textContent ?? '')`（文本节点的 textContent 运行时恒为 string）；
3. `btn.dataset.key` → `(btn as HTMLElement).dataset.key`，配合 `key ?? ''`（按钮 DOM 恒带 `data-key`）。

另有一处是**放宽而非收紧**：`lodash-lite` 的 `reduce` 签名由 `Record<string, T>` 放宽为 `object`、`value` 交给调用方收窄
—— 因为 `CSSStyleDeclaration` 没有字符串索引签名；这样 `getElementComputedStyle` 仍可原样遍历计算样式。

## 10. 阶段 2 续：元素选择器系统迁移

| 原文件 | 行数 | 产出类型 |
|---|---|---|
| `src/shared/element-selectors.js` → `.ts` | 521 | `ElementSelectorsApi`（对外 API 接口）、`SelectorPageType`（比 `PageType` 多 `bangumi`）；`CSS_MAP` / `shadowDomSelectors` 标注为 `Record<string, string>` |

要点：

- `syncQuery` / `asyncWait` 改用**函数重载**表达「按 `all` 决定返回单元素还是数组」：
  `syncQuery(key, true): Element[]`、`syncQuery(key, false): Element | null`。于是 `elementSelectors.get / queryAll / wait`
  的返回类型各自精确，调用方不需要断言；
- 为通过「动态方法名」的类型检查，`asyncWait` 里 `document[queryMethod](selector)` 展开为 `if (all) { ... } else { ... }`
  两个分支（`querySelector` / `querySelectorAll` 的语义与判定顺序完全保持）；
- 两个缓存 Map 补上键值类型：`Map<string, number>`（负缓存 TTL）、`Map<string, { element; observer }>`（元素缓存）；
- `PAGE_TYPE_EXCLUSIVE` 用 `Record<Exclude<SelectorPageType, 'other'>, Set<string>>` 约束（页型门控本就不含 `other`）。

行为等价性：本轮**没有逻辑改写**，只有两处形状调整 —— 「动态方法名 → 显式分支」与「`.filter(Boolean)` → 类型守卫 `(sel): sel is string`」。

## 11. 阶段 2 续：主题系统迁移（`src/shared/theme/*`）

551 行 / 5 个文件全部迁到 `.ts`：

| 原文件 | 产出类型 |
|---|---|
| `tokens.js` → `.ts` | 纯数据表，**零改动**重命名（`sharedTokens` / `defaultColors` / `defaultShadows` / `colorTokenKeys`） |
| `themes.js` → `.ts` | `ThemeDefinition`（id/label/colors/shadows/shared）、`ThemeId`（`'night' \| 'light' \| 'dark'`）；`THEMES` 标注为 `Record<ThemeId, ThemeDefinition>` |
| `manager.js` → `.ts` | `ThemeManagerApi`（init / setTheme / getTheme / getThemeMeta / isFollowing / getColor / onChange）；模块内各生成函数签名精确化 |
| `stylus-night.js` → `.ts` | 函数签名 + `HTMLStyleElement` 收窄 |
| `index.js` → `.ts` | 出口同时再导出类型（`ThemeManagerApi` / `ThemeDefinition` / `ThemeId`） |

本轮两处结构性小改（行为等价）：

1. `buildThemeBlock` / `buildDefaultBlock` 里重复的「shared 分组 → CSS 变量前缀」数组提取为模块级常量
   `SHARED_PREFIX_MAP`（类型 `Array<[string, keyof typeof night.shared]>`），消除动态索引的类型问题；
2. `eventBus.on(CONFIG_CHANGED, ...)` 的回调解构参数补类型，并在 `typeof value === 'string'` 之后才 `setTheme`
   （`key === 'theme'` 时 value 必为字符串）。

**主题红线未受影响**：`scripts/check-theme-colors.py` 对 `shared/theme/` 是**按目录**整体豁免（token 值唯一来源），
迁移为 `.ts` 后豁免仍然生效；`theme.test.js` 的「三主题全量覆盖」断言与 `theme-manager.test.js` 全部通过。

## 12. 阶段 2 续：工具与基础设施模块（6 个）

| 原文件 | 行数 | 产出类型 |
|---|---|---|
| `src/shared/selector-registry.js` → `.ts` | 52 | `SelectorEntry`（名称 → 选择器/分类/说明）；`registerSelector` / `getSelector` / `hasSelector` 签名精确化 |
| `src/shared/style-utils.js` → `.ts` | 107 | `ifTrue` / `cx`（`Array<string \| false \| null \| undefined>`）/ `scrollbarStyle` / `popoverBaseStyle` / `buttonStyle` |
| `src/utils/http.js` → `.ts` | 108 | `HttpRequestOptions` / `HttpResponse` / `HttpError`（对齐 axios 形状：`response.status` / `code`） |
| `src/utils/dialog-a11y.js` → `.ts` | 111 | `DialogA11yOptions`；`getFocusable` 收窄为 `HTMLElement[]`、`previouslyFocused` 收窄为 `HTMLElement` |
| `src/utils/scrollbar-hover.js` → `.ts` | 178 | `ScrollbarTarget`（Element 或页面滚动条的 unique symbol）、`ScrollbarHoverState` |
| `src/utils/shadow-dom-helper.js` → `.ts` | 215 | 类字段 `observers` 显式声明；`_traverse` / `querySelector` / `querySelectorAll` / `queryDescendant` / `observeInsertion` 签名精确化 |

两处结构性调整（行为等价）：

1. `ShadowDOMHelper` 的 `constructor () { this.observers = new WeakSet() }` 改为类字段
   `private observers = new WeakSet<MutationObserver>()`（构造期初始化语义相同，且不再需要显式 constructor）；
2. `_traverse` / `observeInsertion` 中 `Document | DocumentFragment | Element` 的联合类型，统一按
   `const nodeEl = node as Element` 读取 `shadowRoot` / `children`（运行时取值路径一致）。

**已固化的通用修法**：`number | null` 的定时器句柄传给 `clearTimeout` / `clearInterval` 时写 `?? undefined`
（DOM 类型只接受 `number | undefined`），这样既通过类型检查，又保留「总是调用」的原行为。

## 13. 阶段 3 起步：基础服务（2/6）

| 原文件 | 行数 | 产出类型 |
|---|---|---|
| `src/services/logger.service.js` → `.ts` | 95 | `LogLevel`（`'info'` / `'error'` / `'warn'` / `'debug'`）、`LogLevelConfig`；`ENABLED_LEVELS` 标注为 `Record<LogLevel, boolean \| undefined>`；`module` / `notify` 字段显式声明 |
| `src/services/storage.service.js` → `.ts` | 138 | `IndexedDbLike`（对尚未迁移的 `index-db.service` 的**显式契约**）；私有字段 `#instance` / `#dbs` / `#logger` 补类型 |

两处值得记录的处置：

1. **`log()` 的「末尾 notify 开关」形态**：原实现靠 `last.notify` 取值，类型上需要一次
   `last as { notify?: unknown }` 收窄（`typeof ... === 'boolean'` 的精确判断保留），运行时行为不变。
2. **`#dbs` 不再依赖 `.js` 推断**：`index-db.service` 仍是 `.js`，TS 的推断类型与真实契约不一致
   （`batchGet` 被推断为 `object`、`_executeCursorQuery` 的参数推断偏窄）。改为在本文件声明 `IndexedDbLike`
   接口 + 一次 `as unknown as IndexedDbLike` 断言，`storage.service` 的类型因此是**稳定的**；
   等 `index-db.service` 迁移为 `.ts` 后，把该接口换成它的真实类型即可。

## 14. 阶段 3 完成 + 阶段 4 推进

### 14.1 阶段 3（services）全部完成

| 原文件 | 行数 | 产出类型 |
|---|---|---|
| `index-db.service.js` → `.ts` | 190 | `IndexedDbConfig` / `IndexDbStoreConfig` / `IndexDbStoreIndex` / `IndexedDbCursorItem`；`IndexedDBService` 类字段与 `_execute<T>` 泛型化；**类改为导出**，`storage.service` 直接用它（删掉了上一批临时加的 `IndexedDbLike` 契约） |
| `config.service.js` → `.ts` | 278 | `SettingsItemLike`（对未迁移的 settings-config 的最小契约）；`DEFAULT_VALUES` / `#cache` / `#syncChannel` 补类型；`getValue` / `setValue` / `setValues` 等签名精确化 |
| `update.service.js` → `.ts` | 490 | 12 处 `error.message` 收窄为 `error instanceof Error ? error.message : String(error)`；复用 `UpdateItem`；`#showUpdatePopover` 的 handle 用 `Awaited<ReturnType<typeof mountUpdateNoticePanel>>` |
| `ai.service.js` → `.ts` | 511 | `AIProviderConfig` / `AIModelOption`；复用 `HttpError` 做 axios 形状收窄；`getModel` / `getApiKey` / `getProvider` / `getCustomBaseURL` 显式 await 后断言（保持原有 Promise 短路行为） |

顺带修了一处 JSDoc 遗漏：`src/ui/update/index.js` 的 `options.isLatest` 之前没写进 JSDoc（实现里已使用）。

### 14.2 阶段 4 已迁移（9 个）

`core/event-bus`（新增 `EventContext` / `EventHandler` / `EventOnOptions` / `EventInterceptor`，handler 形参统一为 rest）、
`ui/composables`、`ui/settings/index`、`ui/home/index`、`ui/update/index`、`components/settings-renderer`、
`modules/video/skip-manager/pure`、`modules/video/skip-manager/skip-manager-service`、`modules/video/subtitle`。

两处「契约收敛」值得记录：

1. **`pure.ts` 成为片段类型的事实源**：`SkipSegment` / `SkipCacheEntry` 定义迁入 `pure.ts`，
   `skip-manager/types.d.ts` 改为 `export type { … } from './pure'` 再导出（SFC 的 import 路径不变）——
   阶段 1 埋下的重复契约至此消除。
2. **`skip-manager/types.d.ts` 精确化**：`biliApis` 从 `unknown` 收为 `{ getVideoInformation; getVideoSubtitles }`；
   `log` 补可选 `warn`（`ad-skip` 装配的 env.log 实际没有 `warn`，调用点用 `?.` 可选链 —— 这是既有行为，迁移只是把它写实）。

`event-bus` 的 `EventHandler` 改为 rest 形参后，`manager.ts` 的 `config:changed` 订阅回调同步改写（解构首个负载）。
`eslint.config.js` 的 `@typescript-eslint/no-unused-vars` 增加 `argsIgnorePattern: '^_'`（`_` 前缀 = 刻意保留但不用）。

### 14.3 阶段 4 剩余（约 16 个文件）

`main`(154)、`core/module-system`(183)、`config/settings-config`(454)、`components/settings-component-v2`(783)、
`components/custom-select`(472)、`components/popover-dialog`(348)、`components/notification`(176)、
`components/tooltip-component`(154)、`modules/video/video.module`(421)、`modules/video/ad-skip`(364)、
`modules/video/comment`(322)、`modules/video/player-mode`(293)、`modules/video/progress-memory`(268)、
`modules/video/ui-buttons`(176)、`modules/video/progress-segments`(154)、`modules/video/webfull`(101)，
以及 `modules/home/*` 与 `modules/dynamic/*`。

### 14.4 阶段 4 继续（本批 14 个文件）

**零改动迁移**：4 个懒加载桥模块（`ui/settings/lazy-panel`、`ui/update/lazy-panel`、`ui/home/lazy-panel`、
`skip-manager/lazy-panels`）—— 纯再导出，仅扩展名变更；同时去掉 `ui/*/index.ts` 里 `import('./lazy-panel.js')`
的显式扩展名（vite 不会把 `.js` 回退到 `.ts`）。

**小模块**：`home/paid-mark`、`home/history-records`、`video/quality`、`video/up-space-popup`、`video/video-rotate`、
`dynamic/comment-enhance`、`components/notification`、`components/tooltip-component`、`video/webfull`、`home/home.module`。

三处技术细节值得记录：

1. **特性模块的 `this` 上下文**：`quality` / `up-space-popup` / `video-rotate` / `comment-enhance` / `webfull` /
   `home.module` 都是「被模块实例混入的特性对象」，用显式 `this: XxxContext` 形参声明它们依赖的字段
   （`userConfigs`、`_cleanup`、`_xxxHandler` 等）—— 既拿到类型，又不改变运行时形态。
2. **TS 6 的 `addEventListener` 重载陷阱**：`document.addEventListener('wheel', fn, { passive: true })` 会因
   `'wheel'` 专用重载的 options 是 `EventListenerOptions`（不含 `passive`）而报错；把 options 提取为
   `AddEventListenerOptions` 变量即可（见 `webfull.ts`）。
3. **`paid-mark` 的既有缺陷**：它调用的 `biliApis.checkVideoPaid` 在 `bili-apis` 里**并不存在**，
   该调用一直抛错并被 catch 吞掉 —— 即首页付费标记实际未生效。迁移按「不改行为」原则用一次断言保留原样，
   并在注释中标明；是否补实现待产品决定。

另外 `StorageService.getAll` 的 `indexName` / `queryRange` / `pageSize` 补了默认值（`null`）：
`home.module` 只传 `dbName` 调用它（原实现靠 `undefined` 走 falsy 分支，行为等价）。

### 14.5 阶段 4 剩余（15 个）

`config/settings-config`(454)、`components/settings-component-v2`(783)、`components/custom-select`(472)、
`components/popover-dialog`(348)、`core/module-system`(183)、`main`(154)、`modules/video/video.module`(421)、
`modules/video/ad-skip`(364)、`modules/video/comment`(322)、`modules/video/player-mode`(293)、
`modules/video/progress-memory`(268)、`modules/video/ui-buttons`(176)、`modules/video/progress-segments`(154)、
`modules/home/history`(183)、`modules/dynamic/dynamic.module`(108)。

### 14.6 阶段 4 继续（settings-config / module-system / video.module）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `src/config/settings-config.js` → `.ts` | 454 | **schema 类型事实源**：`SettingItemType` / `SettingOption` / `SettingItemSchema` / `SettingGroup` 移入本文件并导出；三个数组显式标注。**删除阶段 1 的临时契约 `src/config/settings-schema.d.ts`**，`SettingItemV3.vue` / `SettingsPanelV3.vue` / `config.service.ts` 改为从本文件导入类型；6 处 `visible: configs => configs.xxx` 补 `Boolean(...)` |
| `src/core/module-system.js` → `.ts` | 183 | `ModuleDefinition` / `ModuleInstance` / `ModuleStatus` / `ModuleMeta`；`#createModuleInstance` 的 `Object.create` 断言为 `ModuleInstance`；`#enhanceError` 的「任意错误挂属性」按原样断言 |
| `src/modules/video/video.module.js` → `.ts` | 421 | `VideoModuleContext`（约 60 个成员）—— 完整描述「本对象字段 + 展开的各 feature 提供的方法」，各 feature 的 `this: XxxContext` 因此被满足 |

三处值得记录的细节：

1. **`video.module` 的模块实例契约**：该对象由 `...playerModeFeatures` 等 **12 个 feature** 展开而成，`this` 类型只能显式写全
   （`VideoModuleContext` 列出约 40 个状态字段与 35 个方法）。这是迁移期必须付的成本，换来的是任一 feature 改签名时立刻在此处报错。
2. **`#tryFallback` 的既有缺陷**：原实现把「模块元数据」当模块定义传给 `register`（`register` 读 `module.name`，而元数据里是 `definition.name`），
   因此 fallback 注册必然抛错并被事件总线吞掉。迁移按原样断言保留，并加注释标明。
3. **eslint 的 `no-unused-expressions`**：`typescript-eslint` 的 recommended 会打开它，而项目里大量 `cond && call()` 短路调用
   （`.js` 时代即如此，`js.configs.recommended` 不含该规则）—— 已在 `.ts` 块显式关闭以保持一致。

### 14.7 阶段 4 剩余（12 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ad-skip`(364)、`modules/video/comment`(322)、`modules/video/player-mode`(293)、
`modules/video/progress-memory`(268)、`modules/video/ui-buttons`(176)、`modules/video/progress-segments`(154)、
`main`(154)、`modules/home/history`(183)、`modules/dynamic/dynamic.module`(108)。

### 14.8 阶段 4 继续（progress-segments / dynamic.module；ui-buttons 回退）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/video/progress-segments.js` → `.ts` | 154 | `SkipSegment` 复用自 `pure`；`MutationObserver` / 定时器句柄 / 缓存形态（`{ segments }` 或片段数组本身）收窄；`AddEventListenerOptions` 变量化（同 `webfull` 的 `'durationchange'` 重载陷阱） |
| `modules/dynamic/dynamic.module.js` → `.ts` | 108 | `DynamicModuleContext`（含由 `commentEnhanceFeatures` 提供的 `handleLoadComments`） |

**`modules/video/ui-buttons.js` 已回退为 `.js`**（本轮唯一未完成项，原因记录如下）：

迁移到 `.ts` 后 `vue-tsc` 报 `ui-buttons.ts(41,15): TS2349 This expression is not callable / Type 'Promise<void>' has no call signatures`。
出错位置是**紧跟在 `await locateToPlayer()` 之后的那一行 `await sleep(50)`** —— `sleep`（导入自 `@/utils/common`，签名确为 `(ms: number) => Promise<void>`）被解析成了 `Promise<void>`。
已尝试：把 `locateToPlayer` 经 `as unknown as {...}` 中转断言、去掉该处的前导分号、把 `;(el).click()` 改写为显式变量 —— 均不影响该报错；
同一函数内**前面的** `await sleep(100)` 不报错，只有 `await locateToPlayer()` 之后的那一个 `await sleep(50)` 报。
初步判断与「对象字面量特性方法 + `this: XxxContext` 形参 + 前序 `await`」的组合有关（疑似 TS 6.0.3 的解析/推断问题，尚未定位到最小复现）。

**处理**：为不遗留红，该文件回退为 `.js`，其余迁移保留。`video.module.ts` 的 `VideoModuleContext` 已经声明了它的成员，
所以回退不影响其它文件的类型检查。**后续**：做出最小复现（或升级 TS）后再迁移这一个文件。

### 14.9 阶段 4 剩余（11 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ad-skip`(364)、`modules/video/comment`(322)、`modules/video/player-mode`(293)、
`modules/video/progress-memory`(268)、`modules/video/ui-buttons`(176，见 §14.8)、
`main`(154)、`modules/home/history`(183)。

### 14.10 阶段 4 继续（progress-memory）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/video/progress-memory.js` → `.ts` | 268 | `PlaybackRecord` / `PlaybackStore` / `ProgressMemoryContext`（20+ 状态字段与 10 个事件处理器）；`_writePlaybackPosition` / `_getPlaybackStore` 收窄；`test/playback-memory.test.js` 的导入去掉扩展名 |

**本轮最有价值的经验（后续文件可直接复用）**：`document.addEventListener('click', handler, true)` 这类调用会报
`TS2769 No overload matches this call`，根因是 **`lib.dom` 的「具体事件名」重载把 `ev` 声明成该事件的精确类型（`MouseEvent` / `KeyboardEvent`…），
而 `EventListener` 的形参是更宽的 `Event` —— 函数参数的逆变规则使宽形参无法赋给窄形参**。两种解法：

1. 把 handler 参数标注成对应的事件类型（`(event: MouseEvent) => void`）；
2. 或让 TS 走「通用字符串重载」：`document.addEventListener('click' as string, handler, true)`（本项目采用此法，运行时是同一个字符串）。

另外这类 handler 在 `Context` 里是可选字段（要到 `initXxx` 才赋值），调用处需 `!` 非空断言，否则连通用重载也会因 `EventListener | null` 报错。

### 14.11 阶段 4 剩余（9 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ad-skip`(364)、`modules/video/comment`(322)、`modules/video/player-mode`(293)、
`modules/video/ui-buttons`(176，见 §14.8 的回退原因)、`main`(154)、`modules/home/history`(183)。

### 14.12 阶段 4 继续（player-mode）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/video/player-mode.js` → `.ts` | 293 | `PlayerModeContext`；策略数组 `selectPlayerModeStrategies`、`isPlayerModeSwitchSuccess` 的 `Promise<boolean>`、`locateToPlayer` 内三个闭包（`getMaxScroll` / `computeTarget` / `isPositioned`）签名精确化；`getElementComputedStyle` 的返回按 `{ position?, height? }` 收窄；3 处 `error.message` 收窄 |

两处通用修法（后续文件会反复用到）：

1. `getElementOffsetToDocument(el)` 的形参是 `HTMLElement`，而 `elementSelectors.get()` 返回 `Element | null` —— 调用处需要 `as HTMLElement`；
2. `getElementComputedStyle(el, ['position', 'height'])` 返回 `unknown`（它可能是字符串 / 对象 / 映射三种形态），取具体字段时要按
   `{ position?: string; height?: string }` 收窄，并把 `parseInt(x.height)` 写成 `parseInt(x.height ?? '', 10)`
   （`parseInt(undefined)` 与 `parseInt('')` 同为 `NaN`，行为一致）。

### 14.13 阶段 4 剩余（8 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ad-skip`(364)、`modules/video/comment`(322)、`modules/video/ui-buttons`(176，见 §14.8)、
`main`(154)、`modules/home/history`(183)。

### 14.14 阶段 4 继续（comment）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/video/comment.js` → `.ts` | 322 | `CommentContext`（含 `_description*` 一串状态字段）、`VideoInfoLike`（简介插入所需的视频信息子集：`desc` / `title` / `desc_v2`）；`normalize` / `pageRenderedForCurrentVideo` / `isDescriptionTruncated` / `insertToCommentArea` / `startSurvivalWatch` / `verifyAndRepairInsert` / `insertIntoFeed` 共 7 个闭包签名精确化；`queryDescendant(..., true)` 断言为 `Element[]`；`renderder.data?.reply_control?.location` 按自定义元素扩展收窄 |

两条踩坑记录（后续文件同样适用）：

1. `a?.childElementCount > 1` 这种写法在 strict 下会因 `undefined > 1` 报错，需写成 `(a?.childElementCount ?? 0) > 1`
   —— 对 `null` / `undefined` 都是 `false`，与原语义一致；
2. `elementSelectors.CSS('xxx')` 返回 `string | null`，凡直接喂给 `querySelector` / `querySelectorAll` / `closest` 的地方都要 `as string`（本轮 3 处）。

### 14.15 阶段 4 剩余（7 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ad-skip`(364)、`modules/video/ui-buttons`(176，见 §14.8)、`main`(154)、`modules/home/history`(183)。

### 14.16 阶段 4 继续（ad-skip）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/video/ad-skip.js` → `.ts` | 364 | `AdSkipContext`、`RecognizeResult`；直接复用 `skip-manager/types` 的 `SkipSegment` / `SkipCacheEntry` / `SkipManagerEnv` / `SkipEpisode`；`showSkipSegmentManager` 装配的 `env` 显式标注为 `SkipManagerEnv`；`getVideoInformation` / `adCacheGet` / `getSubtitleContent` 等返回值按各自子集收窄；懒加载桥仍是动态导入（`import('./skip-manager/lazy-panels')`） |

一个有意思的发现：**`video.module.ts` 的 `VideoModuleContext` 这次无需改动就通过了**。原因是 feature 的 `this: AdSkipContext` 只在**调用点**校验 this，
而 `...adSkipFeatures` 的展开与 `this.xxx()` 的调用都发生在同一个对象字面量内、TS 以该字面量类型为准 ——
所以 feature 自身多出来的成员（`resolveSkipTargetId` / `recognizeSkipSegments` / `setCacheLocked` 等）不会反向要求 `VideoModuleContext` 声明。
这对后续文件是好消息：跨文件耦合比预想的低。

### 14.17 阶段 4 剩余（6 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ui-buttons`(176，见 §14.8)、`main`(154)、`modules/home/history`(183)。

### 14.18 阶段 4 继续（home/history、main）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `modules/home/history.js` → `.ts` | 183 | `HomeHistoryContext`、`HistoryVideoInfo`；`addEventListenerToElement(..., 'toggle', ...)` 的 `ToggleEvent` 收窄；弹窗元素上的 `__popoverDismissCleanup` 自定义属性用交叉类型断言；`mountHomeHistoryPanel` 的 `searchInput` 收窄为 `HTMLElement \| null` |
| `src/main.js` → `.ts` | 154 | `moduleMap` 显式 `Record<string, () => Promise<{ default: ModuleDefinition }>>`；`currentModuleType` / `moduleCache` 类型化；`ConfigService.getValue` 取出的 `theme` 与 4 个日志级别断言到具体类型 |

**⚠️ 关键一步（改名后必须同步）**：`vite.config.js` 的 `entry: 'src/main.js'` 已改为 `'src/main.ts'`，否则构建直接失败（已同步并验证构建通过）。
另外 `main.ts` 里三处动态导入的 `*.module.js` 显式扩展名已去掉（`.js` 不会回退到 `.ts`，与 §8.1 同因）。

**顺带修正**：`storageService.getAllRaw` 补了参数默认值（`home/history` 只传 `dbName` 调用它）；`SkipCacheEntry.locked` 放宽为 `boolean | number`（服务端与本地面板分别用 `1/0` 与布尔表达）。

### 14.19 阶段 4 剩余（4 个）

`components/settings-component-v2`(783)、`components/custom-select`(472)、`components/popover-dialog`(348)、
`modules/video/ui-buttons`(176，见 §14.8)。其中 `popover-dialog` 已完成通读，迁移方案已明确（`openAdjustmentDialog` 的 options/instance 两个接口 + `__popoverDismissCleanup` 交叉类型 + `toggle` 事件的 `ToggleEvent`）。

### 14.20 阶段 4 继续（popover-dialog、custom-select）

| 原文件 | 行数 | 产出 |
|---|---|---|
| `components/popover-dialog.js` → `.ts` | 348 | `AdjustmentDialogAction` / `AdjustmentDialogContent` / `AdjustmentDialogOptions` / `AdjustmentDialogInstance` / `DialogEntry`；`openAdjustmentDialog` 返回类型明确；弹窗元素用 `DialogRoot`（`HTMLElement & { __popoverDismissCleanup? }`）交叉类型；`toggle` 事件按 `ToggleEvent` 收窄 |
| `components/custom-select.js` → `.ts` | 472 | `SelectHost`（容器扩展属性 `__adjSelectCleanup` / `__adjSelectIndex` / `__adjSelectObserver`）；7 个内部函数 + 3 个导出签名精确化；`select` 断言为 `HTMLSelectElement`、`trigger` 为 `HTMLButtonElement`；4 组监听走「通用重载」（`'pointerdown' as string` 等） |

本轮新增的两条通用修法：

1. `switch` 的 `case` 里声明 `const` 会触发 eslint `no-case-declarations` —— 用块作用域 `case 'x': { ... }` 包起来；
2. `querySelectorAll(...).forEach(refreshHost)` 这种「窄参数回调」不兼容 `forEach` 的 `(value: Element, ...)` 签名，需写成
   `.forEach(node => refreshHost(node as SelectHost))`。

### 14.21 阶段 4 剩余（2 个）

`components/settings-component-v2`(783)、`modules/video/ui-buttons`(176，见 §14.8)。

### 14.22 阶段 4 最后两个文件：迁移方案（下一轮直接执行）

#### A. `components/settings-component-v2`（783 行 / 25 个方法）

**公共类型（放在类前）**：

```ts
/** Vue 设置面板桥的返回形状（与 ui/settings/index.ts 的 VueSettingsPanelHandle 对应） */
interface VueSettingsPanelHandleLike {
    bridge: {
        configs: Record<string, unknown>
        dynamicOptions: Record<string, unknown>
    }
    unmount: () => void
}
/** 设置弹窗根元素（带轻量关闭清理句柄） */
type SettingsPopover = HTMLElement & { __popoverDismissCleanup?: (() => void) | null }
/** 动态选项（模型列表） */
type DynamicOptions = Record<string, Array<{ value: unknown; label: unknown }>>
```

**类字段（`constructor` 里初始化的即契约）**：`userConfigs: Record<string, unknown>`、`renderer: SettingsRenderer | null`、
`pageType: string | null`、`tooltip: unknown`、`_vuePanel: VueSettingsPanelHandleLike | null`、`_vueBridge`、
`_vueConfigsProxy: Record<string, unknown> | null`、`_vueDynamicOptionsProxy: DynamicOptions | null`、
`_activeSchema: SettingItemSchema[] | null`、`_pendingModelOptions?: DynamicOptions`、`_configSyncUnsubscribe?: (() => void) | null`。

**方法签名**：

- `unmountVuePanel(): void`、`syncVueDynamicOptions(options: DynamicOptions): void`
- `mountVuePanel(popover: SettingsPopover | null, mountId: string, schema: SettingItemSchema[]): Promise<VueSettingsPanelHandleLike | null>`
- `showPanelLoadFailure(error: unknown): void`
- `handleVueConfigChange(key: string, value: unknown, popover: SettingsPopover | null): Promise<void>`
- `init(userConfigs: Record<string, unknown>): Promise<void>`、`openSettings(): Promise<void>`
- `render(pageType: string | null): Promise<void>`、`renderVideoSettings(): Promise<void>`、`renderDynamicSettings(): Promise<void>`
- `fetchDynamicOptions(): Promise<DynamicOptions>`
- `initVideoSettingsEventListeners(): Promise<void>`、`initDynamicSettingsEventListeners(): Promise<void>`
- `bindVersionUpdateCheck(popover: SettingsPopover): void`、`bindImportExportEvents(popover: SettingsPopover): void`
- `handleValidateClick(targetId: string, popover: SettingsPopover | null, buttonEl?: HTMLElement | null): Promise<void>`
- `handleRefreshClick(...)`（同上）
- `setButtonFeedback(button: HTMLElement, success: boolean, successText?: string, failureText?: string): void`
- `handleSpecialCheckboxChange(configId: string, value: unknown, popover: SettingsPopover | null): Promise<void>`
- `handleSpecialInputChange(...)`、`handleSpecialSelectChange(configId: string, value: unknown, oldValue: unknown, popover: SettingsPopover | null)`
- `switchAIProvider(newProvider: string, oldProvider: string, popover: SettingsPopover | null): Promise<void>`
- `refreshModelList(popover: SettingsPopover, preferredModel?: string): Promise<void>`
- `findConfigItem(id: string): SettingItemSchema | null`
- `saveConfig(key: string, value: unknown): Promise<void>`
- `exportUserConfigs(): Promise<void>`、`importUserConfigs(event: Event): Promise<void>`

**必然命中的修法**（均已在本轮/前几轮总结）：

1. `addEventListenerToElement(popover, 'toggle', ...)` → `(e: Event)` + `(e as ToggleEvent).newState`；
2. `popover.__popoverDismissCleanup` → `SettingsPopover` 交叉类型（`existingSettings` 也一样）；
3. `eventBus.on(CONFIG_CHANGED, (_, { key, value }) => ...)` → 改 rest 形参（`(_ctx, ...args)`）再从 `args[0]` 解构
   —— `event-bus` 的 `EventHandler` 是 rest 签名；
4. `elementSelectors.CSS(...)` / `querySelector` / `querySelectorAll` 的结果按 `string` / `HTMLElement` / `HTMLElement[]` 收窄；
5. `import pkg from '../../package.json'` 保持默认导入（tsconfig 已开 `resolveJsonModule`）。

#### B. `modules/video/ui-buttons`（176 行）—— 已定位但未解决

`await locateToPlayer()` 之后紧跟的任意 `await sleep(50)` / `await xxx()` 会被报
`TS2349 This expression is not callable. Type 'Promise<void>' has no call signatures.`；
已排除的因素：`this: UiButtonsContext` 形参、`this.x()` 取值、显式类型化局部引用、前导分号、断言中转、变量改名。
把调用包成箭头函数后该报错**会移动到下一个 `await` 表达式**（说明是解析层行为，与具体标识符无关）。
**建议下一轮做法**：把该方法的 `await` 链改成不使用连续 `await`（例如 `await sleep(50)` → `sleep(50).then(...)`，
或把整段改为 `queueMicrotask` + 显式 Promise 链），绕开解析歧义；若仍失败则维持 `.js` 并在本文件顶部注明原因。

### 14.23 阶段 4 收官：settings-component-v2（783 行 / 25 方法）

按 §14.22-A 的方案一次完成（typecheck 从 4 个错误 → 0）：

| 产出 | 说明 |
|---|---|
| 类型 | `VueSettingsPanelHandleLike` / `SettingsPopover`（`HTMLElement & { __popoverDismissCleanup? }`）/ `DynamicOptions` / `FeedbackButton`（`_feedbackOriginalText` / `_feedbackResetTimer`） |
| 类字段 | 12 个（`_vuePanel` / `_vueBridge` / `_vueConfigsProxy` / `_vueDynamicOptionsProxy` / `_activeSchema` / `_pendingModelOptions` / `_configSyncUnsubscribe` 等） |
| 方法 | 25 个签名全部精确化（含 `handleSpecialSelectChange` 的 `oldValue`、`handleValidateClick` / `handleRefreshClick` 的可选 `buttonEl`） |

迁移中修掉的 4 处类型问题：`bridge.dynamicOptions` 断言到 `DynamicOptions`；`Object.assign(this._pendingModelOptions!, …)` 保持同一引用；
`fetchModels` / `validateApiKey` 的配置值断言为 `string` / `string | undefined`。

**顺带清理**：`initTooltip({ delay: 300, hideDelay: 100, container })` 里的 `hideDelay` 从未被 `TooltipComponent` 消费
（其 `TooltipOptions` 只有 `delay` / `container`），已去掉该字段（行为不变）。

### 14.24 阶段 4 剩余（1 个）

`modules/video/ui-buttons`(176) —— 唯一未迁移文件，原因是 §14.22-B 记录的编译器解析异常
（`await locateToPlayer()` 相邻的 `await` 表达式被判定为「`Promise<void>` 不可调用」，把调用包成箭头函数后报错仅向下移动一行）。

### 14.25 阶段 4 完成：ui-buttons（176 行）

§14.22-B 的解析异常已解决 —— **不再使用连续 `await`**，改用 Promise 链表达时序：

```ts
async locateButtonClick (this: UiButtonsContext): Promise<void> {
    // ...
    const wait = (ms: number): Promise<void> => sleep(ms)
    const locate = (): Promise<void> => this.locateToPlayer()
    if (!miniOpenBtn || miniCloseBtn || getComputedStyle(miniOpenBtn).display === 'none') {
        return wait(100).then(locate)
    }
    miniOpenBtn.click()
    return wait(50).then(locate).then(() => wait(50))
        .then(() => { /* 关闭小窗按钮 */ })
}
```

结论：该 `TS2349` 由「`this: XxxContext` 形参的方法体内连续 `await`」触发（写成箭头函数只让报错下移一行），
**Promise 链写法可完全规避**；时序与副作用顺序与原来逐字等价。

其余改动同 §14.22-A 模式：`UiButtonsContext` 接口（7 个成员）、`lastElementChild as Node`（4 处）、
`videoInfo` / `detail` 断言收窄、`getElementOffsetToDocument(... as HTMLElement)`。

### 14.26 阶段 5 完成：checkJs 全量开启

`tsconfig.json`：`checkJs: true` + `include` 增补 `src/**/*.js`（`allowJs` 保持 `true`）。

**为什么不能设 `allowJs: false`**：`src/shared/styles/*`、`src/shared/templates/*` 是纯字符串/模板常量模块，
按既定约定**永久保持 `.js`**，且被 `.ts` 静态导入 —— 关掉 `allowJs` 会让这些导入直接报错。

开启 `checkJs` 后全仓仅暴露 **6 个错误，全部在模板模块**，已用 JSDoc 修完（未使用 `@ts-nocheck`）：

| 文件 | 修法 |
|---|---|
| `templates/buttons.js` | `renderButton` 加 JSDoc（`@param {string} key` / `@param {Record<string, unknown>} [vars]`），`buttonTemplates[key]` 用 `/** @type {Record<string, string>} */` 索引视图 |
| `templates/subtitle/subtitle-switch.js` | 同上（`renderSubtitleButton`） |
| `templates/index.js` | `getTemplates` 的 Proxy `get`：`recordTemplateUsage(String(prop))` + `Reflect.get(target, prop)`（symbol 探测不再参与索引） |

### 14.27 迁移完成态（阶段 0–5）

| 项 | 结果 |
|---|---|
| 源码语言 | **71 个 `.ts`（含 8 个 SFC + 1 个 `.d.ts`）/ 0 个业务 `.js`** |
| 保留的 `.js` | 仅 `src/shared/styles/*`、`src/shared/templates/*`（纯字符串常量，已纳入 `checkJs`） |
| 门禁 | `typecheck` 0 错误、`test` 全绿、`eslint` 0 问题、`check:colors` 通过、`build`/`stats` 体积在预算内 |
| 体积 | 迁移前 gzip 146.39 KB → 151.41 KB（+3.71 KB，2.58%）；门禁阈值 +4 KB / +5% |
| 产物等价性 | `.ts` 入口与 `.js` 入口产物逐字节相同（实测）；所有产物级红线（禁 `mangle.properties`、SystemJS 命名导出桥、Vue 懒加载、体积门禁）未受影响 |
