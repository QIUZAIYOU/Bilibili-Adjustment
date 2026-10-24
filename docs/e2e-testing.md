# 端到端测试（E2E）

本文档说明 `test/e2e/` 这层测试台：**把构建产物真正注入浏览器页面**，验证「往 B 站 DOM 里注入节点」这类纯函数单测覆盖不到的行为。

## 为什么需要它

本项目多数逻辑是纯函数（配置归一化、正则、模板、策略判定），用 `npm test` 的 node:test 就能覆盖。但**注入类**功能天生测不到两件事：

1. **选择器能不能命中真实 DOM** —— 用户报「视频页的卡片没有预览按钮」，根因就是注册表里的封面选择器（`.bili-video-card__image--wrap` 等）一个都命中不了播放页的 `.b-img`；
2. **注入后的节点是否真的在页面上、点击是否有效**。

这两件事只能在真实浏览器里验。纯函数单测会把错误的 CSS 选择器原样"测绿"。

## 目录

| 文件 | 作用 |
|---|---|
| `harness.mjs` | 测试台：启动浏览器、按油猴加载顺序注入产物、播种配置 |
| `userscript.test.mjs` | 正式用例（`npm run test:e2e`） |
| `fixtures/cards.html` | 卡片夹具页：复刻首页 / 播放页相关推荐 / 热门榜三种真实卡片结构 |
| `serve-dist.mjs` | 带 CORS 的本地静态服务（供「在真页面里手动注入」用） |
| `verify-real-browser.mjs` | **真实 B 站页面**核查（`npm run verify:real`） |
| `live-check.mjs` | 真实页面核查脚本（需联网 + 登录态，手工排查用） |
| `probe-dom.mjs` | DOM 探针：打开真实页面打印某个选择器命中的结构（B 站改版后重查卡片结构用） |

## 跑法

```bash
npm run build      # 必须先构建：用例跑的是 dist/bilibili-adjustment.user.js
npm run test:e2e
```

用例默认用本地产物；`ADJ_E2E_BUILD` 可指定别的产物，`ADJ_E2E_HEADLESS=1` 可切无头模式。

**不进 CI**：`npm test` 的通配是 `test/*.test.js|ts`，`test/e2e/` 不在其中；CI 机器也没有浏览器。

## 注入原理

产物不是普通脚本，而是「SystemJS 运行时 + 命名注册扩展 + 产物本体」三件套。测试台按油猴 `@require` 的真实顺序注入：

1. `system.min.js`（SystemJS 运行时）
2. `extras/named-register.min.js`（命名注册扩展）
3. `System = new System.constructor()`（换新实例，避免与页面自身冲突）
4. 产物本体（内部 chunk 已内联）

再补上油猴沙箱里才有的东西：`unsafeWindow`、`GM_addStyle`（GM 桩）、以及 **GM 存储**（用户配置，键 `adj.cfg.<配置键>` → 值 `{ v: 裸值, t: 写入时间戳, d?: 1 }`）。`d` 标记「这条是默认值补齐，不是用户显式设置」—— 迁移期靠它让位（见「配置迁移」一节）。

用户配置自 3.41.0 起存脚本管理器存储（脚本级，跨全部匹配页面共享一份）；`seedConfig` 播的就是 GM 存储，`seedLegacyConfig` 播的是**旧库**（按源隔离的 IndexedDB），用来验证迁移。

产物的 `System.import("./__entry.js", "./")` 故意传了非法父 URL，解析失败后回落到命名注册表 —— 所以**不依赖页面真实地址**，夹具页上照样能跑。

## 夹具页为什么要复刻三种结构

`fixtures/cards.html` 里的结构是 2026-10-24 在真实 B 站页面上实测抓下来的：

- 首页卡片：`.bili-video-card > __wrap > a.bili-video-card__image--link > .bili-video-card__image > .bili-video-card__image--wrap`
- 播放页相关推荐：`.card-box > .pic-box > .pic > .framepreview-box > a.video-awesome-img > .b-img > img`
- 热门排行榜：`li.rank-item > .content > .img > a > img.lazy-image.cover`

三者对应注册表里 `videoCardCover` / `videoCardContainer` / `videoCardTitle` 三个选择器的不同分支。**B 站改版时，改注册表就要同步改夹具**（反过来也一样），否则用例会"绿着绿着失去意义"。

## 踩过的坑

- **点预览按钮会加载真的 B 站播放页**（重、占渲染主线程）→ 用例里必须拦掉外部请求，否则测出来的是环境假象（渲染进程卡死 → `Runtime.callFunctionOn` 超时），不是功能缺陷。
- **断言别写「画面已出」**：弹窗里加载的是真播放页，夹具环境拦了外网，等不到画面。只断言弹窗 DOM 出现、iframe 指向目标 bvid。
- **卡死类 bug 测不出来**：2026-10-24 就栽在这 —— 通知组件摘旧通知时只加淡出类、300ms 后才移除节点，`while (children.length >= 5)` 永远成立 → 连续 5 条通知就把整页卡死。定位手段是 CDP `Debugger.pause` 抓当时的 JS 调用栈（能看出卡在 `notification.show` 里），不是猜。

## 真页面核查（手工）

```bash
node test/e2e/serve-dist.mjs 8799   # 带 CORS 的本地服务
node test/e2e/live-check.mjs          # 真页面核查（需联网 + 登录态）
```

`serve-dist.mjs` 起的服务带 CORS，是为了能跨源从 `www.bilibili.com` 取产物 —— 服务端对 `*.bilibili.com` 回显 ACAO。

## 真页面核查（自动，推荐）

```bash
npm run build
npm run verify:real          # 默认跑播放页 + 首页
```

`verify-real-browser.mjs` 把**最新构建产物**注入**真实的 bilibili.com 页面**并在真实 DOM 上核查：

- 起一个**独立实例**并 `--disable-extensions` → 油猴扩展不加载，**只有我们注入的这一份脚本在跑**，
  不存在「旧脚本（已安装在扩展里）+ 新注入脚本」双实例打架；
- 按油猴加载顺序注入产物（SystemJS + `unsafeWindow` 桩 + GM 存储播种 `home_video_preview`）；
- 输出：预览按钮数 / 封面容器数 / 按钮上的 bvid / 侧栏头像的 margin、圆角、尺寸 / 页面异常。

2026-10-24 实测（3.40.2，发布到线上之后复跑）：

```
播放页 BV1GJ411x7h7：预览按钮 20、封面容器 20、头像 margin "0px 0px 6px"、圆角 50%、尺寸 40×40
首页：             预览按钮 10、封面容器 10
```

⚠️ **登录态默认不复制**：运行中的 Chrome **独占锁**着 `Cookies`，复制会 EBUSY（无管理员权限时无法绕过）。
验证「预览按钮 / 侧栏头像」这类功能不需要登录；确需登录态时，关掉浏览器后再复制，或用 `ADJ_E2E_PROFILE` 指向一份静态副本。

## 跨源共享与跨源实时生效（3.41.0 新增）

```bash
npm run build
npm run verify:cross-origin        # 真实 B 站页面，验证「配置全局一份 + 实时跟随」
```

`verify-gm-cross-origin.mjs` 验的是本次存储改造的核心承诺：

1. **各源读到同一份配置** —— `www` / `search` / `t` 三个不同源各开一页，主题与预览开关完全一致；
2. **已打开的其它源标签页实时跟随** —— 改配置后无需刷新，另一源的 `data-adj-theme` 立刻变。

**怎么模拟脚本管理器**：真实 GM 存储是**脚本级**的（跨全部匹配页面共享一份），而页面之间没有同步的 JS 全局。这里把存储放在 **Node 侧**，通过 `page.exposeFunction` 暴露一个 **Promise 版 GM API** 给页面，再由 Node 侧把变更**广播回各页**（模拟 `GM_addValueChangeListener` 的跨上下文回调）。顺带也覆盖了适配层的 Promise 版分支（同步版分支由单测覆盖）。

2026-10-24 实测（3.41.0）：

```
www     ：主题=night 预览按钮=13 视频链接=24
search  ：主题=night 预览按钮=35 视频链接=71
dynamic ：主题=night 预览按钮=0  视频链接=0   ← 未登录的动态页没有卡片，0 按钮是正常的
断言②：dynamic 主题 night → light（改配置后已打开的另一源标签页实时跟随，无需刷新）
```

> 迁移前，搜索页读的是**自己源里的默认值**（`home_video_preview` 默认 `false`）→ 预览按钮一个都不会出现；
> 迁移后它读到的是同一份配置 → 35 个按钮。**这就是「设置按站点分」这个历史问题的实测对照。**

⚠️ `t.bilibili.com` 加载后会自己 reload，注入的产物会随旧文档一起消失 —— 所以这个脚本用 `persistUserscript`（注册到 `evaluateOnNewDocument`）做**跨导航持久注入**。且持久注入必须等 DOM 就绪：文档起始阶段 `document.head` 还是 `null`，脚本里的样式注入会直接抛错、一进页面就死。

## 装到油猴扩展里人工验证（ScriptCat）

想验证「**真正安装进扩展**」的形态（脚本管理器沙箱、`@require` data: URI、GM API），走这条：

1. 打开 ScriptCat 扩展的设置页 → 点右上角**新建脚本**；
2. 点**本地导入** → 选 `dist/bilibili-adjustment.user.js`；
3. 在打开的新标签页里点**更新**；
4. 回 B 站刷新页面。

⚠️ 这条流程**无法自动化**：脚本管理器是 `chrome-extension://` 页面，而
- BrowserSkill（`bsk`）的 Agent Window 沙箱**明确拒绝** `chrome-extension://` 页（`evaluate`/`snapshot`/`get-html` 全被拒）；
- 浏览器没开 `--remote-debugging-port`，无法从外部直连 CDP；
- 原生「选择文件」对话框同样够不着（`bsk upload` 也受沙箱限制）。

所以扩展页那 3 下点击只能人工做；**装完之后**的验证（刷新 B 站、查 DOM）是可以自动的。
