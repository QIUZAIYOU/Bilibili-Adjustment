# Project memory

## Notes

- ---
name: release-workflow
description: 发布流程：更新版本号 → 更新说明 → 推送 → 构建 → FTP 上传
type: project
scope: project
created: 2026-06-03
priority: high
---
# 发布流程

推送更新时必须按顺序执行以下步骤：

## 1. 更新版本号

版本号格式 **`3.X.Y`**，首位 `3` 固定不变：

| 变更类型 | 示例 | 规则 |
|---|---|---|
| 小修小补（优化、修 Bug） | `3.13.0` → `3.13.1` | 只改 **Y** |
| 功能调整（新增、重大更新） | `3.12.7` → `3.13.0` | 只改 **X**，Y 归零 |

需更新的文件：
- **`package.json`** 的 `version` 字段
- ~~相关模块文件的 `version` 字段~~ —— **已删除**（2026-10-23）：模块 `version` 字段无人读取、形同虚设，且长期漂移（`video.module` 停在 3.38.3、`dynamic.module` 停在 2.0.0），已连同 `ModuleMeta.version` 一并移除，**发版时不再需要改模块文件**。

## 2. 添加更新说明

- **更新说明必须简洁：每条更新一句话概括即可（如「新增UP主空间弹窗模式」「修复评论区过短时自动定位失效」），严禁大段介绍、详细描述或解释性内容；新增条目与历史条目保持同样的简洁风格。**
- **`package.json`** 的 `updates` 字段：在已有内容最前面追加，格式 `"版本号 X.Y.Z：功能描述;原有内容..."`。**注意：①每条更新内容末尾必须有 `;`；②更新内容中严禁出现分号 `;`，因为弹窗按 `;` 分割展示内容，出现分号会导致分割错位。**
- **`README.md`** 更新日志：在当前年份小节顶部追加一行，格式 `` `MM.DD HH:MM` — 描述 ``（注意 ` 反引号包裹日期时间`）。**时间必须是执行 `date '+%m.%d %H:%M'` 得到的当前实际时间，严禁复制粘贴旧时间或随意填写。**
- **`README.md`** 文件头「当前版本」行：把 `vX.Y.Z` 与新版本号同步，括号内「最后更新 `MM.DD YYYY`」改为发布当天日期（如 `v3.30.0`、`09.08 2026`），与文末更新日志保持一致。
- **`www/index.html`（落地页，⚠️ 最容易被忘，务必同步）**：三处都要改 ——
  1. 顶部导航的品牌版本号 `<span class="brand-version">vX.Y.Z</span>`；
  2. 首屏 meta 里的版本号（`.hero-meta` 内那个 `<span>vX.Y.Z</span>`）；
  3. 更新日志列表**顶部**新增一条本版记录（`<span class="cl-version mono">vX.Y.Z</span>` + `cl-date` 用 `YYYY-MM-DD` + `<p>` 写与 README 同口径的一句话）。
  **为什么单列一条**：落地页是**手工维护**的，而 `upload.py` 对 www 是"文件没变就跳过"，漏更新不会报任何错 —— 历史上 3.36.5 之后一直停在 `v3.36.5`，直到 3.37.0 才发现。现在已有机器门禁 `npm run check:www`（`scripts/check-www-version.mjs`，`upload.py` 在两种模式下都会先跑）：上面三处与 `package.json` 的版本号任一处不一致，上传会**直接中止**。改完可先单独跑 `npm run check:www` 自测。

## 3. 推送到远程仓库

```bash
git add -A
git commit -m "chore: bump to X.Y.Z"
git push origin main
```

**CI（2026-10-23 起机器强制）**：`.github/workflows/build.yml` 在每个 PR 上跑 `npm test` → `typecheck` → `check:www` / `check:hot-content` / `check:hot-config` / `check:colors` → `build` → `stats`（体积门禁）。**依赖升级的自动合并必须等 CI 通过**（`dependabot-auto-merge.yml` 用 `gh pr checks --watch`，失败即不合并 —— 以前是 `--auto` 失败就回退成直接合并，依赖升级能在构建失败的状态下进 main）。所以**发布/推送前先本地跑一遍全量 `npm test`**（日常开发只跑相关用例，见 §6「本地测试只跑与改动相关的部分」）。

## 4. 构建项目

```bash
npm run build
```

**打包前必须提交干净的锁文件**：`npm install`（尤其依赖升级、`git rebase` 到 dependabot 提交之后）会改写 `package-lock.json` —— 版本号字段、`libc` 之类的包元数据 —— 此时工作区就是脏的。若先 `build` + `upload`，`vite.config.js` 注入的 `@build-sha` 会带 `-dirty`，后果有两个：设置页版本号变成 `vX.Y.Z+sha-dirty`（既丑又像未完成品），且该构建的「同版本覆盖发布」感知会被 `isComparableBuildSha` 关掉（3.38.3 真实踩过，见 `docs/hot-update-assets.md` 之外的本次复盘）。正确顺序：`npm install → git add package-lock.json && git commit → npm run build → python scripts/upload.py`。显示口径：脏标识/取不到标识时 UI 只显示 `vX.Y.Z`，完整构建标识放进版本号悬浮提示（`src/components/settings-dialog.ts` 的 `versionTitle`）；干净构建才显示 `vX.Y.Z+sha`。

## 5. 上传到阿里云轻量服务器

构建后一条命令完成上传（脚本读取项目根 `.env` 凭据，内置远端校验，绝不打印凭据）：

```bash
npm run build
python scripts/upload-workbench.py   # workbench 通道（本机可用，见下）
# 或
python scripts/upload.py             # SCP 通道（需要服务器私钥）
```

**上传目录由 `.env` 的 `SERVER_DEPLOY_PATH` 配置，不要硬编码**（实测现网 = `/www/wwwroot/www.asifadeaway.com/UserScripts/bilibili`）。

**⚠️ 两条通道，优先用 workbench（2026-10-24 实测修正）**：

| 通道 | 脚本 | 前置 | 说明 |
|---|---|---|---|
| **workbench** | `scripts/upload-workbench.py` | workbench CLI 已登录（凭据在它自己的 profile 里） | 走**阿里云云助手 API**（文件经 OSS 中转），**不需要 SSH 私钥**；本机只有 GitHub 用的密钥 → 这条才是本机可用的通道 |
| SCP | `scripts/upload.py` | `.env` 里有 `SERVER_HOST/SERVER_USER/SERVER_DEPLOY_PATH` 且**服务器认得本机私钥** | 轻量服务器 SSH 只认密钥；本机 `~/.ssh` 里只有 GitHub 的 id_ed25519/tms，服务器 `authorized_keys` 里没有 → 直接跑会 `Permission denied` |

两条通道的**发布物、目录布局、门禁、sha256 校验完全一致**（`upload-workbench.py` 直接 import `upload.py` 的门禁函数，只换传输层），线上状态无差别。`HOT_ONLY=1` 两边都支持（只刷 hot-config/，不触发用户更新提示）。

**⚠️ `.env` 里那套 FTP 凭据（`bxu2359070606.my3w.com`）已作废**：它指向的是**另一个阿里云虚拟主机**（花生壳穿透），那棵树上是 **v3.21.0 的老脚本**，既没有 `hot-config/`、`version.json`，也没有落地页目录 —— 上传到那里用户根本拿不到。别再用 FTP 发布。

**上传前会自动跑的门禁（2026-10-23 起全部机器强制，缺一即中止且**不传任何文件**）**：`check:hot-content`（硬编码可热更内容）→ `check:www`（落地页版本号）→ `check:colors`（字面色值）→ **产物与 `package.json` 同版本且比源码新**（防「改了代码忘了 build」把旧产物发上线）→ `check:hot-config`（热更资产合法）→ 体积门禁 `stats`。其中**产物一致性断言与体积门禁放在上传产物之前**，失败时线上不会变成「新脚本 + 旧热更资产」的混合态。www / API 的「是否需要上传」按 **sha256** 比对（不再按字节数，等长编辑曾被静默漏更新）。

**Why:** 迁移到轻量服务器后不再走 FTP（FTP 那套是废弃副本）；workbench 走云助手 API 比 SSH 更稳（不依赖私钥、不受 SSH 端口/安全组限制），文件传输经 OSS 中转。两条通道都自动校验远端文件 sha256。连续失败过多可能触发服务器临时限制，稍等重试即可恢复。

## 6. 开发注意事项

- **本地测试只跑与改动相关的部分（2026-10-24 起，务必遵守）**：开发过程中**不必跑全量 `npm test`**，只跑与本次改动相关的用例文件即可。单文件跑法：`node --import ./test/alias-loader.js --test test/xxx.test.ts`（`.js` 同理，多个文件可并列写在 `--test` 后面）。判定「相关」按改动落到哪个模块/纯函数找对应回归用例（如改 `src/utils/text.ts` 就跑 `test/linkify-xss.test.ts`，改 `src/services/config.service.ts` 就跑 `test/config-normalize*.test.ts`）。**全量 `npm test` 保留给发布/推送前与 CI**，那里必须跑满（CI 已机器强制）。⚠️ 例外：改动触及**共享基础设施**（`src/shared/` 下的注册表、正则、模板、主题 token）、**跨模块公共 API**（`ConfigService`、`elementSelectors`、`getTemplates`）或**构建/发布脚本**时，回归面不可估，跑全量。
- **B 站吸顶头部与「扣头部高度」判据（3.36.3 起，务必遵守）**：B 站改版后真正吸顶的是**头部条** `#biliMainHeader .bili-header .bili-header__bar`（`position: fixed`、高 64px、始终存在；实测页面顶部/滚动 900/滚动 2500 三处 `rect.top` 均为 0）；容器 `.bili-header.bili-header--mini` 只是**态类**，`position` 为 `relative` 且会随页面滚走；旧的 `.bili-header .mini-header` 已失效。因此：
  - 选择器 `headerMini` 指向 `.bili-header__bar`（可通过 `hot-config/selectors.js` 覆盖表热更；老版本用户正是靠它修好，故该条目在用户普遍升级前**不要删**）；
  - 「头部是否压在内容上方」统一走纯函数 `src/utils/header-offset.ts#isHeaderOverlaying`：**只有 `fixed` / `sticky`（或取值含 `fixed` 字样）才算**，`relative`/`absolute`/`static` 与读不到样式一律不算。**禁止写死 `position === 'fixed'` 之外的判断，也禁止用「非 static 一律算」**（后者 2026-09-21 踩过：开启「夜间哔哩」样式时用户刻意给 `.bili-header--fixed .bili-header__bar` 加了 `position: relative !important`，导航栏随页面滚走（实测滚动 1500 时 rect.top=-1500），若按「非 static」判为固定就会多扣 64px、定位偏上；关闭该样式时同一元素为 `fixed`、各滚动位置 rect.top 恒为 0，必须扣 64px）。`player-mode.ts` 的三处调用点都用它，以后调判据只改这一个函数。
- **主题系统（v3.29.0 起，务必遵守）**：
  - 所有 UI 颜色/阴影/圆角/字号/间距一律通过 CSS 变量 `var(--adj-*)` 引用，**样式与模板代码中严禁出现字面色值**（含内联 style、JS 赋值）；`npm run check:colors` 全仓断言兜底。
  - 变量唯一来源：`src/shared/theme/tokens.ts`（token 清单 + night 默认色板）与 `src/shared/theme/themes.ts`（night/light/dark 三主题取值）。**改色或新增 token 必须三主题同步**（缺键会使对应主题下该变量缺失，`test/theme.test.js` 校验全量覆盖）。
  - `light`/`dark` 必须完全对齐 B 站官方色值：来源为 `src/shared/styles/bili-theme/` 官方 CSS（**勿改动该目录**）。light=light_u.css 的 `*_u` 变量，dark=dark.css，语义对应关系见 map.css；themes.js 每行已注释官方变量来源，随官方升级时按注释校准。
  - 设置项 `theme`（视频设置「界面主题」）：`night`=夜间哔哩、`follow`=跟随B站（默认，界面配色与 B 站当前模式匹配）。follow 模式判据：`<html>` 含 `bili_dark`（现版本）或 `night-mode`（旧版本）class → 应用 `dark`，否则 `light`；ThemeManager 用 MutationObserver 监听 class 变化持续跟随。检测到 Stylus「夜间哔哩」样式（`style.stylus` 含 `===StylusNightForBilibili===`）时会实时把主题切为 `night`，关闭后回 `follow`（见 `src/shared/theme/stylus-night.ts`）。
  - 配置变更即时生效链路：`ConfigService.setValue('theme', …)`（本地）与跨标签页同步消息都会 emit `config:changed` → `ThemeManager.setTheme` 应用（见 `src/shared/theme/manager.ts`、`config.service.js`）。
  - JS 侧需要色值：`ThemeManager.getColor('brand')`（读 CSS 变量），不要硬编码。
- **弹窗 UI 配色**：随主题 token 自动变化，勿写死色值。历史层级已语义化：外层底 `--adj-bg-page`、卡片/内部元素底 `--adj-bg-surface`、边框 `--adj-border-strong` 等（见 tokens.js 注释）；按语义选用，勿用 `#212121`/`#2c2c2c`/`#424242` 字面值。
- **不可信内容进 HTML 前必须消毒（2026-10-23 起，务必遵守）**：凡是「用户/UP 主/评论者可写」的文本（简介、评论、配置值、导入的配置文件、远程共享缓存），进 `innerHTML` 前一律走白名单消毒：
  - 链接化产物：`src/shared/regexps.ts` 的 `linkifyTokens` 必须把**未命中片段**与 token 内文本都 `escapeHtml`（`src/utils/text.ts`），只有生成的标签本身保持原样 —— 不转义就是**存储型 XSS**（任意 UP 主/评论者即可对所有访客注入脚本，页面无 CSP）；
  - tooltip 提示：`src/components/tooltip-component.ts` 走 `src/utils/sanitize-html.ts` 的 `sanitizeTooltipHtml`（只放行 `<br>` 与 http(s) 的 `<a>`，其余标签整段丢弃），**禁止直接 `innerHTML = content`** —— 设置项提示里会插值配置值，配置值可来自用户导入的配置文件；
  - 配置值进 URL：`location.href = …` 前必须过 `sanitizeHttpUrl`（只放行 http/https），否则导入的配置可注入 `javascript:`；
  - 远程共享缓存（跳过片段）：读回一律过 `sanitizeSegments`，且跳转时间要钳制到 `video.duration`。
- **popover 弹窗元素上严禁直接设置 `display` 样式**：popover 关闭态的隐藏依赖浏览器 UA 规则 `[popover]:not(:popover-open) { display: none }`（无 `!important`），作者级 `display`（如 `#UpSpacePopover { display: flex }`）会覆盖它，导致关闭后弹窗仍可见。此前弹窗都"关闭即销毁"掩盖了此问题，2026-08-29 弹窗缓存化后暴露。需要 flex 布局时放在弹窗内部容器上；兜底规则：旧类 `.adjustment-popover:not(:popover-open)`（`styles/index.js`）与新组件类 `.adjustment-dialog:not(:popover-open)`（`popover-dialog.js` DIALOG_CSS）均已加 `display: none !important;`，keepAlive 缓存弹窗（如 UP 主空间弹窗）依赖该兜底，改动组件类名/样式时勿移除。
- **Vue 入口必须懒加载（v3.32.0 起，务必遵守）**：任何新增 Vue island（组件/SFC）**严禁在 `main.js`、模块顶层或其它首屏路径静态 import `vue` 或 `.vue`**——单文件用户脚本无法分包，静态 import 会让 Vue 运行时进入首屏关键路径。统一写法：在用户交互（点击/快捷键）处 `await import('vue')` + 动态导入自己的**桥模块**（见下条），并给弹窗内容区先插入加载态文案。参考 `src/ui/settings/index.ts#mountVueSettingsPanel`、`src/modules/video/ad-skip.ts#showSkipSegmentManager`、`src/main.ts#openVueSampleDialog`。
- **严禁开启 terser 的 `mangle.properties`（v3.32.0 起，务必遵守）**：产物是「按 chunk 分别压缩再由 SystemJS 组装」，同名属性在不同 chunk 会被压成**不同名字**，从而破坏跨模块属性协议：
  - Vue 内部属性（`_component`、`_props`、`_container`、`__v_*`、`__vccOpts`…）在 runtime-core / runtime-dom / vue 三个 chunk 间不一致 → **所有 Vue 弹窗 mount 时抛 `TypeError: Cannot read properties of undefined (reading 'render')`**（`vite.config.js` 曾配 `regex: /^_/`，已移除）；
  - 其它依赖 `_` 前缀跨模块约定的对象/元素扩展属性同样会失效。
  - 排查手段：`ADJ_NO_OBF=1 npm run build` 出「不混淆但同结构」的产物；或用 jsdom + `System.registerRegistry` 在 Node 里复现（本项目排查脚本模式）。体积代价约 +4~5 KB gzip，远小于其风险。
- **动态导入 SFC 必须经「命名导出桥」（v3.32.0 起，务必遵守）**：产物以 **SystemJS**（`@require systemjs` + `named-register`）承载模块，**命名导出是可靠通道**（`import('vue')` 取 `createApp` 即为此路径）。为避免依赖被动态导入模块的 `default` 形状，统一做法：
  - 动态导入的目标是**自己的 JS 桥模块**（如 `src/ui/settings/lazy-panel.ts`、`src/modules/video/skip-manager/lazy-panels.ts`），桥内 `import X from './X.vue'` 后 `export const XComponent = X`；
  - 宿主用命名导出取组件（`mod.XComponent || mod.default`），并做一次「像不像组件」的校验（`render/setup/template/props`）+ 明确报错；
  - **桥模块禁止被静态 import**（它静态引入 SFC 与 Vue，被静态引用会把 Vue 拖进首屏）。
- **弹窗可访问性统一走 `applyDialogA11y`（`src/utils/dialog-a11y.ts`）**：`openAdjustmentDialog` 已内置（role/aria-modal/aria-labelledby、Tab 焦点陷阱、Esc 关闭、关闭后归还焦点、body 滚动锁引用计数）。自建弹窗（不走通用壳）时必须显式调用，并在关闭/destroy 时执行返回的清理函数，否则会出现焦点逃逸或滚动锁泄漏。
- **层级 z-index 只允许 `var(--adj-z-*)`**：token 定义在 `src/shared/theme/tokens.ts` 的 `zIndex`（overlay/popover/header/tooltip/notification），由 ThemeManager 生成 CSS 变量。**禁止写 `999999`、`2147483000` 之类字面值**（历史遗留已全部清理，回潮会被 review 拒绝）。
- **性能埋点与体积门禁（Sprint 0）**：关键路径统一用 `src/shared/perf.ts` 的 `perfStart/perfEnd`（前缀 `adj:`）打点；交付前跑 `npm run build && npm run stats`（相对 `scripts/build-baseline.json` 增长超 +4KB gzip 或 +5% 会失败，发布新版时用 `npm run stats -- --update` 刷新基线）。指标与验收清单见 `docs/performance-guardrails.md`。
- **更新配置已一刀切（v3.34，勿再加回独立开关）**：「更新检查频率」「自动更新」「跳过更新检查」「自动检查更新」这 4 个语义重叠的设置项已合并为**唯一的 `update_mode`**（`radio`：`auto` / `manual`，默认 `auto`）。两种模式**都会**检查更新，区别只在「是否弹窗」：`auto` 发现**功能级**更新弹窗（**同一版本只弹一次**，`localStorage` 记录；补丁级只走版本号处常驻提示，见下条「更新提示策略、检查源与构建标识」），`manual` **一律不弹窗**，改为在设置面板右上角版本号处**常驻**提示「有新版本 vX.Y.Z」，用户点击版本号才打开更新弹窗。语义要点：不弹 ≠ 不提示，所以「每版本只弹一次」不会造成漏提醒 —— 这是 issue #27 的根治方案，勿自作主张恢复永久去重或重新引入频率设置。老配置在 `ConfigService.#migrateLegacyConfigs` 里按需迁移（旧键指示「手动」才写库，遵守 P0-3 只读不写）。回归防线：`test/update-mode.test.js`、`test/config-normalize.test.ts`。
- **配置读写约定（P0-3）**：`ConfigService.getValue` **只读不写库**（缺失时返回 schema 默认值并进内存缓存）；批量场景用 `ConfigService.setValues`（单事务批量写）或 `storageService.userBatchGet/userBatchSet`，**禁止在循环里逐键 await**（会退化成 N 次 IndexedDB 事务）。
- **配置归一化必须落在写边界（2026-10-23 修，务必遵守）**：类型归一化（`normalizeConfigValue`）**只在写边界执行** —— `setValue` / `setValues` / `initializeDefaults` / 跨标签页 BroadcastChannel 同步，四条路径都要归一化后再写库与写缓存；`getValue` 命中缓存时也再归一一次（防御性读路径）。⚠️ **旧实现只在 `getValue` 的「缓存未命中」分支归一化**，而 `initializeDefaults` 会把原始值灌进缓存 → 归一化代码永远不执行 → 库里存着字符串 `'false'` 时，开关显示与运行期判断全部反了（issue #27 同类故障）。回归：`test/config-normalize-boundary.test.ts`。
- **AI 广告识别的输出预算（3.35.2 起，务必遵守）**：`max_tokens` 是「推理 + 答案」的**共享**预算 —— 思考型模型（自定义模型 + deepseek 系会注入 `thinking: {type:'enabled'}` + `reasoning_effort: 'high'`）一旦推理超过预算，接口返回 `finish_reason: "length"` 且 `message.content` 为**空**，表现就是「AI响应内容为空」并且**一个广告段都识别不出**（2026-09-17 用户报的正是此形态；3.31.0 那次「性能优化」给请求加了写死的 `max_tokens: 2048`，此前没有上限，故此前不复现）。现口径：预算按是否思考型给（普通 2048 保持既有成本/延迟特征，思考型 8192），并在「空响应且被截断或有推理内容」或「被 length 截断导致 JSON 解析失败」时**用更大预算重试一次**（2048→4096 / 8192→16384），只在本来就会失败的路径上多花一次调用。预算与判定是纯函数 `src/utils/ai-response.ts`（回归 `test/ai-response.test.ts`）。改这里时注意两条：**不要把预算调小**（等于把故障装回去）；**不要丢掉 `finish_reason` / `usage`（含 `completion_tokens_details.reasoning_tokens`）/ `reasoning_content` 三个诊断字段** —— 「内容为空」的日志没有诊断信息等于没法查（本次就是靠它们定位的）。
- **热更资产统一放在服务器 `hot-config/` 目录（3.35.5 起，务必遵守）**：所有「改服务器文件即生效、用户无需更新脚本」的资产都在 `{SERVER_DEPLOY_PATH}/hot-config/` 下（`ad-detection-prompt.js` + **五张覆盖表** `selectors.js`/`ai-providers.js`/`regexps.js`/`templates.js`/`themes.js`）。完整说明见 `docs/hot-update-assets.md`，下面只记硬性约束：
  - **扩展名必须是 `.js`（内容其实是 JSON）**：只有 `location ~* ^/UserScripts/.*\.(js|css)$` 带 CORS（`map $http_origin $adj_cors_origin` 回显 `*.bilibili.com`），`.json` 不在其中；脚本按文本读取后自解析。想改 `.json` 必须先给该 location 加 CORS。
  - **三级取值 = 远端 → localStorage 缓存 → 内置值**，stale-while-revalidate：`src/main.ts` 在模块加载**之前**调 `applyCachedHotConfig()`（同步、零延迟，保证覆盖早于首次查询），随后 `refreshHotConfig()` 后台并发刷新 5 张表（各 3s 超时，成功即**只把生效条目**写缓存+立即应用）。**拉不到就什么都不覆盖，绝不抛错、绝不清空缓存**。
  - ⚠️ **取热更资产必须 `cache: 'no-store'`（3.36.6 起）**：5 张覆盖表与远程提示词的 fetch 都带它。原因：服务器按请求 Origin 回显 ACAO，浏览器若复用其他子域缓存下来的响应，CORS 校验直接失败（2026-09-23 用户实测：www 页面 5 个 `hot-config/*.js` 全被拦，服务端 curl 各 Origin 却都正常 —— 服务端缺 `Vary: Origin`，客户端这层是兜底）；顺带避免启发式缓存压住配置更新。回归 `test/hot-config-fetch.test.ts`（**去掉 `no-store` 会失败**）。
  - **⚠️ 目标模块是懒加载的，「内容先到」与「目标先到」都必须工作**：`src/shared/hot-config-registry.ts` 把「记录内容」与「注册目标」分开（内容先到 → `registerHotConfigTarget` 时补应用；目标先到 → `setHotConfigEntries` 时立即应用）。**目标模块在各自模块体里自注册，服务端（`hot-config.service.ts`）不 import 任何目标模块** —— 既避免把懒加载的正则/模板拖进首屏包，也避免循环引用（所以 element-selectors / ai-providers 也改成了自注册，不再由服务端 import）。
  - **白名单 + 逐条校验**：远端只能覆盖**已存在的 key**（选择器名/正则名/模板名/主题 token/provider 都必须来自内置值），不能新增能力；非法项**逐条丢弃**（`warn` 报出条目与原因）。专项护栏：选择器过 CSS 语法校验；正则源串过 `analyzeRegexSource`（ReDoS 启发式：嵌套量词/可空重复/分支前缀包含）**且 flags 不可覆盖**（flags 与调用点语义绑定：`g` 决定 replace 是否全局、`test()` 是否有状态）；模板必须保留内置模板的**全部 `[[占位符]]` 与 `id="..."`**（`checkTemplateOverride`）且禁 `<script>`/内联事件/`javascript:`；主题色值与阴影过 `isSafeCssColor`/`isSafeCssValue`（禁 `;{}<>\\`、注释、`url()`、控制字符，防逃出 `--adj-*:<值>` 声明）。解析/校验是纯函数 `src/shared/hot-config.ts`，服务在 `src/services/hot-config.service.ts`。
  - **发布侧强制校验**：`npm run check:hot-config`（`upload.py` 在两种上传模式下都会先调，失败即中止、不上传热更文件）装上 DOM 桩（`scripts/lib/dom-stub.mjs`）后侧效导入各 target，**用运行时同一套代码**校验 5 张表并打印会被丢弃的条目 —— 用户侧对写错的条目是**静默丢弃**，只有这里能拦住。
  - ⚠️ **选择器覆盖必须走 `overrideSelector()`，不能只调 `registerSelector()`**：查询解析是 `CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)`，**`CSS_MAP` 优先**，只写注册表的话覆盖**静默无效**（日志还显示成功）。`overrideSelector` 同时改写 registry 与 `CSS_MAP`；回归 `test/selector-override.test.ts`。
  - ⚠️ **主题色值覆盖后必须重写变量表**：`ThemeManager.init()` 是「一次注入全部主题变量 + 之后只切 `data-adj-theme`」，故 `themes` 表的 `afterApply` 调 `reloadThemeVariables()`；覆盖时**克隆** colors/shadows 再改（`night.colors` 与 `tokens.ts` 的 `defaultColors` 是同一对象，直接改会连内置默认色板一起改掉）。
  - **内置值永不删除**：内置选择器/provider/正则/模板/主题/提示词既是首次运行与远端不可用时的兜底，也是覆盖白名单的来源。
  - ⚠️ **禁止在模块里硬编码可热更的内容（2026-09-24 起，务必遵守）**：B 站**页面选择器**、B 站**URL/页面结构正则**、**注入 B 站页面的 HTML**，一律走注册表 ——
    - 选择器 → 加进 `src/shared/element-selectors.ts` 的 `CSS_MAP`，调用点用 `elementSelectors.get/CSS/queryAll/each`，**不要**写 `document.querySelector('.bpx-…')`（页型专属的再加进 `PAGE_TYPE_EXCLUSIVE`）；
    - 正则 → 加进 `src/shared/regexps.ts`（`video`/`dynamic`/`common` 三组，覆盖只改 source、flags 与调用点绑定）；
    - 模板 → 加进 `src/shared/templates/` 并在 `templates/index.js` 合并，调用点用 `getTemplates.<key>`。
    理由：写死的东西**只能等发版才能修**，B 站一改版用户就会有一段时间功能失效（2026-09-24 一次审计里就从模块里迁出 5 个选择器组、13 条结构正则与 2 个注入模板）。
    **机器门禁**：`npm run check:hot-content`（`scripts/check-hot-content.mjs`）扫描 `src`，拦下 `querySelector/closest/matches/queryDescendant` 里的 B 站特征字面选择器与含 `/video/`、`/bangumi/`、`BV`、`bpx-` 等结构 token 的正则；`upload.py` 的两种上传模式都会先跑它，失败即中止上传。
    豁免三种情况：注册表文件本身、脚本自己的 DOM（`adj-*`/`adjustment*`/`ba-*`/`bilibili-adjustment-element`）、纯域名校验（`/bilibili/`、`/space.bilibili.com/` —— 域名变了整个 `@match` 都要改，本就无法靠热更解决）。
  - 排查「行为变了」先看 debug 日志：`热更配置 selectors：来源=remote|cache|none 生效 N 项` 与 `热更配置 X：丢弃 N 项 — key（原因）`。
- **提示词远程化：改提示词不必让用户更新脚本（3.35.4 起，务必遵守）**：广告识别提示词是「配置」而非「代码」，运行时按 **远程文件 → 本地缓存 → 内置提示词** 三级解析（`src/services/prompt.service.ts`，纯逻辑在 `src/shared/remote-prompt.ts`）。要点：
  - 远程文件：`https://www.asifadeaway.com/UserScripts/bilibili/hot-config/ad-detection-prompt.js`，内容为 **JSON**（`{prompt, version, hash, updatedAt}`）；**扩展名用 `.js` 只为命中服务器的 CORS 规则**，脚本按文本读取后自解析 —— 想改成 `.json` 必须先给该 location 加 CORS。
  - 生成与上传：`npm run build`（= `vite build && node scripts/build-hot-config.mjs`）从**唯一真源** `src/shared/ad-detection-prompt.ts` 生成 `dist/hot-config/ad-detection-prompt.js`，`scripts/upload.py` 随发布上传。
  - **只改热更资产时的热更**：`HOT_ONLY=1 python scripts/upload.py`（别名 `PROMPT_ONLY=1`）—— 重新生成提示词并**只**上传 `hot-config/` 下的文件，不碰 user.js/meta.js/version.json，因此不会触发「同版本内容已更新，点击重新安装」的提示，用户无需更新脚本。改完提示词**必须**同时跑 `python scripts/sync_ad_prompt.py` 同步给平台（否则脚本与平台判定漂移）。
  - **内置提示词永不删除**：它是首次运行（还没缓存）与远程不可用时的兜底；`src/shared/ad-detection-prompt.ts` 永远是真源，远程文件只是它的分发副本。
  - 远程内容会**校验**（长度 ≥ 800 且含 `# 视频广告识别专家提示词` 标记），不合法即回退 —— 防服务器返回半截内容/错误页/被改写文本导致识别行为莫名变化。
  - 每次识别都会 debug 打印 `广告识别提示词 来源=remote|cache|embedded vX #hash N 字`；排查「识别行为变了」先看这一行确认用的哪一版。
  - 回归：`test/remote-prompt.test.ts`（解析/校验/来源描述）；端到端五场景（远程优先、会话内只拉一次、远程失败/错误页/半截内容回退内置、缓存兜底）曾用 vite 夹具 + puppeteer 实测通过。
- **设置弹窗只有一套实现（Vue，务必遵守）**：播放页/动态页设置表单由 `src/ui/settings/SettingsPanel.vue` 按 `settings-config.ts` schema 渲染，宿主为 `src/components/settings-dialog.ts`（`SettingsDialogHost`：弹窗壳装配、事件归一、AI 特殊联动、导入导出、版本检查、左侧分组导航），弹窗壳 HTML 由 `src/components/settings-shell-renderer.ts`（`SettingsShellRenderer`）生成。历史遗留的 `v2`/`V3` 命名、`settings_panel`（v3/v2 切换）、命令式渲染器与自动回退已全部删除，**仓库里不存在"旧版本"可改**——所有设置调整都落在上面这套代码与 schema 上（详见 `docs/settings-panel.md`）：
  - 挂载走 `mountVueSettingsPanel`（`src/ui/settings/index.ts`，懒加载），弹窗 `closed` 与面板重建前必须 `unmountVuePanel()`（它同时清理分组导航的 observer 与滚动监听）；
  - **Vue API 必须与组件同源**：产物按 chunk 分别压缩，`import('vue')` 与 SFC 依赖的 `runtime-core`/`runtime-dom` 是**两份运行时实例**（体积上能差 ~19KB gzip）。因此桥模块（`lazy-panel.ts`/`lazy-panels.ts`）除组件外还导出 `createApp/reactive/markRaw`，宿主/模块一律用桥导出的 API，**禁止再 `import('vue')`**；
  - **必须写「Vue 响应式代理」而不是原始对象**：`reactive(configs)` 的 trigger 只发生在代理上，写原始对象会绕过 set trap → 面板永不重渲染（表现为开关点了不刷新、`visible`/children 联动失效）。`mountVueSettingsPanel` 回传 `bridge.configs`/`bridge.dynamicOptions`，宿主存入 `_vueConfigsProxy`/`_vueDynamicOptionsProxy`，所有写入路径（`saveConfig`、跨标签 `config:changed`、`syncVueDynamicOptions`）都必须经它们；
  - **组件模板里原生 select/input/radio 的事件绑定不可漏**：`SettingItem` 的 `select` 必须带 `@change`（历史 bug：重写模板时丢失 → 主题/模型下拉完全不触发；可从产物 patchFlag 只含 `["id","disabled"]` 看出）；
  - 事件归一：面板 `onChange` → `handleVueConfigChange`（input 去空格、checkbox 布尔化 → `handleSpecial*` 联动）；按钮 `onValidate`/`onRefresh` → `handleValidateClick`/`handleRefreshClick`；
  - 可见性/children 由组件按 `configs` 派生（宿主不再操作 DOM，勿加回 DOM 操作，否则与组件 patch 抢 DOM 抖动）；新增设置项只需改 schema，禁止再往宿主/渲染器加实现；
  - **递归子项靠文件名自引用**：`SettingItem.vue` 内部用 `<SettingItem>` 渲染 children（编译为 `_resolveComponent("SettingItem", true)`），改名时文件名与标签要同步；
  - 回归手段：`jsdom + System.registerRegistry` 可加载真实产物并挂载面板，模拟点击/切换断言「配置写入 + UI 同步」；纯函数判定（如悬浮导航当前分组 `src/ui/settings/nav-scroll-spy.ts`）用几何模型直接单测（`test/settings-nav-spy.test.ts`）。
- **更新提示策略、检查源与构建标识（3.35.1 起，务必遵守）**：更新链路完全自建（拉 `meta.js`/镜像 `package.json` 比版本号 → 弹窗或版本号处常驻提示 → 打开 `user.js` 由脚本管理器安装），产物里**没有** `@updateURL`/`@downloadURL`，所以版本号既是唯一的发现键，也是用户点安装时脚本管理器比较的依据。四条规矩：
  - **对外发布过内容就必须升版本号**（补丁改 Y 位、功能改 X 位）；「同版本覆盖发布」只作应急手段，后果是"用户无感 + 脚本管理器提示已安装相同版本"；
  - **弹窗只留给功能级更新**：`auto` 模式下仅 major/minor（X 位）变化弹窗（同一 `方式:版本` 只弹一次），补丁级（Y 位）只走版本号处常驻提示 —— 小修复不打断用户。策略是纯函数 `src/utils/update-policy.ts`（`isFeatureLevelUpdate`），回归用例 `test/update-policy.test.ts`；
  - **检查源（全部直连，3.35.1 起彻底移除 CORS 代理池）**，按序取第一个可用：① 自有服务器 `meta.js`（**唯一带 `@build-sha` 的源**，正常情况下首选）→ ② GitHub raw `package.json`（`ACAO: *`，但国内可能不可达）→ ③ **Gitee API contents**（`ACAO: *` 且国内可达，作为 GitHub 兜底）。⚠️ **Gitee 必须走 API 而不是 raw**：raw 既不返回 ACAO（页面读不到，token 也补不了 CORS），又以 `text/plain` 返回 `.js`（`<script>` 标签同样被 MIME 拦下）；API 的代价是内容为 base64，需按 UTF-8 解码（`parseGiteeContentsInfo`）。**个人 token 绝不能进用户脚本**（脚本明文分发），公开仓库读 API 无需 token，token 只在 `scripts/upload.py` 里用于提高限额。
    - **服务器 CORS（2026-09-17 已改）**：`/www/server/panel/vhost/nginx/html_www.asifadeaway.com.conf` 里原先 4 处 ACAO 都写死 `https://www.bilibili.com`（导致 `space.`/`t.bilibili.com` 上权威源被浏览器拦下、只能回退镜像）；现已改为白名单 `map $http_origin $adj_cors_origin`——`*.bilibili.com` 子域回显请求 Origin，其余回落 `https://www.bilibili.com`（不放开给任意站点），`.js` location 与 API location 都已生效，改前备份在同目录 `.bak-before-cors`。**注意**：宝塔面板改站点配置时可能按模板重写该文件（会把 map 一起写掉，属安全失败——回退到旧行为，不会出现未定义变量），改动后请用 `curl -H 'Origin: https://space.bilibili.com' -I` 复核 ACAO。
      - ⚠️ **ACAO 白名单必须配 `Vary: Origin`（2026-09-23 修）**：`map` 回显的是请求 Origin，所以响应必须声明 `Vary: Origin`，否则浏览器 HTTP 缓存会把某个子域（如 `space`）拿到的响应复用于另一个子域（如 `www`），报「ACAO=space 与 www 不匹配」而**服务器侧 curl 各 Origin 都正常**（本次真实故障：5 个 `hot-config/*.js` 全部被拦）。现 `.js|.css` location 与 API location 都有 `add_header Vary Origin always;`，热更资产另加 `add_header Cache-Control 'no-cache' always;`（保证远端改动及时生效、不再走启发式缓存）；改前备份 `.bak-before-vary`。复核要**换 Origin 各测一次**并确认 `Vary: Origin` 存在。
  - **构建标识兜底**：`vite.config.js` 构建期取 git 短 SHA（脏工作区带 `-dirty`）→ 同时注入产物元数据 `@build-sha` 与源码常量 `__BUILD_SHA__`（`src/shared/build-info.ts`）；`scripts/upload.py` 从**产物自身**抄 version/sha 生成并上传 `version.json`（供人工/完整性核对；它**不是**脚本端的检查源——该文件没有 CORS 头），并顺带校验 Gitee 镜像是否已同步到本版本。脚本检查时若「版本号相同但 sha 不同」→ 判为同版本覆盖发布，仅在版本号处提示「内容补丁可更新」（`isSameVersionRepublish`）。边界：`unknown`/`-dirty`/空 sha 一律不比对（避免本地开发误报）；镜像源没有 sha，故回退到镜像时不检测同版本覆盖（该信号只在权威源可用时有意义）；脚本管理器不允许脚本自装，故兜底只解决"感知"不解决"静默安装"。
    - ⚠️ **同版本覆盖发布必须要求「版本号真的相同」（3.36.0 修）**：旧实现只判「线上不比本地新 + 构建标识不同」，于是**刚升级到最新版的用户**（本地 vX 比线上缓存里的 vX-1 新）会被误判成覆盖发布，提示「内容补丁可更新」。判据统一走 `isSameVersionRepublish(currentVersion, latestVersion, localSha, remoteSha)`，回归 `test/update-policy.test.ts`。
    - ⚠️ **检查源必须 `cache: 'no-store'`（3.36.0 修）**：服务器对 `.js` 只发 `ETag`/`Last-Modified`、没有 `Cache-Control`，浏览器会启发式缓存（已实测：同一 URL 连续两次普通 fetch，第二次 `fromCache=true`）。更新检查每个会话只跑一次却必须看到此刻的线上信息，否则会读到旧 meta.js 引发上面的误判（`#fetchWithTimeout` 已统一加 `cache: 'no-store'`，实测第三次请求 `fromCache=false`）。
    - ⚠️ **版本号处的常驻提示必须"没有提示时主动清空"（3.36.0 修）**：设置弹窗是缓存复用的，`showPendingUpdate()` 早期写成 `if (!hint) return`，只"不写"不清空 → 状态已清除后旧文案仍留在 DOM（表现为"已是最新版却还显示内容补丁可更新"）。现写空文案并加回 `hidden` 类。另外「线上不比本地新」的两个分支都要顺手清掉过期的 `pendingUpdateVersion`，否则会出现「本次检查说不比本地新、提示还显示有新版本 vX」的自相矛盾。
    - 文案口径：有新版本 = `- 有新版本 vX -`；同版本覆盖发布 = `- 内容补丁可更新 -`（纯函数 `formatPendingUpdateHint`，回归 `test/update-policy.test.ts`）。
  - 检查结果只做**会话内内存缓存**（每会话一次），不再跨会话缓存 —— 发布后本会话即可发现（历史上 24h 的 localStorage 缓存与早已并入 `update_mode` 的 `update_check_frequency` 读取都已移除）。
- **页型判据只有一处（2026-10-23 起，务必遵守）**：`src/utils/page-type.ts` 是页型判定的**唯一实现**，`utils/common.ts#detectivePageType`（决定加载哪个页面模块）与 `shared/element-selectors.ts#getCurrentPageType`（决定选择器页型门控）都从它取判据。此前两处各判一次且口径不一致，会出现「模块加载了但选择器被当成别的页型跳过」的半残状态。判据的正则在 `src/shared/regexps.ts` 的 `common` 组（`videoPath` / `bangumiPath` / `listPath` / `activityVideoPath`），**必须在调用时读 `regexps.common.xxx`**（不能在模块加载时解构缓存，否则热更覆盖不生效）。**B 站新增活动视频页路径时，改服务器上的 `hot-config/regexps.js` 覆盖 `common.activityVideoPath` 即可，不必等发版**（2026-10-23 修的就是这个：`/festival/xxx?bvid=BVxxx` 这类内嵌标准播放器的活动页，此前判型落到 `other`，视频模块根本不加载，脚本完全不生效）。
  - 依赖方向注意：`shared/regexps.ts` 依赖 `utils/text.ts`（叶子模块），**不要**让 `utils/common.ts` 再反向依赖 regexps —— 2026-10-23 已把 `getTotalSecondsFromTimeString` / `generateMentionUserLinks` 拆到 `src/utils/text.ts` 来避开 `common → regexps → common` 的环。
  - 判型放宽的副作用已兜住：`video.module.ts` 在页面没有播放器时会自动解除 `body{overflow:hidden}` 滚动锁（否则「是播放页但没播放器」的页面会整页卡死滚不动）。
- **TypeScript 迁移（阶段 0 起）**：可迁移，类型只作用于源码期（`.ts` 入口与 `.js` 入口产物**逐字节相同**，已实测），产物链路与各项产物级红线（禁 mangle.properties、SystemJS 命名导出桥、Vue 懒加载、体积门禁）不受影响。基建：`tsconfig.json`（`allowJs` + `checkJs: false`，`.js`/`.ts` 并存）、`src/types/global.d.ts`（`window.__INITIAL_STATE__`、`window.__TemplateRegistry__`、`unsafeWindow`、`import.meta.env` 全局补丁）；命令 `npm run typecheck`（`vue-tsc --noEmit`，已接入 CI 的 build 步骤之前）。迁移期硬约束：**禁 `enum`/`namespace`/构造函数参数属性**（esbuild 与 Node 的类型剥离都不做类型转换，且 `enum` 会产出 IIFE 运行时代码，实测 `enum` → `var Probe = ((Probe2) => {...})(Probe || {})`，而 `as const` 零运行时开销），统一用 `as const`；`tsconfig` 的 `target` 保持 `ESNext`，语法降级只交给 terser（`ecma: 5`）；不引入 `ts-node`/`tsx`（Node 22.18+ 原生剥离类型，`test/hooks.js` 已按 `.js` → `.ts` 顺序补全省略扩展名的导入）；`.ts`/`.d.ts` 同样受源码风格约束（`no-multiple-empty-lines` 的 `max: 0`，即不写空行）与主题红线（`scripts/check-theme-colors.py` 已覆盖 `.js/.ts/.vue`）。阶段 1（8 个 SFC 加 `lang="ts"` + props/emits 类型化）已完成，typecheck 从 207 → 0 个错误；注意：类型化 `defineProps` 会把 interface 类型推断为 `type: null`（Vue 的 prop 校验仅 dev 构建生效，生产产物行为不变）。**迁移已完成（阶段 0–5）**：全仓 92 个 `.ts`、0 个业务 `.js`；`tsconfig` 为 `allowJs: true` + `checkJs: true`（`allowJs` 不能关，因为 `src/shared/styles/*`、`src/shared/templates/*` 是纯字符串常量模块、永久保持 `.js` 且被 `.ts` 静态导入）。新增代码一律写 `.ts`；改动模板模块时注意它们也在 `checkJs` 范围内（插值函数的参数需 JSDoc 标注）。阶段路径（1 SFC → 2 shared/utils → 3 services → 4 modules/core/main → 5 收尾）与实测阻力（`catch (error)` 变量在 `strict` 下为 `unknown`，全仓 86 处；`unknown` 沿数据结构传播；`module-system.js` 的 `Object.create` 动态实例化）见 `docs/typescript-migration.md`。
