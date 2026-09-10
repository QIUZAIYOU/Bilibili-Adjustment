# Bilibili-Adjustment v3.32.0 最终分析与优化建议报告

> 审计对象：`QIUZAIYOU/Bilibili-Adjustment` main 分支 `v3.32.0`。  
> 审计方式：静态阅读 README、`package.json`、`vite.config.js`、源码树、迁移文档、性能护栏文档与关键实现文件；未运行真实浏览器基准，性能建议以“可验证指标 + 构建/架构门禁”方式给出。  
> 输出日期：2026-09-11

---

## 0. 总结论

`v3.32.0` 已经把上一轮报告中的大部分 P0/P1 真正落到了代码和门禁里，尤其是：更新检查退出关键路径、Vue 同源懒加载、IndexedDB 单事务批量读写、配置读侧不写库、事件总线优先级插入 + 白名单并行 + error 深度防护、跳过片段 matcher 纯函数化、设置/历史/更新通知 Vue island 化、`dialog-a11y` 焦点管理、自绘下拉废弃事件替换、`lodash/axios` 移除。

当前项目可以正式定义为：

> **Vanilla 核心服务层 + 页面模块命令式生命周期 + Vue SFC UI island + 统一 popover/a11y 宿主 + 性能/体积/测试护栏。**

推荐继续保持该路线，不要再讨论“是否全面 Vue 化”。下一阶段的核心不是“加框架”，而是五件事：

1. **清理迁移后的命名与死代码**：`settings-component-v2` / `settings-renderer` 已经事实成为“Vue 设置宿主 + 弹窗壳渲染器”，名字和遗留 fallback 分支会误导后续维护。
2. **把 settings 弹窗也纳入统一 dialog/a11y 体系**：通用 `openAdjustmentDialog` 已接入 `applyDialogA11y`，但设置弹窗仍走自管理 popover 逻辑。
3. **收敛“双轨 UI”残余**：Vue 面板内仍渲染原生 select，再由 Vanilla `custom-select` 增强；短期可用，长期应沉淀为 Vue `AdjSelect`。
4. **B 站 API 全局 300ms 串行队列需要分级**：防 429 是对的，但所有 API 一视同仁排队会拖慢简介、字幕、AI 识别等用户可感知链路。
5. **把人工真机验收升级为自动化 e2e**：性能护栏已有 lint/test/check:colors/build/stats，但真机验收仍偏人工。

必须修正一个预期：**vite-plugin-monkey 单文件产物下，Vue 懒加载主要是执行边界，不是网络/bundle 边界**。用户脚本为单文件产物，无法按 chunk 拆体积；Vue 收益体现在“未打开 UI 前不初始化 Vue”，而非产物体积下降。因此后续 KPI 不应承诺“主 chunk 不含 Vue”，而应承诺“未打开设置/片段管理/历史/更新通知时不初始化 Vue 应用、不挂载 SFC、不触发响应式副作用”。

---

## 1. v3.32.0 已关闭的关键问题

| 原问题 | v3.32.0 状态 | 评价 |
|---|---|---|
| 更新检查阻塞启动 | 已改为 `requestIdleCallback` / 3s 兜底，失败只 warn，且注释明确“不阻塞 APP_READY” | `main.js` 的 `scheduleUpdateCheck` 与 `initializeApp` 已分离，APP_READY 后才调度更新检查 |
| Vue 静态进入关键路径 | 设置/历史/更新/跳过片段均走 `lazy-panel.js` 同源懒加载桥；跳过片段在弹窗 content 内 `import('./skip-manager/lazy-panels')` | 桥模块注释明确禁止静态 import，并解释 `import('vue')` 与 SFC runtime 可能双实例 |
| 设置面板命令式高风险区 | `SettingsPanelV3.vue` + `SettingItemV3.vue` schema 驱动，DOM/class/id 与旧实现等价；`settings-renderer` 退化为壳渲染器 | `SettingItemV3` 明确 wrapper display、children 容器位置、`ValidateXxx/RefreshXxx` id、`MAX_DEPTH` 防递归等契约 |
| IndexedDB 逐键事务 | `batchUpdate/batchGet` 单事务；`storageService.userBatchSet/userBatchGet` 已封装；`ConfigService.initializeDefaults` 单事务读默认键、缺失项批量写 | 这是本轮最关键的 IO 修复之一 |
| 配置读侧写默认 | `getValue` 缺失时只缓存默认并返回，不写库；显式 `setValue/setValues` 才写，且 `setValues` 一次事务 + 一次跨标签广播 | 已符合“默认值内存覆盖、用户覆盖持久化”的原则 |
| 广告跳过整数等值脆弱 | `createSkipMatcher` 抽 pure，`ad-skip.js` 内以窗口匹配、结束移除监听；归一 `sanitizeSegments` 后再缓存/上传/应用 | 识别、缓存、上传、跳过已统一经过归一链路 |
| 事件总线注册即排序/串行头阻塞 | `on` 按 priority 插入；`app:ready/logger:show` 白名单 `allSettled` 并行；`error` 嵌套深度上限 3 | 顺序敏感事件保持串行，低风险事件并行，设计克制 |
| 弹窗可访问性 | 新增 `dialog-a11y`：role/aria-modal/aria-labelledby、focus trap、Esc、body scroll lock、return focus；通用弹窗已接入 | 该实现不依赖 Vue，可同时服务命令式组件和 SFC island，是正确抽象 |
| 自绘下拉废弃事件/性能 | `DOMNodeRemoved` 已替换为父节点 `childList` MutationObserver；菜单键盘导航、aria-selected、翻转/折行、外部清理均已完善 | 过渡方案成熟；建议下一步组件化 |
| axios/lodash 依赖治理 | `ai.service` 改走 `utils/http`；项目内 debounce/throttle/pick/reduce/snakeCase/camelCase/chunk 由 `lodash-lite` 提供；`bili-apis` 仅保留 `md5` 用于 WBI | 依赖面已显著收敛；`httpRequest` 保留 axios 风格错误形状，降低迁移风险 |
| AI 可取消与生成收紧 | `cancelAIRequest` + `AbortController`；`temperature:0.1`、`max_tokens:2048`；网络/超时自动重试一次；非网络错误不重试 | 识别链路开始具备用户可控性和成本护栏 |

---

## 2. 当前领域评分

| 领域 | v3.31 评分 | v3.32 评分 | 变化说明 |
|---|---:|---:|---|
| 架构分层 | 8.5 | 9.0 | pure/service/Vue island/a11y/perf/http/lodash-lite 分层已清晰；扣分在遗留命名和 select 双轨 |
| 性能 | 6.5 | 8.7 | 冷启动 IO、事件分发、AI 取消、更新检查、B 站请求重试/缓存均有实质修复；剩余主要是单文件 parse 成本、API 队列粒度、少量 sleep/poll |
| 交互/可访问性 | 7.0 | 8.8 | 通用弹窗 focus trap/aria/scroll lock/return focus 已落地；设置弹窗尚未复用同一体系 |
| 可测试性 | 8.0 | 8.7 | 已有 config-defaults/skip-matcher/event-bus 等关键单测方向与 guardrails；仍缺 Playwright e2e |
| 安全/隐私 | 7.5 | 8.0 | Key 本地、锁定/uid/version 语义、共享缓存归一均在；远程缓存写接口仍建议补签名/限流/负缓存策略 |
| 工程治理 | 8.0 | 9.2 | `build-stats` 基线、`perf` mark/measure、迁移红线文档、同源懒加载桥、颜色检查已经工程化 |

---

## 3. 仍需优先处理的问题

### P0-1 修正 Vue 懒加载的验证口径：单文件产物下，不承诺“chunk 分离”

当前所有 Vue island 的正确口径应是：

- **能做到**：未打开设置/历史/更新通知/片段管理前，不 `createApp`、不 mount SFC、不建响应式代理、不跑面板 setup。
- **不能夸大**：单文件 userscript 无法像站点前端那样把 Vue vendor 真正拆成独立网络 chunk；文件一旦被脚本管理器注入，整段脚本仍需解析。

建议把 KPI 改为：

```txt
未打开任何 Vue UI 时：
  - Vue createApp 调用次数 = 0
  - SettingsPanelV3/HomeHistoryPanel/UpdateNotice/SkipManager SFC mount 次数 = 0
  - adj:skip:manager:open / adj:vue:probe:load / settings panel perf 不出现

打开 UI 时：
  - 首次 mount 耗时纳入 adj:* 埋点
  - 关闭后 unmount 执行且 detached Vue app = 0
```

### P0-2 设置弹窗未复用统一 `applyDialogA11y`

通用 `openAdjustmentDialog` 已经接入 `applyDialogA11y(root, { labelledBy, onEscape })`，但设置弹窗仍在 `settings-component-v2` 内自管理：`enablePopoverLightDismiss`、手动 `app.style.pointerEvents = 'none'`、关闭后 `destroyTooltip/unmountVuePanel/popover.remove()`。

这会带来三类不一致：

- 设置弹窗没有 `role="dialog"` / `aria-modal="true"` / `aria-labelledby`；
- 焦点不进入设置面板，Tab 可能逃逸到页面；
- body scroll lock / scrollbar 补偿 / return focus 与通用弹窗行为不一致。

建议：把设置弹窗迁入 `openAdjustmentDialog` 的同类生命周期，或抽一个 `useSettingsPopoverA11y(popover)` 复用 `applyDialogA11y`。因为设置面板不是简单 content，而是“壳 + Vue mount + custom-select + tooltip + import/export + version check”，可以在 `openAdjustmentDialog` 上扩展 `onOpen/onClose/contentCleanup` 已具备的能力，不要另起第三套弹窗体系。

### P0-3 清理迁移死代码与误导性命名

当前事实已经是：旧命令式表单渲染器删除，`SettingsRenderer` 只渲染弹窗壳；表单由 `SettingsPanelV3` 渲染；`settings-config.js` 中也不再有 `settings_panel` 切换项。

但 `settings-component-v2.js` 仍保留：

- `usesVuePanel()` 与 `settings_panel === 'v2'` 的回退语义；
- `if (!this._vueBridge) { bindConfigChangeEvents/bindSpecialButtonEvents }`；
- `syncConfigControl/refreshVisibility` 里大量经典模式 DOM 分支；
- `DynamicSettingsForm.vue` 仍出现在源码树中，而动态页设置实际已由通用 `SettingsPanelV3` 按 `dynamicSettingsConfig` 渲染。

建议：删除 `usesVuePanel` 与 v2 fallback；把 `SettingsComponentV2` 改名为 `SettingsDialogHost` 或 `SettingsPopoverHost`，`SettingsRenderer` 改名为 `SettingsPopoverShellRenderer`；删除未接入的 `DynamicSettingsForm.vue` 或明确标注为实验页并加 CI 引用检查。否则半年后必然有人误以为“还能切回 v2”，重新引入双实现。

### P1-4 B 站 API 全局 300ms 串行队列过粗

`bili-apis` 把所有请求 `_enqueueRequest` 全局排队，且每次间隔固定 300ms；`_fetchWithRetry` 对 429/timeout 做指数退避，视频信息有 5 分钟去重缓存，这些都不错。

但队列不区分请求性质：评论/简介插入、字幕拉取给 AI、UP 主空间信息、直播状态、动态列表，都被同一根 300ms 节拍器串行化。用户在播放页切换选集时，简介插入和字幕识别可能被非关键 API 堵住。

建议分级：

```txt
queue.interactive: 简介/评论/选集/字幕，delay 0~50ms，可 AbortSignal 取消
queue.background: UP信息/直播/动态/未读，delay 150~300ms
queue.ai: 广告识别所需字幕，独立优先级，可被 cancelAIRequest 联动取消
```

同时给 `_apiRequest` 增加 `signal` 透传；SPA 切 P/切视频时 Abort 上一个视频的非关键请求；保留视频信息 promise dedupe。

### P1-5 select 双轨：Vue 渲染原生 select + Vanilla custom-select 增强

当前 `SettingItemV3` 在 Vue 内渲染原生 `<select data-config-type="select">`，宿主 mount 后再 `enhanceCustomSelects(popover)` 包一层自绘 trigger/menu。这保留了数据/事件中枢，短期风险低；但长期有两个系统共同管理同一 DOM：Vue patch、custom-select refresh、模型列表异步刷新、tooltip 绑定都在改同一区域。

建议下一个小版本把 `custom-select` 的能力组件化为 `AdjSelect.vue`：

- Vue 内直接渲染 trigger/listbox；
- 内部保留 hidden native select 仅作表单/无障碍 fallback；
- 动态 options 走 props，不再依赖外部 `refreshCustomSelects`；
- 键盘、typeahead、disabled、翻转、折行、aria-activedescendant 收进组件；
- 宿主删除 `enhanceCustomSelects/refreshCustomSelects` 对设置面板的调用。

### P1-6 普通视频页仍有 `sleep(300)` 与 10ms 可见性轮询

`video.module.preFunctions()` 仍有 `await sleep(300)`；普通视频页仍用 `isTabActive({ immediate:true, checkInterval:10, once:true })` 做标签页激活检测，番剧页已改为直接等待 video。

建议：普通视频页与番剧页统一成“`document.visibilityState === 'visible'` 同步快速路径 + `visibilitychange` 一次监听 + `elementSelectors.wait('video', timeout)`”；删除固定 `sleep(300)`。如果保留，必须在 guardrails 里记录 `adj:video:prefunctions` 并给出预算，否则它会继续成为隐性启动税。

### P1-7 共享广告缓存写接口仍建议补安全与幂等

客户端已经做 `sanitizeSegments/createCacheEntry/locked/uploader_uid/version` 语义，且本地/远程 miss 后先归一再上传。但上传仍是无鉴权 `POST SKIP_CACHE_API`；若服务端只按 body 信任 `uploader_uid/locked`，伪造与误锁成本低。建议至少落地：

- 客户端：`uid + timestamp + nonce + HMAC(uid, timestamp, bvid, segmentsHash, secret)`，secret 可由服务端按 uid 派生或脚本内置仅作混淆；
- 服务端：同 bvid 写锁队列、version CAS、locked 不可被非上传者覆盖、负缓存 TTL、同 uid 速率限制；
- 客户端：无字幕/空结果负缓存，避免同一无广告视频反复消耗 token；空结果也要 short-TTL，避免新上传片段长期被负缓存挡住。

---

## 4. 交互体验最终建议

- **统一弹窗体系**：设置弹窗迁移到 `openAdjustmentDialog` 或复用 `applyDialogA11y`，达到“任何弹窗打开后 Tab 不逃逸、Esc 可关、关闭归还焦点、body 不滚、遮罩不穿透”的一致体验。
- **设置面板文案与状态反馈**：API Key 验证/模型刷新已有按钮反馈；建议增加面板级 loading/error 态，例如模型列表加载中、导入配置失败、跨标签同步冲突提示。当前导入失败仍用 `alert()`，建议统一进 dialog。
- **动态页“保存”按钮**：配置已即时保存，保存按钮仅关闭弹窗；文案可改“完成/关闭”，避免用户误以为不点不保存。
- **历史面板大数据**：当前 50 条分页 + IntersectionObserver 已够；若未来记录数上到数千，再引入虚拟列表，不要提前优化。
- **主题/颜色**：继续保持 `.vue` 无色值字面量，`check:colors` 应纳入 CI 必过项。

---

## 5. 工程与测试补强

当前护栏已包含 `build/stats`、`perf` 埋点、关键单测方向与颜色检查。建议补齐最后一块：

1. **Playwright e2e 最小集**：普通视频、番剧、动态、首页四条路径；断言设置弹窗打开/关闭无泄漏、跳过片段管理 mount/unmount、跨标签配置同步、弹窗 Tab 焦点循环。
2. **内存回归**：设置/跳过管理/UP 空间反复打开 50 次，统计 detached Vue app、popovers、MutationObserver、IndexedDB connection。
3. **构建报告**：单文件产物下除 gzip/raw 外，增加“Vue island 初始化计数”测试，而不是只看文件大小。
4. **License 一致性**：若仍未统一 `package.json` 与 userscript meta，建议本版内修复，避免再拖。

---

## 6. 最终路线图

### 已无需再做

- 不要再讨论“是否 Vue 重构”：设置/历史/更新/片段管理已经 Vue island 化，且入口懒加载与同源桥已正确。
- 不要再回到 `Math.floor === start` 的跳过逻辑；继续扩展 `createSkipMatcher` 纯函数测试。
- 不要再逐键 IndexedDB 读写；新增批量场景一律走 `userBatchSet/userBatchGet`。

### 下一版 1–2 周

- 设置弹窗接 `applyDialogA11y` 或统一 `openAdjustmentDialog`。
- 删除 `usesVuePanel/v2 fallback` 死代码；重命名 `settings-component-v2/settings-renderer`；处理 `DynamicSettingsForm.vue`。
- 删除 `video.module` 的 `sleep(300)` 与普通页 10ms poll。
- B 站 API 队列分级 + AbortSignal。

### 下一版 2–4 周

- `AdjSelect.vue` 组件化，移除设置面板对 `enhanceCustomSelects/refreshCustomSelects` 的依赖。
- 共享广告缓存写接口加签名/version CAS/负缓存；服务端锁定权限复核。
- Playwright e2e + 内存回归进 CI。

### 验收 KPI 最终版

- 未打开任何 Vue UI 时：Vue app 创建数 = 0，SFC mount 数 = 0，`adj:vue:*` 不触发。
- 打开设置弹窗：role/aria-modal/aria-labelledby 齐备，Tab 不逃逸，Esc 关闭，焦点归还，body 不滚动。
- 冷启动：默认配置补齐单事务；`getValue` 不产生写库；批量导入/导出走单事务。
- 广告跳过：小数边界、拖回重触发、结束后移除监听全部单测通过；识别可取消；空结果负缓存。
- 构建：`npm run stats` 不回退；`perf` 可回答 APP_READY、update check、skip manager open 的耗时。
- 内存：反复打开/关闭 UI 50 次，无 detached Vue app、无残留 popover、无未 disconnect observer。

---

## 7. 最终判断

`v3.32.0` 已经把上一轮报告里的“骨架问题”基本修完，剩余问题主要是**命名/死代码、统一弹窗 a11y、select 双轨、API 队列粒度、共享缓存安全**这五类“精修项”。完成这些后，这个仓库会从“功能很全的用户脚本”进一步变成“可长期演进、可回归、可交接”的前端工程。
