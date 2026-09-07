# 主题系统设计方案（Theme System Design）

> 状态：**已实施（2026-09-07，随 v3.29.0 发布）** · 决策：dec-e5c14463de0f123e（config 持久化 + 切换 API；先文档后实施）
> 实现偏差记录：
> - `generateThemeVariables` 实现于 `src/shared/theme/manager.js`（原计划放 style-utils.js；因主题模块自包含、避免循环依赖而调整），style-utils 中原 `generateCssVariables` 已随死代码（generateAllStyles）一并删除；
> - 旧 `src/shared/theme.js` 兼容层已删除，token 唯一来源为 `src/shared/theme/tokens.js`；`@/shared/theme` 现解析到 `theme/index.js`；
> - 迁移中按需新增 token：`switch-track/switch-track-hover`（开关轨道）、`bg-hover-strong`（滚动条滑块 hover 等实色强 hover）、`pink`（B 站官方点缀粉 #fb7299）、`shadow-float`；
> - 死代码 `popover.js`（popoverStyles）与 style-utils 遗留函数保留但已变量化，无字面色值，待后续清理；
> - 静态断言落地为 `scripts/check-theme-colors.py` + `npm run check:colors`（替代原计划的 eslint 规则方案，实现成本更低且同样可 gate）。
> 目标版本：3.29.0（已发布）

## 1. 目标与验收

1. **全量变量化**：仓库内所有样式相关代码（`styles/*.js`、组件内嵌 CSS 常量、模板内联 `style=`、SVG `fill=`、JS 直写色值）不再出现字面色值，全部引用主题 token（CSS 变量）。
2. **单点切换**：只改一处（根节点 `data-adj-theme` 属性 / `ThemeManager.setTheme()`），所有元素即时切换主题，无需重建样式、无页面刷新。
3. **三主题预留**：
   - `light`（浅色）：对齐 B 站官方浅色；
   - `dark`（深色）：对齐 B 站官方深色；
   - `night`（夜间哔哩）：现有样式的语义化整理，视觉与现状一致（默认主题，零回归）。
4. **官方对齐能力**：预留官方 CSS 导入位（`official` token 覆盖层）与「跟随官方深浅模式」接口，官方 CSS 文件到位后只需填色值，不改组件样式。
5. **持久化**：新增 config 配置项 `theme`（默认 `night`），经 ConfigService 读写、跨标签页同步沿用现有机制。

## 2. 现状摸底（证据摘要）

| 事实 | 位置 |
|---|---|
| 单一固定深色常量，无主题概念 | `src/shared/theme.js`（`theme.colors/...`） |
| 已有 CSS 变量生成雏形，但只覆盖 colors/spacing/radius，且几乎无人引用 | `src/shared/style-utils.js#generateCssVariables` |
| 全部样式为 JS 模板字符串，色值硬编码；`var(--...)` 全仓仅 5 处 | `src/shared/styles/*.js` 等 |
| 样式注入统一走 `document.head` 的 `<style id>` | `src/utils/common.js#insertStyleToDocument`，main.js / 各 module 调用 |
| 弹窗为原生 popover + 真实 DOM 遮罩 | `styles/index.js#generateBilibiliAdjustmentStyle` |
| 滚动条伪元素不支持 transition/自定义属性动画，宽度由 JS 逐帧驱动 | `src/utils/scrollbar-hover.js`（只写宽度，颜色在 `index.js` 静态） |
| 评论区注入用 shadow DOM | `src/utils/shadow-dom-helper.js`、`modules/video/comment.js`（CSS 变量可沿继承穿透 shadow 边界） |
| 存在跨域 iframe 弹窗场景 | `main.js` 顶部 `bili-adjustment-popup` 分支（iframe 内脚本独立运行，同样可注入变量） |

**硬编码色值全量清单**（迁移核对基准，按出现文件数排序）：

- Hex：`#fff/#ffffff`、`#f0f0f0`、`#e0e0e0`、`#eee`、`#ddd`、`#ccc`、`#aaa`、`#999`、`#888`、`#868686`、`#666`、`#555`、`#444`、`#424242`、`#3a3a3a`、`#333`、`#323232`、`#2c2c2c`、`#2a2a2a`、`#252525`、`#212121`、`#1e1e1e`、`#1a1a1a`、`#0f0f0f`、`#00a1d6`、`#00b8e6`、`#00aeec`、`#0491bf`、`#f56c6c`、`#ff4757`、`#e56b6b`、`#2ed573`、`#67c23a`、`#e6a23c`、`#f5a623`、`#f0a020`、`#ff9c46`、`#ff6d00`、`#fb7299`、`#f0f0f0` 等（完整清单见 §5.1 映射表）。
- RGBA 组合：品牌蓝 `rgba(0,161,214,×)`（0.05/0.06/0.08/0.1/0.12/0.15/0.2/0.25/0.3/0.4/0.5）、danger 红 `rgba(245,108,108,×)`（0.15/0.25/0.3）、白色浮层 `rgba(255,255,255,0.02~0.12)`、黑色遮罩 `rgba(0,0,0,0.15~0.7)`、状态色 `rgba(46,213,115,…)` / `rgba(255,71,87,…)` / `rgba(230,162,60,…)` / `rgba(103,194,58,…)`。

> 例外（**不纳入**主题系统，需在迁移时显式排除）：
> - `logger.service.js` 的 `%c` 控制台配色（开发者日志，非 UI）；
> - `element-selectors.js` / `comment.js` 中的 `#feed` 等为 **CSS 选择器**，非颜色；
> - 跟随 B 站官方控件结构克隆的模板（`subtitle-switch.js` 的 `#00aeec`、`ui-buttons.js` 的 `fill="#fff"` 为 B 站自身图标原色）——按「跟随官方」策略处理（§6.4），默认保留官方原色不变量化，避免与官方主题冲突。

## 3. 总体架构

### 3.1 核心机制：CSS 自定义属性 + 单点切换

```
html[data-adj-theme="night"] {
    --adj-primary: #00a1d6;
    --adj-primary-rgb: 0, 161, 214;
    --adj-surface-1: #212121;
    ...
}
```

- 所有样式字符串把字面色值替换为 `var(--adj-*)`，模板字符串里不再出现 `theme.colors.xxx` 插值。
- 主题变量统一注入到 `document.head` 一个固定 `<style id="adj-theme-vars">`；切换主题 = 改写该 style 内容（或切换根节点属性），全局即时生效。
- CSS 自定义属性沿 DOM 继承，可穿透 shadow DOM 边界；弹窗（top layer）与 shadow 内元素自动获得变量。
- **不依赖 CSS 变量表达不了的场景**：`::-webkit-scrollbar` 伪元素无法可靠继承变量、且无 transition——滚动条颜色迁移后需浏览器实测；若失效，由 ThemeManager 仿 `scrollbar-hover.js` 机制 JS 直写（§8 风险 R2）。

### 3.2 目录结构（新增）

```
src/shared/theme/
    index.js        # 出口：ThemeManager、THEMES、tokenTypes
    tokens.js       # 语义 token 清单（名称 + 分组 + 注释：适用场景）
    themes/
        night.js    # 夜间哔哩：现有样式整理（默认）
        light.js    # 浅色：对齐官方（占位，official css 导入后校准）
        dark.js     # 深色：对齐官方（占位，同上）
        official.js # 官方 CSS 导入位：颜色值来源标注 + 覆盖层钩子
    manager.js      # ThemeManager：注入/切换/读取/事件/followOfficial
```

### 3.3 与现有体系的关系（平滑演进，不破坏导出）

| 现有产物 | 去向 |
|---|---|
| `theme.js` 的 `theme.colors/spacing/borderRadius/fontSize/shadows/transitions` | 拆分并入 `tokens.js`（值取自现有 night 色板），`theme.js` 保留为 `night` 的 JS 兼容视图（内部由 token 生成），过渡期后删除 |
| `style-utils.js#generateCssVariables` | 升级为 `generateThemeVariables(themeId)`（由 `tokens.js` 驱动，补全 fontSize/shadows/transitions） |
| `styles/index.js#generateBilibiliAdjustmentStyle` | 迁移为 `var()` 引用（不含变量定义块） |
| `stylesV2` / `generateAllStyles` | 保留结构；`generateAllStyles` 不再需要单独注入 `cssVariables`（改为 theme vars 统一注入） |
| `insertStyleToDocument` | 不变；theme vars 由其注入 |

### 3.4 初始化时序（main.js）

1. `ConfigService.initialize()`（现有时序）→ 读取 `theme` 配置；
2. `ThemeManager.init({ theme: configTheme })` → 注入 `<style id="adj-theme-vars">` 变量块；
3. 其余样式注入不变（此时即可解析 `var()`）；
4. 监听 config 变更 / `theme:change` 事件 → `ThemeManager.setTheme()`（跨标签页同步沿用 ConfigService 现有机制）。

## 4. Token 设计规范

### 4.1 命名与分组

- 前缀统一 `--adj-`（避免与 B 站页面 CSS 变量冲突）。
- 分组：`color` 语义值一律在名称里表达语义（`surface-2`、`text-1`…），**不写物理色名**（`#212121`、`white-08` 之类一律不允许出现在组件样式中）。
- 类型：`--adj-<组>-<子组>-<层级/修饰>`，例：`--adj-color-text-1`。为控制 token 数量，常用前缀组名缩写：`bg / surface / text / border / brand / state / overlay / shadow / radius / space / font / motion / z`。

### 4.2 颜色 token（核心语义表，值 = night 主题）

原则：先把现有硬编码**归并成语义层级**，再为每个语义配值。下表即实施阶段的映射基准（列 `现用值(night)` 为全仓核对后的归一值，个别近似值归并时以肉眼一致为准做微调并在 PR 说明）。

| Token | 语义 | 现用值 (night) | 主要来源 |
|---|---|---|---|
| `--adj-brand` | 品牌主色（强调/选中/开关 on） | `#00a1d6` | 全仓 |
| `--adj-brand-hover` | 品牌主色 hover | `#00b8e6` | index.js 等 |
| `--adj-brand-rgb` | 品牌 RGB 通道（拼 rgba） | `0, 161, 214` | — |
| `--adj-brand-text` | 品牌底上的文字 | `#fff` | 按钮 primary、徽章 |
| `--adj-bg-page` | 页面/最外层底（弹窗、工具类浮层） | `#212121` | popover-dialog、index |
| `--adj-bg-surface` | 卡片/控件面 | `#2c2c2c` | index.js 等 |
| `--adj-bg-surface-hover` | 卡片 hover | `#323232` | index.js（与 `#2a2a2a` 归并） |
| `--adj-bg-inset` | 内嵌/输入/子容器底（叠在 surface 上更深） | `#212121` | input/select、children |
| `--adj-bg-overlay-element` | tooltip 等浮层元素底 | `#1a1a1a` | tooltip-component、update.service |
| `--adj-bg-scrim` | 全屏遮罩 | `rgba(0,0,0,0.55)` | index.js、popover-dialog |
| `--adj-bg-scrim-strong` | 深遮罩（确认框等） | `rgba(0,0,0,0.7)` | popover.js 等 |
| `--adj-text-1` | 主文字 | `#f0f0f0` | 全仓 |
| `--adj-text-2` | 次级文字 | `#ccc` | index.js |
| `--adj-text-3` | 弱文字/说明 | `#888` / `#999` | index.js、video-page |
| `--adj-text-4` | 更弱/占位 | `#666` | index.js |
| `--adj-text-5` | 禁用/提示图标次级 | `#555` / `#868686` 归并 | index.js、popover-dialog |
| `--adj-text-title` | 标题/强调 | `#fff` | index.js（`#eee/#ddd/#e0e0e0` 归并见 §4.3 说明） |
| `--adj-text-on-brand` | 品牌底文字 | `#fff` | 与 brand-text 一致可复用 |
| `--adj-border` | 常规边框 | `#424242` | theme.colors.border |
| `--adj-border-light` | 细分隔线/浅边 | `#333` | index.js |
| `--adj-border-hover` | 边框 hover | `#444` | index.js |
| `--adj-state-success` | 成功 | `#2ed573`（视频页局部 `#67c23a` 归并待定） | theme.js、video-page |
| `--adj-state-warning` | 警告 | `#f5a623`（`#e6a23c/#f0a020` 归并待定） | theme.js、notification |
| `--adj-state-danger` | 危险/删除 | `#ff4757`（`#f56c6c` 归并，见 §4.3） | theme.js、index |
| `--adj-state-danger-rgb` | 危险 RGB 通道 | `245, 108, 108`（按 `#f56c6c`） | index.js |
| `--adj-state-info` | 信息 | `#00a1d6`（=brand） | theme.js |

> `#eee/#ddd/#e0e0e0/#f0a020/#ff9c46/#67c23a/#e56b6b/#e6a23c` 等「近似但不同」的分散色，在迁移时按**视觉上下文归并**到上述语义，归并决策逐处记录在代码注释或 PR 说明中，避免 token 无限膨胀；如需保留差异（如 update 状态提示的 `#ff9c46`），扩展为 `--adj-state-*` 新语义而非物理色。

### 4.3 RGBA 处理策略（关键设计）

不直接存 `rgba(...)` 字面 token（浅/深主题中"浮白/浮黑"物理相反），分三类：

1. **品牌/危险色 alpha 叠加** → 通道变量拼装：
   ```css
   background: rgba(var(--adj-brand-rgb), 0.15);
   ```
2. **浮白叠加**（`rgba(255,255,255,0.02~0.12)`，深色底的 hover/高亮）→ 语义化：`--adj-hover-overlay`、`--adj-active-overlay`（night 下取浮白值，light/dark 下取浮黑或官方 hover 值）：
   ```css
   background: var(--adj-hover-overlay);
   ```
3. **黑色遮罩/阴影**（`rgba(0,0,0,0.3~0.7)`）→ `--adj-bg-scrim*` / shadow token（shadow 见 §4.4，存完整 `box-shadow` 值，勿拆通道）。

### 4.4 非颜色 token（尺寸/圆角/阴影/字号/过渡）

沿用 `theme.js` 既有分组并补齐生成覆盖：

| 分组 | 前缀 | 说明 |
|---|---|---|
| 间距 | `--adj-space-*` | 现 `spacing`（4/8/12/16/20/24/32px） |
| 圆角 | `--adj-radius-*` | 现 `borderRadius`（6/8/12/16/9999px）+ 迁移中新增语义（10px 卡片、4px 小标等归并入既有档位） |
| 阴影 | `--adj-shadow-*` | 现 `shadows`；迁移时把散落的 `box-shadow` 中仅颜色随主题的拆为 `0 8px 24px var(--adj-shadow-color)` |
| 字号 | `--adj-font-*` | 现 `fontSize` |
| 过渡 | `--adj-motion-*` | 现 `transitions` |
| 层级 | `--adj-z-*` | popover/overlay/header 的 z-index 常量集中 |

> 间距/圆角/字号/过渡不随主题变化（三主题相同），但仍需 token 化以满足「所有 CSS 数值使用变量」与未来统一微调。

## 5. 三主题定义

### 5.1 `night`（夜间哔哩 = 现有样式整理，默认）

即 §4.2 映射表取值（现有 `#212121` 体系），**视觉零回归**。`light/dark` 中语义不变的（间距/圆角/字号/过渡/层级）与 night 相同。

### 5.2 `light` / `dark`（对齐 B 站官方，占位 + 校准流程）

- **占位原则**：B 站官方主要色相已知（主品牌蓝 `#00a1d6`/`#00aeec`、浅色底 `#fff`/`#f1f2f3`、正文 `#18191c`、次级 `#61666d`/`#9499a0`、暗色底 `#18191a` 系、文字 `#f1f2f3`/`#e5e9ef` 等）。占位值写入 `light.js/dark.js`，**每处值必须携带来源注释** `// TODO(official-css): 待官方 css 校准`。
- **校准流程（官方 CSS 到位后，一次性完成，不动组件样式）**：
  1. 官方 css 放入 `src/shared/theme/official/`（仅作参考来源，不直接引入线上，避免体积）；
  2. 按 §4.2 语义表人工映射官方色值 → 覆写 `light.js/dark.js` 对应值；
  3. 若官方引入 CSS 变量体系，`official.js` 提供「值来源 = 官方变量名」的映射表与解析函数；
  4. 删除占位 `TODO(official-css)` 注释。
- **light/dark 需要逐语义核对**（不只是换背景）：`hover-overlay` 由浮白改浮黑、文字层级对比度、边框由深灰改浅灰（官方 `#e3e5e7` 系）等，属**同一套语义 token 不同取值**，组件零改动。

### 5.3 主题一致性检查（实施验收）

- 三主题下用同一语义的元素必须满足基础可读性对比度（主文字 vs 各自背景 ≥ 4.5:1 目标）；
- 每主题提供「已知问题」注释位，记录归并导致的肉眼差异。

## 6. 运行时切换与配置

### 6.1 ThemeManager API

```js
// src/shared/theme/manager.js
ThemeManager.init({ theme })          // 启动注入；theme 缺省回退 night
ThemeManager.setTheme(id)             // 切换并写 <style>，触发 'adj:theme-changed' 事件（eventBus 或自定义）
ThemeManager.getTheme()               // 当前 id
ThemeManager.getColor(tokenPath)      // JS 侧需要色值处：getComputedStyle(document.documentElement).getPropertyValue(...)
ThemeManager.followOfficial({ enable }) // 预留：跟随官方深浅（§6.4）
```

### 6.2 注入形态

```js
// 生成 html[data-adj-theme="night"] { ... } 三块 + :root 默认块（=night，保证样式注入顺序无关）
// 切换 = document.documentElement.setAttribute('data-adj-theme', id) + 改写 style 文本
```

> 弹窗关闭态依赖 UA `[popover]:not(:popover-open)` 规则（AGENTS.md 已记录），本次不触碰 popover 结构，仅改颜色引用。

### 6.3 config 持久化

- `settings-config.js` 新增 `theme` 配置项：`type: 'select'`，选项 `night/light/dark`（label：夜间哔哩/浅色(官方)/深色(官方)），默认 `night`（与现有外观一致，首次启动零感知）。
- **本阶段不新增设置面板 UI**（用户决策：仅 config + API；UI 后续按需接，接入点为该 select 项，ConfigService 变更监听已具备）。
- ConfigService 现有跨标签页同步（storage 事件监听）使主题自动同步。

### 6.4 跟随官方深浅模式（预留接口，本期不实现逻辑）

- 目的：B 站官方切换深浅（或系统 `prefers-color-scheme`）时，脚本 UI 自动跟随 `light/dark`。
- 实现位：`manager.js#followOfficial()`：观察 `document.documentElement` 上官方主题标记（如 `data-theme`/class 变化）或 `matchMedia('(prefers-color-scheme: dark)')`，映射到 `light|dark`。
- **依赖官方 CSS 与官方标记的准确知识**，官方文件到位后在本接口内收敛，本期只留开关与事件，不展开。

## 7. 实施阶段（迁移清单，每阶段可独立验证）

> 每阶段完成必须 `npm run build` + `npm test` 通过；涉及视觉的阶段人工核对（§8 R5）。

**阶段 0：核心框架**
- [ ] 新增 `src/shared/theme/`（tokens.js / themes/*.js / manager.js / index.js），`night` 值 = §4.2 全表；
- [ ] `style-utils.js#generateCssVariables` 升级为 `generateThemeVariables(themeId)`（由 tokens 驱动、补全各分组）；
- [ ] main.js 初始化接入 ThemeManager（config → 注入变量），`generateAllStyles` 移除重复变量注入；
- [ ] 验证：构建后 `html` 根含变量块；临时改 config 主题，弹窗整体换色（示例迁移段验证）。

**阶段 1：主样式层 `src/shared/styles/*.js`**（体量最大，按文件拆分 commit）
- [ ] `index.js`（94 hex，弹窗/表单/按钮/开关全家桶 + 滚动条颜色 + update 弹窗段）；
- [ ] `popover.js`、`common.js`、`home-page.js`、`dynamic-page.js`、`video-page.js`（69 hex，含对 B 站自身元素的覆盖——颜色随主题后需在 light/dark 下复核覆盖效果）；
- [ ] `style-utils.js` 中 `scrollbarStyle/popoverBaseStyle/buttonStyle` 函数改为输出 `var()`；
- [ ] 滚动条颜色实测（R2），`scrollbar-hover.js` 如需跟随主题则接 ThemeManager。

**阶段 2：组件内嵌 CSS 常量**
- [ ] `popover-dialog.js`（DIALOG_CSS）、`notification.js`（浅色 toast → 主题化后 night/dark 下为深色外观，注意与现有视觉对比）、`tooltip-component.js`、`settings-component-v2.js`（成功/失败边框与提示色）；
- [ ] `update.service.js`（版本检查浮动提示）内联 `cssText`。

**阶段 3：模块/模板内联样式与 SVG fill**
- [ ] 模板 `style=` 内联（buttons.js 评论归属地、paid-mark.js `#fb7299` 付费标——`#fb7299` 为 B 站官方粉色，归「跟随官方」或独立 `--adj-brand-pink` token，待定）；
- [ ] `video-rotate.js` divider、`up-space-popup.js` iframe cssText、`utils/common.js` tooltip 定位 cssText（仅尺寸，确认无色值）；
- [ ] SVG：`ui-buttons.js` 等克隆官方图标 `fill="#fff"` 默认保留官方原色（§2 例外），仅当需随脚本主题时改为 `class + fill: var()`；
- [ ] JS 直写色值处：`settings-component-v2.js` `#2ed573/#ff4757` → `ThemeManager.getColor` 或 CSS 类切换。

**阶段 4：清理与收尾**
- [ ] `theme.js` 兼容层导出核对，确认无遗漏 `theme.colors` 消费方后删除或改为 token 派生；
- [ ] 全仓 grep 断言：`#[0-9a-fA-F]{3,6}` 与 `rgba(` 仅允许出现在 `theme/` 内与 §2 例外清单内（可加 eslint 规则或脚本检查）；
- [ ] `light/dark` 占位色值 + `TODO(official-css)` 全量标注；
- [ ] 文档同步：README 更新日志按发布流程追加（`MM.DD HH:MM` 实际时间）；发布流程见 AGENTS.md（版本号 `3.29.0`，package.json + home.module.js 等模块 version）。

## 8. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | `light/dark` 占位值未对齐官方（官方 CSS 未到） | 占位仅供预览与架构验证，标注 `TODO(official-css)`，默认主题 night 不受影响；绝不把占位宣传为「已对齐」 |
| R2 | `::-webkit-scrollbar` 伪元素对 CSS 变量继承可能失效 | 迁移后浏览器实测；失效则滚动条颜色由 ThemeManager JS 直写（复用 scrollbar-hover 模式），宽度逻辑不动 |
| R3 | notification.js 现为浅色 toast，主题化后深色主题下视觉变化大 | 归为预期行为（纳入主题）；阶段 2 单独核对 night 下观感 |
| R4 | 归并近似色（`#eee/#ddd/#e0e0e0` 等）产生肉眼差异 | 每处归并记录；night 为默认主题，实施时逐屏 diff 复核弹窗/按钮/开关等关键面 |
| R5 | 迁移量大、回归面广（styles 总量约 2.5k 行） | 按阶段拆 commit；每阶段 build+test+人工核对清单；涉及 B 站自身元素的覆盖样式在 light/dark 下复核 |
| R6 | 全量替换后样式字符串仍在运行时拼接，错引 token 名会静默失效 | tokens.js 提供名称清单，阶段 4 加「变量名存在性」静态校验（读取样式字符串中的 `var(--adj-*)` 与 tokens 清单比对） |
| R7 | 与 B 站官方页面 CSS 变量名冲突 | 统一 `--adj-` 前缀隔离；若官方也用相近前缀（概率极低）则在生成变量块时加 `#` 作用域限定 |

## 9. 待用户补充

1. 官方 CSS 文件（light/dark 校准 + 官方主题标记机制，用于 §6.4）；
2. （后续）设置面板是否接「外观-主题」下拉（本次已决策不做 UI，仅 config+API）；
3. `#fb7299`（付费标）等 B 站官方点缀色是否随脚本主题。
