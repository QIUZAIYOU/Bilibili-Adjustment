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
| `live-check.mjs` | 真实页面核查脚本（需联网 + 登录态，手工排查用） |

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

再补上油猴沙箱里才有的东西：`unsafeWindow`、`GM_addStyle`（GM 桩）、以及 `IndexedDB` 里的用户配置（播种 `BilibiliAdjustmentUserConfigs` v2 → `keyval` 仓库 → `{key, value, timestamp}`）。

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
