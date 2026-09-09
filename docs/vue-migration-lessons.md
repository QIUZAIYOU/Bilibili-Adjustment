# 片段管理弹窗 Vue 化 —— 迁移经验教训（优化版）

> 记录「跳过片段管理」弹窗从命令式字符串模板（`getTemplates.replace` + DOM 拼接）迁移到 Vue SFC + 分层模块的经验教训，供后续 UI 迁移参考（设置弹窗、UP 主空间、更新通知、历史记录、评论区简介等）。

---

## 1. 总原则：分阶段推进，每阶段可独立验证

- **P0 基建先行**
  - 引入依赖：`vue` / `@vitejs/plugin-vue`
  - Vite 接入、产物基线（体积 / gzip）
  - 一个最小 `.vue` 全链路探针（含 ScriptCat 等管理器沙盒下的验证入口）
- **P1 抽纯逻辑与服务**
  - 纯函数与缓存读写 → `pure.js`（纯函数单源，Node 可直接单测）
  - 依赖注入的异步编排 → `service.js`
- **P2 视图分层替换**
  - 先做「单集主面板」，再做「番剧多集手风琴」
  - 每批只切一个入口（普通视频 / 番剧分开切），另一路保留旧实现以隔离风险
- **验收方式**
  - 每阶段必跑：`npm test`（含新增单测）、`npx eslint .`、`npm run build`、`check:colors`
  - 真机冒烟由使用者按「功能等价核对表」执行

---

## 2. 对外契约：保持不变，内部分发

- 迁移前后入口名与调用语义不变：`showSkipSegmentManager(bvid)` 仍是唯一公开方法。
- 内部按 `page_type` 分发到普通视频主面板或番剧多集组件。
- **不要在迁移过程中顺手改对外 API**；确需变化时单独评审。

---

## 3. 等价迁移：先穷举矩阵，再动手

- 先通读旧实现，产出「视图分区 × 状态字段 × 动作事件」对照表。
- 逐条核对的等价项（不可遗漏）：
  - 缓存装载（本地 → 远程兜底回写）
  - 手动添加：两种输入模式与校验
  - 追加 / 覆盖（含覆盖子集选择层）
  - 重新识别、锁定 / 解锁
  - 空态与错误态文案、消息（类型 / 自动消失）
  - 按钮显隐与 busy 态、关闭即销毁与 keepAlive 语义
- **旧 bug 处理原则**：单独记录并修复，不静默改变行为，也不带着旧 bug 迁移。
  - 实例：`parseDuration('1m30s')` 被 `endsWith('s')` 分支误解析为 1s。

---

## 4. Vue 响应式陷阱（本项目最重要的教训）

### 4.1 不要把接口大对象整块塞进深层响应式

- 问题：`ref` / `reactive` 会递归代理整棵结构；对象含嵌套 / 环结构时，渲染访问可能触发 getter 无限递归 →
  `RangeError: Maximum call stack size exceeded`（栈形 `isArray` / `Proxy.map` / `[Symbol.iterator]`）。

- 对策（按优先级递进）：
  1. 只保留渲染所需最小字段（`episodes` 仅取 `id` / `cid` / `title` / `long_title`…），并优先 `shallowRef`；
  2. 仍不够时（番剧切换集仍爆栈），改用「普通结构 + 渲染版本号」模式：
     - 普通数组 / 对象 + `tick`（ref）自增
     - `computed` 统一读取
     - 彻底绕开代理数组迭代。

### 4.2 变更后必须 bump

- 每次修改普通数据后必须 `tick.value++`，否则界面不刷新。
- 用「渲染视图统一走 computed + tick」收敛入口，避免漏刷。

### 4.3 避免重复代理

- 不要把 storage / 接口返回对象再次放进另一个 reactive 容器，否则会造成重复代理或引用混叠。

---

## 5. 样式与视觉一致性

- **弹窗内边距**
  - `.skip-manager-dialog > .adjustment-dialog-body { padding: 0 }`（专用变体覆写为 0）
  - 旧模板把内容包在 `.adjustment-popover-content`（20px 内边距 + 滚动容器）→ Vue 版根容器必须复用同一 class，否则内容贴边。
- **样式复用**
  - 旧样式都以 `.skip-manager-dialog …` 后代选择器生效 → Vue 组件沿用相同 class 即可免费获得样式。
  - 组件内只补私有结构（如覆盖选择遮罩 fixed 定位 + 主题变量）。
- **遮罩层级**
  - 弹窗遮罩 / 覆盖层必须可盖过 top layer 弹窗：`position: fixed; inset: 0` + 高位 `z-index` + 主题变量 `--adj-bg-scrim`。

---

## 6. 生命周期与清理

- 弹窗宿主 `openAdjustmentDialog` 的 `content(body)` 支持返回 cleanup：
  - `destroy()` 时先执行 cleanup（`app.unmount()` + 容器移除），再移除 DOM。
  - keepAlive 缓存路径同样走 destroy，避免 Vue 实例残留。
- 组件卸载不自动销毁的副作用要自行解除：事件 / observer 手动解绑，订阅类用 `onScopeDispose`。

---

## 7. 页面信号与脚本管理器沙盒

- **核心约束**：ScriptCat / Tampermonkey 沙盒下读不到页面全局（`window.__INITIAL_STATE__`）；给页面 window 赋的调试全局在控制台也不可见。
- **「当前播放分集」的多级解析策略**（不依赖页面全局）：
  1. URL ep → 播放器 `<video>` src cid → `#player-title` 标题反查
  2. → DOM 高亮 → 标题「第 N 集」序号 → 传入 id 的多级解析
- **对外调试口**不要用 `_` 前缀命名（terser / obfuscator 可能按 `^_` 混淆属性名），或改用全局快捷键触发（跨沙盒可用）。
- 页型差异：
  - `ss` 季聚合页不暴露当前播放集（无 ep URL / 状态 / 标题）→ 只能靠标题 / DOM 信号尽力解析，兜底首集；
  - `ep` 单集页走 URL 精确命中。

---

## 8. 布局红线：内部元素不得与弹窗同宽（贴边）

> 已在多次迁移中出现（片段管理内容区、动态设置挂载容器）。后续**任何**弹窗迁移 / 新建必须执行本节核对。

### 8.1 padding 归属点（先确认再写内容）

| 宿主类型 | padding 情况 | 内容写法 |
|---|---|---|
| 通用弹窗 `openAdjustmentDialog` | `.adjustment-dialog > .adjustment-dialog-body` 默认有内边距 | 无需额外处理 |
| 专用变体 `.skip-manager-dialog` 等 | body padding 被覆写为 0 | 内容必须自带 `.adjustment-popover-content`（20px 内边距 + 滚动容器），否则贴边 |
| 旧式 `.adjustment-popover` | 根 padding: 0，边距由内部结构承担（header `padding: 24px 28px 20px`、内容侧边距 28px 等） | 内部结构自带 padding |
| **Vue 挂载容器** | **不自动继承任何内边距** | 挂载后必须显式给 `#XxxMount` 补 padding |

- 实例：`#DynamicSettingsFormMount { padding: 0 28px 28px; }`

### 8.2 宽度统一

- `.adjustment-popover` 全局宽 550px（560 → 550 已改）。
- 各专属变体 / 对话框的宽度与侧边距须与同族弹窗一致，不得出现内容比容器更宽。

### 8.3 迁移核对清单（每一批必查）

1. 新增 / 迁移弹窗的内容区是否包入带 padding 的容器，或挂载点是否显式补了 padding；
2. 左右留白是否与同弹窗 header / 同族弹窗一致（28px 系列）；
3. 真机验收视觉项固定包含「贴边检查」：打开弹窗逐一查看内容距四边间距，**任何元素与弹窗同宽贴边即视为未通过，不得合入**。

---

## 9. 入口与脚手架约定（后续迁移沿用）

- 模块结构：每个功能模块的 Vue 资源放 `src/modules/<module>/ui/<feature>/`
- 通用 composable：`useConfig` / `useEvent` / `useCurrentTheme` / `escapeHtml` → 统一放 `src/ui/composables.js`
- 样式合规：`.vue` 内样式只允许主题变量 `var(--adj-*)` 与布局属性（通过 `check:colors`）
- 收尾清债：迁移后删除死代码与无引用 import（本次迁移使 `ad-skip.js` 由 1500+ 行降至约 300 行）

---

## 10. 收尾必做

1. 功能等价核对表逐项人工冒烟：本地 / 远程缓存、两模式输入、覆盖选中层、识别、锁定、消息、批量与更新全部、切集暂存保留、当前集定位 / 滚动；
2. `git diff` 内容级自审：契约入口、删除净量、无残留引用；
3. 交付声明随附 review 结论、剩余 unverified 项与偏差清单，**不虚报完成**。

---