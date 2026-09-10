# 性能基线与护栏（Sprint 0 / P0 验收）

> 对应报告：`docs/bilibili-adjustment-v3.31.0-analysis.md`（Sprint 0 基线与门禁、§8 验收 KPI）
> 原则：**任何优化先有 baseline，再谈收益**；每次改动都应能回答「哪个 chunk 变大 / 哪段变慢了」。

## 1. 体积门禁

```bash
npm run build          # 产出 dist/bilibili-adjustment.user.js
npm run stats          # 打印 raw/gzip 体积并与 scripts/build-baseline.json 对比
npm run stats -- --update   # 发布新版本时刷新基线
```

- 脚本：`scripts/build-stats.mjs`；基线：`scripts/build-baseline.json`（提交进仓库）。
- 预算：相对基线 **+4 KB gzip 或 +5%**（取先触发者），超限退出码 1，用于阻断无意识体积回退。
- 现状约束：用户脚本为 **单文件产物**（vite-plugin-monkey），无法按 chunk 拆分体积。
  因此 Vue 的收益体现在**运行时懒加载**（未打开相关 UI 前不初始化 Vue），而非产物体积下降；
  体积门禁用于防止「静态依赖回潮」导致产物继续膨胀。

## 2. 运行时埋点

`src/shared/perf.js` 提供 `perfStart/perfEnd/perfTime/perfMark`，统一前缀 `adj:`（Performance API mark/measure）：

| 标记 | 位置 | 含义 |
|---|---|---|
| `adj:app:init` / `adj:app:ready` | `src/main.js` | 配置就绪 → 模块初始化完成（首屏关键路径） |
| `adj:system:init` | `src/core/module-system.js` | 模块系统整体初始化耗时 |
| `adj:module:init:<name>` | `src/core/module-system.js` | 单模块 install 耗时 |
| `adj:event:app:ready` 等 | `src/core/event-bus.js`（`emitMeasured`） | 关键事件分发耗时 |
| `adj:update:check` | `src/main.js` | 更新检查（空闲调度，不阻塞 APP_READY） |
| `adj:skip:manager:open` | `src/modules/video/ad-skip.js` | Vue 面板懒加载 + 挂载耗时 |
| `adj:vue:probe:load` | `src/main.js` | DEV 探针按需加载耗时 |

开发模式输出 `console.debug`；生产仅保留 measure，可在 DevTools Performance 面板查看。
DEV 下 `window.BA_PERF.getPerfSummary()` 可一次性打印汇总。

## 3. 关键验收指标

| 指标 | 判定方式 |
|---|---|
| Vue 不进关键路径 | 未按 `Ctrl+Shift+Alt+V`、未打开「跳过片段管理」时，`adj:vue:probe:load` / `adj:skip:manager:open` 不出现（即 Vue 未初始化） |
| APP_READY 不等更新检查 | `adj:app:ready` 早于 `adj:update:check` 完成；`update:check` 由 `requestIdleCallback`（或 3s 兜底）触发 |
| 冷启动写库次数 | 首次加载不因读取配置写库：`test/config-defaults.test.js` 断言 `getValue` 写入数为 0；补齐默认值走单事务批量写 |
| 广告跳过正确性 | `test/skip-matcher.test.js`：小数起点、段内 seek、拖回重触发、结束后移除监听 |
| 事件分发 | `test/event-bus.test.js`：优先级顺序、`app:ready` 并行、error 嵌套深度 ≤ 3 |
| 层级 token | 全仓无字面 z-index 大值：`grep -rn "z-index: *[0-9]\{4,\}" src` 应为空（改用 `var(--adj-z-*)`） |

## 4. 回归流程（每次改动）

```bash
npx eslint .
npm test
npm run check:colors
npm run build && npm run stats
```

真机验收（需人工）：普通视频页 / 番剧页打开「跳过片段管理」、动态页侧栏按钮、设置弹窗开关与主题切换、
弹窗 Tab 焦点循环与 Esc 关闭、跨标签页改设置同步。
