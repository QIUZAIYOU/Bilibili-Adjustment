# Bilibili-Adjustment v3.31.0 专业分析与优化建议报告

> 审计对象：`QIUZAIYOU/Bilibili-Adjustment` main 分支，README 标注版本 `v3.31.0`，最后更新 `09.09 17:15`。  
> 审计方式：静态阅读 README、`package.json`、`vite.config.js`、源码树与关键文件；未运行真实浏览器基准，性能建议以“可验证指标 + 构建/架构门禁”方式给出。  
> 输出日期：2026-09-10

---

## 0. 总结论

`v3.31.0` 是一次质量很高的架构收敛：跳过片段管理已经完成“命令式字符串模板 → Vue SFC island + pure/service 分层”的迁移，`ad-skip.js` 从 monolith 收敛到约 14.5KB；迁移文档明确记录 `ad-skip.js` 由 1500+ 行降至约 300 行，并把 Vue 深层响应式导致栈爆、脚本管理器沙盒、弹窗 padding 归属、清理时机等关键坑沉淀为工程规则。

但当前版本也引入/保留了一个高优先级性能风险：**Vue 运行时有较高概率提前进入主 chunk 或视频 chunk**。

- `main.js` 顶层静态导入 `openVueSampleDialog`，而该模块本身又静态导入 `createApp` 与 `SampleDialog.vue`。生产环境即使只为 DEV 探针和快捷键服务，也会把 Vue 拉进主链路。
- `ad-skip.js` 静态导入 `createApp` 与两个跳过片段面板，导致打开“跳过片段管理”前 Vue 已随视频模块加载。

最终路线：**核心播放器/Shadow DOM/存储/事件/选择器保持 Vanilla；设置弹窗、历史记录、跳过片段、UP 空间、更新通知做 Vue island；但必须把所有 Vue 入口改成真正 on-demand dynamic import，并建立 bundle budget 与运行时性能护栏。**

一句话：**Vue 不应该出现在首屏关键路径上。**

---

## 1. v3.31.0 相对 v3.30.0 的关键变化

### 1.1 已完成且应保留的改进

| 方向 | v3.31.0 状态 | 评价 |
|---|---|---|
| Vue 基建 | `dependencies` 已含 `vue`，devDependencies 已含 `@vitejs/plugin-vue`，Vite 已接入 `vue()` | 方向正确，但入口必须 lazy，否则收益被体积抵消 |
| 跳过片段管理 | `SkipManagerMainPanel.vue` / `BangumiSkipManager.vue` + `pure.js` + `skip-manager-service.js`；`openAdjustmentDialog content` 返回 cleanup 并 `app.unmount()` | 已是最接近可复用模板的 island 架构 |
| 纯逻辑单测 | `test/skip-manager-pure.test.js`、`skip-manager-service.test.js` 存在；`package.json` 有 node test 脚本 | 继续扩大到配置、事件总线、广告片段匹配、评论格式化 |
| 响应式陷阱治理 | 文档要求 API 大对象只取最小字段；仍不够时采用“普通结构 + tick 版本号”，避免 Proxy 数组迭代递归 | 这是本项目 Vue 化最重要的红线，应写进组件 lint/review checklist |
| 通用 composable | `useConfig` / `useEvent` / `useCurrentTheme` 桥接 ConfigService/eventBus/ThemeManager，并统一 `onScopeDispose` 清理 | 很好；下一步处理首次 loading、默认值写入副作用与作用域边界 |
| 自绘下拉 | 原生 select 保留为“数据与事件中枢”，视觉层复用 change 事件链 | 对未迁移设置面板是正确过渡桥；迁入 Vue 后应替换为真正 listbox + Floating UI |
| 弹窗宿主 | `openAdjustmentDialog` 支持 keepAlive、单例 key、content cleanup、真实 DOM 遮罩与 top-layer popover | 可作为后续所有 Vue island 的统一宿主；下一步补 focus trap / aria-modal / return focus |

### 1.2 仍需正视的结构性问题

剩余 UI 候选矩阵已经比较清醒：设置弹窗标记为“大/高”，建议 schema→Vue 逐区重写；首页历史弹窗决策为“维持现状”；评论区简介函数化已完成；字幕开关与侧边按钮为小型内联函数化。

源码状态与文档一致：`settings-config.js` 已是 schema 驱动，但渲染仍依赖 `settings-component-v2` 的命令式绑定；`DynamicSettingsForm.vue` 试点存在，而 `dynamic.module.js` 当前仍实例化 `SettingsComponentV2`，未见 Vue 表单接入点，容易形成“试点文件 + 旧实现”双漂移。

---

## 2. 领域评分

| 领域 | 评分 | 判断 |
|---|---:|---|
| 架构分层 | 8.5/10 | pure/service/Vue island/命令式核心已成型；扣分在 Vue 入口未 lazy、设置弹窗仍是高风险遗留区 |
| 性能 | 6.5/10 | 选择器负缓存、readyState 轮询兜底、IndexedDB idle close、配置 BroadcastChannel 都有；但主链路仍有静态 Vue、逐键 IndexedDB、默认配置写库、`timeupdate` 匹配脆弱 |
| 交互/可访问性 | 7/10 | popover 统一、真实遮罩、自绘下拉 ARIA 思路好；缺系统 focus trap、aria-modal、return focus、键盘 typeahead、Overlay 焦点管理 |
| 可测试性 | 8/10 | Node 单测、主题/片段纯函数测试已成体系；缺 e2e、bundle size CI、运行时性能回归 |
| 安全/隐私 | 7.5/10 | API Key 本地、广告缓存 uid 仅归属/防误改说明清楚；共享缓存仍需服务端锁定、版本、签名/限流与负缓存策略复核 |
| 工程治理 | 8/10 | 迁移文档、等价矩阵、check:colors、lint/test/build 齐备；需把“迁移红线”转成自动化门禁 |

---

## 3. P0 必修问题

### P0-1 Vue 进入关键路径：静态 import 必须改为 on-demand

当前 `main.js` 为了 DEV 探针和 `Ctrl+Shift+Alt+V` 快捷键静态引入 `openVueSampleDialog`，而 `src/ui/vue-sample/index.js` 又静态 `createApp` 并 import SFC。结果是：**生产主 bundle 为几乎不用的探针支付 Vue runtime 成本**。同时 `ad-skip.js` 顶层静态 import Vue 与两个管理面板，导致“只看视频、不打开片段管理”也加载 Vue。

建议：

```js
// main.js：删除顶层 import openVueSampleDialog
const openVueSampleDialog = async () => {
    const mod = await import('@/ui/vue-sample')
    return mod.openVueSampleDialog()
}
if (import.meta.env.DEV) setTimeout(() => { openVueSampleDialog() }, 2500)
window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        openVueSampleDialog()
    }
})
```

```js
// ad-skip.js showSkipSegmentManager 内 lazy
const [{ createApp }, Panel] = await Promise.all([
    import('vue'),
    import(isBangumi
        ? './skip-manager/BangumiSkipManager.vue'
        : './skip-manager/SkipManagerMainPanel.vue')
])
```

验收指标：生产构建中，首页/动态页主 chunk 不含 Vue runtime；视频页在未打开跳过片段管理前不请求 Vue chunk；打开管理弹窗时 Vue chunk 懒加载且关闭后无 detached Vue app。

### P0-2 广告跳过匹配算法脆弱：`Math.floor(currentTime) === start` 不可靠

`autoSkipAdvertisementSegments` 用 `Math.floor(video.currentTime)` 与整数 `start/end` 做等值/区间判断；会遇到三类问题：开始时刻为小数或 seek 落在 `start+0.2s` 时被错过；用户拖回已处理片段后，因 `processedSegments` 已记录而不再跳；只在 `currentTime === start` 的瞬间触发，帧率、回放倍速、丢帧都会放大漏跳。

建议改为“窗口 + 单调状态 + 可回跳重置”的匹配器，并抽出纯函数到 `pure.js` 单测：

```js
const EPS = 0.25
let lastSkippedKey = null
let lastSkippedEnd = -1

const inSegment = (t, s) => t + EPS >= s.start && t < s.end
const handleTimeUpdate = () => {
    const t = video.currentTime
    // 用户拖回广告前，允许重新触发
    if (lastSkippedEnd >= 0 && t < lastSkippedEnd - 1) {
        lastSkippedKey = null
        lastSkippedEnd = -1
    }
    const seg = sortedSegments.find(s => inSegment(t, s) && `${s.start}-${s.end}` !== lastSkippedKey)
    if (seg) {
        video.currentTime = seg.end
        lastSkippedKey = `${seg.start}-${seg.end}`
        lastSkippedEnd = seg.end
    }
    if (sortedSegments.length && t > sortedSegments[sortedSegments.length - 1].end) {
        video.removeEventListener('timeupdate', handleTimeUpdate)
    }
}
```

验收：构造 `start=12.3/end=18.7`、`currentTime=12.0/12.4/17.9/19.0`、seek back into segment 的用例全部通过；不再依赖整数秒等值。

### P0-3 配置/存储仍是“每键 await + 默认读侧写库”

v3.31 已给 `ConfigService` 加 `#cache`、BroadcastChannel、迁移逻辑，这是进步；但 `getValue()` 在存储缺失时仍会 `setValue(name, defaultValue)`，即**读配置可能产生写 IndexedDB 副作用**；`initializeDefaults()` 仍逐项检查并写默认；`storageService.batchSet()` 仍是 for 循环逐条 `await db.update()`，不是单事务批量 put。

建议：

- `getValue()` 只读：缓存 → IndexedDB → DEFAULT_VALUES，不写库；是否持久化默认项交给一次性 `initializeDefaults()` 或干脆不持久化默认值。
- 用户显式 `setValue()` 才写；新增配置项通过 schema 默认值在内存覆盖，不把默认值灌入用户存储，避免配置膨胀和首次读延迟。
- `batchSet` 改单事务：

```js
const tx = db.transaction('keyval', 'readwrite')
const store = tx.objectStore('keyval')
for (const { key, value } of configsArray) store.put({ key, value, timestamp: Date.now() })
await new Promise((res, rej) => {
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
})
```

验收：冷启动不再因读取未持久化配置项产生 N 次 put；`initializeDefaults` 从 O(n) 次 IndexedDB 往返降为 ≤1–2 次事务；`getValue` 单测断言“未持久化默认值不写库”。

### P0-4 设置弹窗是下一个高风险区，但必须“ schema 驱动 + 分区等价迁移”

不建议一次性重写 `settings-component-v2`。正确切法是把 `settings-config.js` 作为唯一事实源，按 `category/section/children/visible` 生成 Vue 控件；自绘下拉、验证按钮、刷新模型、tooltip、跨标签同步、主题变量先做等价矩阵，再逐区替换。`visible: configs => configs.selected_player_mode === 'web'` 这类函数依赖、`children` 联动、`dependsOn`、动态模型列表、`hasValidateButton/hasRefreshButton` 都是迁移时最容易行为漂移的点。

建议批次：

1. 控件原语：`AdjCheckbox / AdjInput / AdjSelect / AdjRadio / AdjSection`，先渲染动态页单个 input 试点，并与 `DynamicSettingsForm.vue` 对齐：要么正式接入，要么删除试点，避免双实现。
2. 基础设置区：含 `visible` children 与 offset 数字校验。
3. AI 区：provider/custom model、Key password、模型动态加载、验证/刷新按钮；这块交互最重，单独成批。
4. 更新/日志区：低 risk，收尾。
5. 跨标签同步：`useConfig` 已具备，补 `loading/error` 与首次未就绪骨架。

验收：对每个设置项建立“默认值 → 渲染 → change → ConfigService.set → config:changed → 跨标签同步 → visible 重算 → 主题变量 → 刷新页面持久”的用例；`check:colors` 断言 `.vue` 内无色值字面量。

### P0-5 更新检查不要阻塞 APP_READY

`initializeApp()` 在 `moduleSystem.init()` 与 `APP_READY` 之后 `await updateService.checkForUpdates(...)`，虽然不在模块初始化前，但仍属于启动完成后的 awaited 网络段；如果检查更新代理/raw 源慢，会影响后续初始化尾部日志与用户可感知状态。

建议：更新检查移出 `initializeApp` 的主 promise 链，改为 `requestIdleCallback` / `setTimeout(..., 3000+)`，并用上次检查时间 + `update_check_frequency` 做跨会话门控；失败只 warn，不进入 error 链路；遵守用户 `skip_update_check/auto_check_update`。核心模块 `APP_READY` 不应等待网络更新检查完成。

---

## 4. P1 性能与效率优化

### 4.1 事件总线：注册排序可接受，emit 串行需防头阻塞

`eventBus.on()` 每次 push 后 sort，`emit()` 对 handler 串行 await；handler 抛错又会 `emit('error')`。低频场景问题不大，但 `APP_READY`、`CONFIG_CHANGED`、播放器模式事件后续会变多。

建议：保留 priority，但注册时按 priority 插入而不是每次 sort；`emit` 对无先后依赖的 handler 用 `Promise.allSettled`；给 `error` 事件加 depth guard；为 `APP_READY/SYSTEM_INIT_SUCCESS` 输出 duration metric。不要做全局并行化导致顺序敏感功能漂移，先标记可并行事件白名单。

### 4.2 模块系统初始化指标：`init()` 已测 duration，应接到 Performance API

`moduleSystem.init()` 已 `await ConfigService.initializeDefaults()` 并记录耗时，这是很好的埋点位置。建议把已有日志升级为 `performance.mark/measure`：

- `adj:config:init`
- `adj:module:init:<name>`
- `adj:app:ready`
- `adj:video:ready`
- `adj:settings:open`
- `adj:skip:identify`

开发模式输出，生产只保留 measure，不打日志。所有优化先建立 baseline，再谈收益。

### 4.3 评论/简介：观察器已防重，但仍要限域、限量、去 innerHTML

`doSomethingToCommentElements()` 现在会清理上一轮观察器，且 `formatCommentContents()` 用 `bilibili-adjustment-element` 防重复链接化，这是对的。但简介插入有 40×250ms 渲染确认、15s fallback、survival observer、duplicate observer、watchdog 多重机制，复杂度很高；建议抽 `description-inserter` service，用 runToken + 单一状态机表达 `idle/wait-page/replace-desc/wait-feed/inserted/survival`，避免散落的 timeout/observer。

评论格式化建议优先改文本节点/片段级替换，而不是整段 `innerHTML`；若继续用 innerHTML，必须保证 `formatVideoCommentContents` 纯函数输出经 `escapeHtml` 白名单校验，并补 XSS 单测。

### 4.4 动态页侧边按钮重试：从 sleep loop 改为条件等待

动态页 `insertSidebarButtons()` 是“立即一次 → wait 4s → 6 次 sleep(1000)”的轮询；可用但粗放。建议统一用 `elementSelectors.wait('dynamicSidebar', timeout)` + MutationObserver / SPA route signal；失败降级为侧边按钮缺失日志，不做长轮询。

### 4.5 Bundle 与依赖治理

- `main.js` 仍 `import _ from 'lodash'` 并挂 `window._ = _`；`ai.service.js` 用 axios；依赖里仍有 md5。lodash 完整引入与 axios 在用户脚本里偏重。建议：`lodash-es` 按需或自写 debounce/throttle/get；axios 换 fetch wrapper，统一 timeout/AbortController/429/5xx backoff；`window._` 不建议暴露，命名冲突且会污染页面。
- `package.json` license 是 MIT，userscript meta 是 GPL-3.0，建议统一，避免分发歧义。
- 混淆继续保留 string/selfDefending，但建议 release 分级：dev 关闭；prod 关闭 `debugProtectionInterval`、降低 controlFlow/deadCode 阈值；CI 输出 obfuscation 前后体积与运行 smoke 结果。

### 4.6 AI 服务健壮性

当前 OpenAI adapter 已把广告识别 timeout 放宽到 120s，网络/超时失败自动重试一次；这对降低偶发失败有效，但交互上“重新识别”仍可能长时间挂起。

建议：

- UI 层识别按钮显示进度态与可取消 AbortController；120s 是网络硬上限，另设用户可感知软上限如 45–60s 后可取消重试。
- 请求体加 `max_tokens`、温度固定、输出 JSON schema/strict 模式（provider 支持时），减少解析失败。
- 结果经 `validateSegment/mergeSegments` 后再上传；空结果也缓存负例，避免同一无广告视频反复消耗 token。
- `verified_by/uploader_uid/locked/version` 已有雏形，建议服务端补：编辑冲突检测（version 不匹配拒绝）、锁定不可绕过、同 bvid 并发写队列、uid 脱敏日志、负缓存 TTL。

---

## 5. 交互体验与可访问性

当前弹窗组件基于原生 `popover=manual`，同 key 单例、keepAlive、真实 DOM 遮罩和关闭即销毁已经统一；这是正确基座。建议下一步做一个 `useDialogA11y(dialog)`：

- 打开时 `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 指向标题；
- 初始焦点进入第一个可交互元素或内容区，关闭后 return focus 到触发按钮；
- Tab/Shift+Tab 焦点陷阱，Esc 关闭，嵌套弹窗用 focus stack；
- 弹窗打开时锁 body scroll，关闭恢复，处理多个弹窗引用计数；
- 所有 `z-index: 2147483000` 改为 `--adj-z-overlay` token，避免魔法数；
- `custom-select` 已具备 combobox/listbox/aria-selected/键盘导航基础，继续补 `aria-activedescendant`、typeahead、disabled option 跳过、`Home/End/PageUp/PageDown`，并把 `DOMNodeRemoved` 换成 MutationObserver `childList`（`DOMNodeRemoved` 已废弃且性能差）。

设置弹窗迁移到 Vue 后，不要再保留“隐藏原生 select 作为中枢”的长期双轨；过渡期内可保留，长期应让 Vue select 组件直接读写 ConfigService，并保留旧原生 select 仅为无障碍 fallback 的可选模式。

---

## 6. Vue 框架重构的专业边界

建议明确写成团队约束：

- **不 Vue 化**：自动定位、屏幕模式、网页全屏解锁、画质/音质、播放器右键旋转、评论 Shadow DOM 注入、选集解锁。这些强依赖 B 站播放器时序、DOM 结构、Shadow root 与 SPA 生命周期，Vue 的收益低、排错成本高。
- **Vue 化**：设置弹窗、跳过片段管理（已完成）、历史记录弹窗（若未来加复杂筛选/批量/虚拟滚动）、UP 空间弹窗外壳、更新说明弹窗、广告片段批量编辑。
- **数据规则**：接口对象只取最小字段；大列表普通数组 + tick 或 `shallowRef`；绝不把 storage/API 原始对象再包一层 reactive；每个 mutation 后 bump 集中在少数 action 内。
- **宿主规则**：所有弹窗统一 `openAdjustmentDialog`，`content(body)` 返回 cleanup；Vue app 在 cleanup unmount；keepAlive 路径也必须可销毁。
- **样式规则**：`.vue` 只允许 `var(--adj-*)` 与布局属性；`check:colors` 进 CI；任何内容区先确认 padding 归属，避免贴边。

不建议引入 Pinia/大型组件库作为默认。userscript 场景更适合 Vue 3 runtime + composables；仅当设置弹窗状态机继续膨胀，再在设置 island chunk 内引入一个极小 store，而不是全局状态层。

---

## 7. 推荐实施路线图

### Sprint 0：基线与门禁，1–2 天

- 产出 build stats：主 chunk、视频 chunk、Vue chunk 的 raw/gzip；CI 加 size budget（相对上版不允许回退）。
- 加 `performance.mark/measure`；dev 模式输出模块耗时。
- 建立 ad-skip matcher、config default、eventBus、comment formatter 单测骨架。
- 验收：任何 PR 能回答“这次改动让哪个 chunk 变大/变慢”。

### Sprint A：P0 止血，3–5 天

- Vue sample/probe/ad-skip 全改 dynamic import；验收生产主 chunk 无 Vue。
- 重写广告片段匹配器并抽 pure 单测。
- ConfigService 去“读侧写默认”；storage `batchSet` 单事务；广告/剧集批量更新走批量事务。
- 更新检查移出 APP_READY 关键链。
- 验收：冷启动 IndexedDB 写次数显著下降；未打开管理弹窗不加载 Vue；广告片段边界用例通过。

### Sprint B：设置弹窗 Vue 化，2–4 周

- 控件原语 + 动态页试点接入/删除；基础区、AI 区、更新/日志区分批迁移；每批等价矩阵 + 真机对照。
- 同步改造 `useConfig`：补 loading/error、默认值不写库、BroadcastChannel 去重。
- 验收：所有设置项行为对照表通过；`check:colors` 无色值字面量；设置打开/关闭 50 次无 detached DOM；跨标签同步延迟 <100ms。

### Sprint C：体验与质量，持续

- `useDialogA11y` focus trap/aria/scroll lock；custom select 补 typeahead 与废弃事件替换。
- Playwright e2e：首页/普通视频/番剧/动态四条路径；打开设置、跳过片段、切 P、切主题、跨标签改设置。
- AI：AbortController 可取消、负缓存、服务端 version/lock 冲突检测。
- 文档：把 `vue-migration-lessons.md` 的红线转为 PR checklist 与 CI 检查项。

---

## 8. 关键验收 KPI

- 构建：生产主 chunk 不含 Vue runtime；视频页未打开片段管理不请求 Vue chunk；相对 v3.31.0 基线首屏关键 chunk gzip 不增，目标下降 ≥5–10%。
- 启动：`APP_READY` 不等待更新检查；冷启动默认配置不写库；首次 `ConfigService.getValue` 不产生 put 副作用。
- 跳过片段：`start/end` 小数边界、seek back、倍速/丢帧模拟下不漏跳、不错跳；`timeupdate` listener 在最后一个片段结束后移除。
- 内存：设置弹窗、跳过管理、UP 空间反复打开 50 次，`performance.memory` 无持续增长，detached Vue app 为 0。
- 交互：弹窗打开后 Tab 循环不逃逸；Esc 关闭并归还焦点；自定义下拉支持键盘与 typeahead；无贴边、无遮罩穿透、无 top-layer 层级错乱。
- AI：识别可取消；无字幕/空结果负缓存；服务端 version 冲突与 locked 权限测试通过。

---

## 9. 最终判断

`v3.31.0` 已经证明这个仓库适合“**Vanilla 核心 + Vue island**”路线，而不是全量框架重写；跳过片段迁移的成功说明团队有能力处理等价迁移、响应式陷阱和沙盒差异。下一阶段的胜负手不在“是否更多 Vue”，而在**严格把 Vue 限制在用户主动打开的 UI 岛内**，同时修掉三个会侵蚀体验的地基问题：Vue 静态进入关键路径、广告跳过匹配脆弱、配置存储默认写/逐键 IO。把这三点收掉后，再迁设置弹窗，项目的性能上限和可维护性会同时上一个台阶。
