# 剩余 UI Vue 化 — 候选矩阵与迁移顺序

> 片段管理弹窗 Vue 化已完成并验收（docs/vue-migration-lessons.md 记录全部经验）。
> 以下为项目中仍以「字符串模板 + 命令式 DOM」实现的用户 UI，
> 按风险/收益排序，每批独立交付、等价矩阵先行、真机对照后合入。

## 候选清单（按建议迁移顺序）

| # | UI | 现状 | 规模/风险 | 等价矩阵关键点 | 建议批次 |
|---|---|---|---|---|---|
| A | 评论区简介（插入评论区条目 + 简介区替换） | `comment.js` + shadow 富文本模板 | 中 | shadow 容器注入、时间锚点 seek、SPA 重渲染防重插、简介区 `.desc-info-text` 替换、截断判定 | ✅ 已完成（函数化） |
| B | 首页推荐历史弹窗 | `home/history.js`：旧式 popover + `innerHTML` 渲染列表/搜索/清空 | 中 | 弹窗生命周期、列表点击委托、搜索过滤、批次排序、清空按钮 | ⏸ 决策：维持现状（成熟独立 popover、无状态机痛点；迁 dialog 壳需多轮 CSS 覆盖与真机，保真优先不迁；若需仍可执行） |
| C | 字幕开关按钮（播放器） | `subtitle.js`：2 个 `[[…]]` 按钮模板 + 命令式显隐 | 小/低 | 按钮插入位置、tip、开关状态同步 | 内联函数化 |
| D | 侧边栏/浮动按钮组 | `ui-buttons.js` + `buttons.js`：5 个 `[[…]]` 按钮 | 小/低 | 各按钮插入锚点、参数（style/dataV/text） | 内联函数化（去占位符） |
| E | 播放页设置弹窗（视频/动态） | `settings-component-v2`：schema + 自研渲染器 + 命令式事件 | 大/高 | section/children 显隐、自绘下拉、验证/刷新按钮、tooltip、跨标签同步、主题变量 | 🔄 **V3 文件已就绪（未接线）**：`src/ui/settings/SettingsPanelV3.vue` + `controls/*` + `useSettingsPanel.js`；接线步骤与验收见 docs/settings-v3-migration.md |
| F | UP 主空间弹窗 | 已组件化（openAdjustmentDialog + iframe + keepAlive），无字符串模板 | 无需迁移 | — | 核验即可 |

## 通用规则（迁移每批遵守）

1. 对外入口/调用语义不变；行为先列等价矩阵再动手；
2. 弹窗类统一走 `openAdjustmentDialog`（content 返回 cleanup 的 Vue 挂载）；
3. 数据先抽纯函数/service（Node 可单测），视图渲染普通数据 + tick，防响应式代理爆栈；
4. 样式：沿用全局 class + `.adjustment-popover-content` 容器语义；`.vue` 内只允许 `var(--adj-*)`；
5. 每批通过 `npm test` / `npx eslint .` / `npm run build` / `check:colors` 后，真机逐项冒烟（对照旧行为核对表）再合入；不批量多 UI 同批。

## 非目标（明确排除）

- 模板注册/统计层（template-registry 的 `getTemplates` 直取仍被使用）不在清理范围；
- 本次只清已确认无引用的死模板（已完成：5 个仅含死模板键的文件移除，产物 -21KB）。
