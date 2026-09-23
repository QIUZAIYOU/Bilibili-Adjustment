# 热更资产（服务器 `hot-config/` 目录）

「热更」= **改服务器上的文件就能改变脚本行为，用户不必更新脚本**。走这条路的前提是：该内容是**配置**而不是**代码** —— 它会随外部变化（B 站改版、厂商换接口地址）而过期，但语义稳定、不引入新能力。

## 1. 目录布局

所有热更资产放在服务器上与 `meta.js` 同级的 **`hot-config/`** 目录（路径由 `.env` 的 `SERVER_DEPLOY_PATH` 决定，**不要硬编码**）：

```
{SERVER_DEPLOY_PATH}/
├── bilibili-adjustment.user.js     # 脚本产物（发版才动）
├── bilibili-adjustment.meta.js
├── version.json
└── hot-config/                     # ← 热更资产统一放这里
    ├── ad-detection-prompt.js      # 广告识别提示词（构建生成）
    ├── selectors.js                # 元素选择器覆盖表（仓库内维护）
    ├── ai-providers.js             # AI 提供商端点/默认模型覆盖表（仓库内维护）
    ├── regexps.js                  # B 站解析正则覆盖表（仓库内维护）
    ├── templates.js                # 注入模板 HTML 覆盖表（仓库内维护）
    └── themes.js                   # 主题色值覆盖表（仓库内维护）
```

**为什么扩展名是 `.js` 而内容是 JSON**：服务器只有 `location ~* ^/UserScripts/.*\.(js|css)$` 这条规则带 CORS（且按 `map $http_origin $adj_cors_origin` 回显 `*.bilibili.com`），`.json` 不在其中，页面读不到。脚本一律按**文本**读取后自己 `JSON.parse`。想改成 `.json` 必须先给该 location 加 CORS。

**资产来源分两类**：

| 文件 | 真源 | 如何更新 |
|---|---|---|
| `ad-detection-prompt.js` | `src/shared/ad-detection-prompt.ts` | `npm run build:hot-config` 生成 → 上传 |
| 其余 5 张覆盖表 | 服务器上的文件本身（仓库内 `hot-config/` 保留一份副本） | 直接改文件 → 上传 |

## 2. 五类热更配置

| 表 | 能改什么 | 不能改什么 / 额外护栏 |
|---|---|---|
| `selectors` | 覆盖 `src/shared/element-selectors.ts` 里**已存在**的选择器名（175 个） | 不能新增选择器名；值要过 CSS 语法校验、限长 500 |
| `ai-providers` | 覆盖已存在 provider 的 `baseURL` / `defaultModel` | 不能新增 provider、不能改 `name`/`docsUrl`/`pricingUrl` |
| `regexps` | 覆盖 `src/shared/regexps.ts` 里已有的 17 个正则（`video.*` / `dynamic.*`）的**源串** | **不能改 flags**（与调用点语义绑定）；过 ReDoS 启发式 + `new RegExp` 编译 |
| `templates` | 覆盖 `src/shared/templates/index.js` 已注册的 10 个模板 HTML | 必须保留内置模板的**全部 `[[占位符]]` 与 `id="..."`**；禁 `<script>`/内联事件/`javascript:` |
| `themes` | 覆盖 `night`/`light`/`dark` 里**已有 token** 的色值、已有阴影值 | 不能新增 token（保证「三主题 token 集合一致」）；值要过色值/CSS 值安全校验 |
| `ad-detection-prompt` | 整份广告识别提示词 | —— |

载荷格式（`hot-config/*.js` 的实际内容）：

```js
{
    "table": "selectors",
    "updatedAt": "2026-09-17T08:24:52.564Z",
    "overrides": {
        "player": "#bilibili-player",
    }
}
```

各表的 `overrides` 值形状：

```js
// selectors / regexps / templates：key → 字符串（正则只写源串，不带斜杠与 flags）
"overrides": { "video.videoId": "\\bBV[0-9A-Za-z]{10}\\b" }

// ai-providers：provider → 字段对象
"overrides": { "deepseek": { "defaultModel": "deepseek-chat-v4" } }

// themes：主题 → { colors?, shadows? }
"overrides": { "night": { "colors": { "brand": "#FB7299", "brand-rgb": "251,114,153" } } }
```

`table` 字段可省略，但一旦声明就必须与文件名一致（防串文件）。仓库内的 5 张表都带着 `_README` / `_example` 注释字段，默认 `overrides: {}`（空 = 不覆盖，等价于内置值）。

## 3. 三级取值与「懒加载目标」的注册机制

```
远端文件 → 本地缓存（localStorage） → 内置值
```

- **启动同步应用缓存**（`applyCachedHotConfig()`，在 `src/main.ts` 的 `initializeApp` 里、模块加载**之前**）：零延迟，保证覆盖早于功能模块的首次查询；
- **随后后台刷新**（`refreshHotConfig()`）：5 张表并发拉取、各 3s 超时，成功则写缓存（**只写真正生效的条目**）**并立即应用**；
- **拉不到就什么都不覆盖**，绝不抛错、**绝不清空缓存**。隐私模式下写不进缓存也只影响下次启动。
- ⚠️ **客户端请求一律带 `cache: 'no-store'`**（5 张覆盖表与远程提示词都如此）：服务器按请求 Origin 回显 ACAO，一旦浏览器复用其他 B 站子域缓存下来的响应，CORS 校验就会失败（2026-09-23 的故障形态）；同时也能避免启发式缓存压住配置更新。回归：`test/hot-config-fetch.test.ts`。

**⚠️ 目标模块是懒加载的，所以「谁先到」都要工作**：`video`/`home`/`dynamic` 页面模块都是 `import()`，正则/模板这类目标可能晚于启动才加载。因此注册表（`src/shared/hot-config-registry.ts`）把「记录内容」与「注册目标」分开：

- 内容先到、目标后到 → `registerHotConfigTarget` 时**补应用**；
- 目标先到、内容后到 → `setHotConfigEntries` 时**立即应用**；
- **服务端不 import 任何目标模块**（目标在自己的模块体里自注册），因此既不会把懒加载的东西拖进首屏包，也不存在循环引用。

## 4. 安全边界（改这里时必须守住）

1. **白名单**：远端只能覆盖**已存在的 key**（选择器名/正则名/模板名/主题 token 都必须来自内置值）——远端无法新增能力；
2. **逐条校验、非法项逐条丢弃**（不是整表作废），并在控制台 `warn` 报出被丢弃的条目与原因；
3. **专项护栏**：选择器过 CSS 语法校验；正则过 ReDoS 启发式（嵌套量词/可空重复/分支前缀包含）与编译校验、且 flags 不可覆盖；模板过「占位符 + id 契约」与脚本/事件拦截；主题色值/CSS 值必须不能逃出 `--adj-*:<值>` 声明（禁 `;{}<>\\`、注释、`url()`、控制字符）；
4. **发布侧强制校验**：`npm run check:hot-config`（`upload.py` 上传前自动调用）用**运行时同一套代码**过一遍 5 张表，有任一条会被丢弃就直接失败、中止上传 —— 因为用户侧对「写错的条目」是**静默丢弃**，只有这里能拦住；
5. **内置值永不删除**：内置选择器/provider/正则/模板/主题/提示词既是首次运行与远端不可用时的兜底，也是覆盖白名单的来源；
6. **绝不把 token 放进脚本**（脚本明文分发）；热更只影响脚本自身的运行时配置，不涉及用户数据上传路径。

## 5. ⚠️ 两处「静默失效」的坑（改代码时别踩回去）

**① 选择器查询路径是 `CSS_MAP` 优先**

```ts
const selector = CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)
```

**`CSS_MAP` 优先于注册表**。因此「只调 `registerSelector`」的覆盖对 `CSS_MAP` 里的全部选择器**静默无效**（日志会显示覆盖成功，但页面查询仍用内置值）。覆盖必须走 `overrideSelector(name, selector)` —— 它**同时改写 registry 与 `CSS_MAP`**，并复用 `registerSelector` 的 CSS 语法校验（非法值抛错且不写入）。
回归防线：`test/selector-override.test.ts`（用极简 DOM 桩在 Node 里跑真实查询路径，已验证"只写 registry"会让该用例失败）。

**② 主题变量表是「一次注入 + 只切属性」结构**

`ThemeManager.init()` 把全部主题的变量注入 `<style id="adj-theme-vars">`，之后切换主题只改 `data-adj-theme`。所以色值覆盖后必须**整块重写变量表**（`themes` 表的 `afterApply` 会调 `reloadThemeVariables()`），否则本次会话看到的还是旧色值。

## 6. 发布流程

```bash
# ① 只改热更资产（含提示词）：不碰 user.js/meta.js/version.json，用户无感、不触发重新安装提示
HOT_ONLY=1 python scripts/upload.py

# ② 正常发版（改了脚本代码时）：版本号 → 更新说明 → 推送 → 构建 → 上传
npm run build && python scripts/upload.py
```

- 两种模式都会先跑 `npm run check:hot-config`（发布侧校验，见 §4.4），失败即中止、不上传任何热更文件；
- `HOT_ONLY=1`（别名 `PROMPT_ONLY=1`）会先 `npm run build:hot-config` 重新生成提示词资产，再**只**上传 `hot-config/` 下的文件（远程 `mkdir -p`、逐个校验大小）；
- 改提示词**必须**同时 `python scripts/sync_ad_prompt.py` 同步给平台（否则脚本与平台判定漂移）；
- 上传脚本会校验 Gitee 镜像是否已同步到本版本；发布后建议 `curl -H 'Origin: https://space.bilibili.com' -I` 复核 `hot-config/` 文件的 ACAO 头。
- ⚠️ **必须用不同 Origin 各测一次，并确认响应带 `Vary: Origin`**：ACAO 是按请求 Origin 回显的白名单，缺 `Vary` 时浏览器会把某个子域（如 `space`）拿到的缓存响应用于另一个子域（如 `www`），表现为「www 页面报 ACAO=space 不匹配」**而服务器侧 curl 一切正常**（2026-09-23 的真实故障）。现 nginx 在 `.js|.css` 与 API 两个 location 都有 `add_header Vary Origin always;`，热更资产另加 `Cache-Control: no-cache` 以保证远端改动及时生效。复核：`curl -H 'Origin: https://www.bilibili.com' -I` 与 `-H 'Origin: https://space.bilibili.com'` 各一次，两个 ACAO 应各自回显且都带 `Vary: Origin`。

## 7. 排查「行为变了」

每次启动/识别都会 debug 打印来源与生效条数，例如：

```
热更配置 selectors：来源=remote 生效 2 项
热更配置 themes：来源=cache 生效 1 项
热更配置 regexps：丢弃 1 项 — video.readId（分组内部含无上限量词（嵌套量词，易灾难性回溯））
广告识别提示词 来源=remote|cache|embedded vX #hash N 字
```

先看这几行确认用的是哪一版、有没有条目被丢弃，再判断是不是远端覆盖导致的行为变化。

## 8. 回归防线一览

| 用例 | 覆盖什么 |
|---|---|
| `test/hot-config.test.ts` | 载荷解析、白名单筛选、provider 合并、来源日志 |
| `test/hot-config-targets.test.ts` | 正则 ReDoS/编译、模板契约、CSS 值安全；注册表「内容先到/目标先到」；选择器/正则/模板/主题/AI 五张表的应用与丢弃 |
| `test/selector-override.test.ts` | `overrideSelector` 同时改写 registry 与 `CSS_MAP`（查询路径真的变） |
| `scripts/check-hot-config.mjs` | 发布侧：5 张表用运行时同一套规则校验，任一被丢弃即失败 |
| 真实浏览器夹具（临时，用后删） | 缓存优先、远端刷新、失败保缓存、非法项丢弃、主题变量表重写，共 22 条断言 |

