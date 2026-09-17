# 热更资产（服务器 `hot-config/` 目录）

「热更」= **改服务器上的文件就能改变脚本行为，用户不必更新脚本**。走这条路的前提是：该内容是**配置**而不是**代码** —— 它会随外部变化（B 站改版、厂商换接口地址）而过期，但语义稳定、不引入新能力。

## 1. 目录布局

所有热更资产放在服务器上与 `meta.js` 同级的 **`hot-config/`** 目录（路径由 `.env` 的 `SERVER_DEPLOY_PATH` 决定，**不要硬编码**）：

```
{SERVER_DEPLOY_PATH}/
├── bilibili-adjustment.user.js     # 脚本产物（发版才动）
├── bilibili-adjustment.meta.js
├── version.json
├── ad-detection-prompt.js          # ⚠️ 迁移期兼容副本（3.35.4 用户读这里），下个大版本删除
└── hot-config/                     # ← 热更资产统一放这里
    ├── ad-detection-prompt.js      # 广告识别提示词（构建生成）
    ├── selectors.js                # 元素选择器覆盖表（仓库内维护）
    └── ai-providers.js             # AI 提供商端点/默认模型覆盖表（仓库内维护）
```

**为什么扩展名是 `.js` 而内容是 JSON**：服务器只有 `location ~* ^/UserScripts/.*\.(js|css)$` 这条规则带 CORS（且按 `map $http_origin $adj_cors_origin` 回显 `*.bilibili.com`），`.json` 不在其中，页面读不到。脚本一律按**文本**读取后自己 `JSON.parse`。想改成 `.json` 必须先给该 location 加 CORS。

**资产来源分两类**：

| 文件 | 真源 | 如何更新 |
|---|---|---|
| `ad-detection-prompt.js` | `src/shared/ad-detection-prompt.ts` | `npm run build:hot-config` 生成 → 上传 |
| `selectors.js` / `ai-providers.js` | 服务器上的文件本身（仓库内 `hot-config/` 保留一份副本） | 直接改文件 → 上传 |

## 2. 三类热更配置

| 表 | 能改什么 | 不能改什么 |
|---|---|---|
| `selectors` | 覆盖 `src/shared/element-selectors.ts` 里**已存在**的选择器名 | 新增选择器名、改其它配置 |
| `ai-providers` | 覆盖已存在 provider 的 `baseURL` / `defaultModel` | 新增 provider、改 `name`/`docsUrl`/`pricingUrl` |
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

`table` 字段可省略，但一旦声明就必须与文件名一致（防串文件）。仓库内的 `hot-config/selectors.js`、`hot-config/ai-providers.js` 带着 `_README` / `_example` 注释字段，默认 `overrides: {}`（空 = 不覆盖，等价于内置值）。

## 3. 三级取值与刷新时机（stale-while-revalidate）

```
远端文件 → 本地缓存（localStorage） → 内置值
```

- **启动同步应用缓存**（`applyCachedHotConfig()`，在 `src/main.ts` 的 `initializeApp` 里、模块加载**之前**）：零延迟，保证选择器覆盖早于功能模块的首次查询；
- **随后后台刷新**（`refreshHotConfig()`）：3s 超时，成功则写缓存**并立即应用**（本次会话后续查询即用新值）；
- **拉不到就什么都不覆盖**，绝不抛错、**绝不清空缓存**。隐私模式下写不进缓存也只影响下次启动。

## 4. 安全边界（改这里时必须守住）

1. **白名单**：远端只能覆盖**已存在的 key**（选择器名必须在注册表里、provider 必须在内置表里）——远端无法新增能力；
2. **逐条校验、非法项逐条丢弃**（不是整表作废）：选择器过一遍 CSS 语法校验、值限长 500 字符；provider 只取 `baseURL`/`defaultModel` 两个字符串字段；
3. **内置值永不删除**：内置选择器/provider 表/提示词是首次运行与远端不可用时的兜底，也是覆盖白名单的来源；
4. **绝不把 token 放进脚本**（脚本明文分发）；
5. 隐私/安全上，热更只影响脚本自身的运行时配置，不涉及用户数据上传路径。

## 5. ⚠️ 选择器覆盖的坑：查询路径是 `CSS_MAP` 优先

`src/shared/element-selectors.ts` 的查询解析是：

```ts
const selector = CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)
```

**`CSS_MAP` 优先于注册表**。因此「只调 `registerSelector`」的覆盖对 `CSS_MAP` 里的全部选择器**静默无效**（日志会显示覆盖成功，但页面查询仍用内置值）。覆盖必须走 `overrideSelector(name, selector)` —— 它**同时改写 registry 与 `CSS_MAP`**，并复用 `registerSelector` 的 CSS 语法校验（非法值抛错且不写入）。
回归防线：`test/selector-override.test.ts`（用极简 DOM 桩在 Node 里跑真实查询路径，已验证"只写 registry"会让该用例失败）。

## 6. 发布流程

```bash
# ① 只改热更资产（含提示词）：不碰 user.js/meta.js/version.json，用户无感、不触发重新安装提示
HOT_ONLY=1 python scripts/upload.py

# ② 正常发版（改了脚本代码时）：版本号 → 更新说明 → 推送 → 构建 → 上传
npm run build && python scripts/upload.py
```

- `HOT_ONLY=1`（别名 `PROMPT_ONLY=1`）会先 `npm run build:hot-config` 重新生成提示词资产，再**只**上传 `hot-config/` 下的文件（远程 `mkdir -p`、逐个校验大小），并顺带把提示词的兼容副本更新到旧路径；
- 改提示词**必须**同时 `python scripts/sync_ad_prompt.py` 同步给平台（否则脚本与平台判定漂移）；
- 上传脚本会校验 Gitee 镜像是否已同步到本版本；发布后建议 `curl -H 'Origin: https://space.bilibili.com' -I` 复核 `hot-config/` 文件的 ACAO 头。

## 7. 排查「行为变了」

每次识别/启动都会 debug 打印来源与生效条数，例如：

```
热更配置 selectors：来源=remote 生效 2 项
广告识别提示词 来源=remote|cache|embedded vX #hash N 字
```

先看这几行确认用的是哪一版，再判断是不是远端覆盖导致的行为变化。
