# Bilibili-Adjustment 浏览器插件开发指南

## 目录结构

```
extension/
├── manifest.json             # Manifest V3 配置
├── background.js             # Service Worker（后台常驻）
├── content-script.js         # Content Script 入口（加载所有模块）
├── popup/
│   ├── index.html            # 弹出面板
│   ├── style.css             # 面板样式
│   └── script.js             # 面板逻辑
├── options/
│   ├── index.html            # 完整设置页
│   ├── style.css             # 设置页样式
│   └── script.js             # 设置页逻辑
├── icons/                    # 扩展图标
├── BUILD.md                  # 本文件
└── scripts/                  # 插件自包含的模块代码（36 个文件）
    ├── utils/                # 工具函数
    ├── shared/               # 共享资源（选择器、模板、样式等）
    ├── core/                 # 核心框架（EventBus, ModuleSystem）
    ├── services/             # 服务层（配置、存储、AI、更新）
    ├── config/               # 配置定义
    ├── components/           # UI 组件（设置面板、Tooltip）
    ├── modules/              # 页面模块（video, home, dynamic 等）
    └── init.js               # 应用初始化入口
```

## 架构设计

```
┌──────────────────────────────────────────────────────────┐
│                   浏览器扩展 (Extension)                    │
│                                                           │
│  ┌──────────────────┐     ┌───────────────────────────┐  │
│  │  background.js    │     │     chrome.storage 管理    │  │
│  │  (Service Worker) │─────│     更新检查 (GitHub API)   │  │
│  │                   │     │     AI API 代理 (绕过 CORS)│  │
│  └────────┬─────────┘     └───────────────────────────┘  │
│           │ chrome.runtime.sendMessage                    │
│  ┌────────▼───────────────────────────────────────────┐  │
│  │              content-script.js                      │  │
│  │  (MAIN world, 与页面共享 window)                     │  │
│  │  1. 创建 ExtensionBridge → window.__biliExt.bridge  │  │
│  │  2. 按依赖顺序加载 scripts/ 下所有模块                │  │
│  │     (通过 <script> 标签注入)                          │  │
│  └────────┬───────────────────────────────────────────┘  │
│           │                                              │
│  ┌────────▼───────────────────────────────────────────┐  │
│  │            scripts/ 模块层 (自包含)                   │  │
│  │                                                     │  │
│  │  Phase 1 │ utils/ shared/ config/ （零依赖）          │  │
│  │  Phase 2 │ core/ services/ （框架层）                 │  │
│  │  Phase 3 │ shared/styles templates （资源层）         │  │
│  │  Phase 4 │ services/ai update （后台通信层）           │  │
│  │  Phase 5 │ components/ （UI 组件）                    │  │
│  │  Phase 6 │ modules/ （页面功能模块）                   │  │
│  │  Phase 7 │ init.js （应用启动入口）                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────┐    ┌────────────────────┐                │
│  │  popup/      │    │  options/          │                │
│  │  快速开关面板  │    │  完整设置页         │                │
│  └─────────────┘    └────────────────────┘                │
└──────────────────────────────────────────────────────────┘
```

## 关键设计决策

### 自包含（不再依赖 built userscript）
插件版的所有代码都在 `extension/scripts/` 下，**完全独立于 `src/` 目录**。
不再需要 `npm run build` 生成 userscript 来注入。

### 存储后端
- **Userscript 版**：IndexedDB + CORS 代理
- **插件版**：`chrome.storage.sync`（配置）+ `chrome.storage.local`（历史记录），通过后台 Service Worker 管理

### 通信机制
Content Script（MAIN world）通过 `chrome.runtime.sendMessage` 与 Background Service Worker 通信，
实现配置管理、历史记录、AI API 代理、更新检查等功能。

### 模块兼容
插件版复制了 `src/` 的核心逻辑并适配为扩展 API，不修改任何 `src/` 下的文件。

## 功能对照

| 功能 | Userscript | Extension |
|------|-----------|-----------|
| 播放页自动定位 | ✅ | ✅ |
| 播放器默认模式 | ✅ | ✅ |
| 自动最高画质 | ✅ | ✅ |
| Hi-Res 无损音质 | ✅ | ✅ |
| 网页全屏解锁 | ✅ | ✅ |
| 自动字幕 | ✅ | ✅ |
| 离开暂停/返回恢复 | ✅ | ✅ |
| 视频简介优化 | ✅ | ✅ |
| 评论 IP 属地 | ✅ | ✅ |
| 移除评论标签 | ✅ | ✅ |
| AI 广告跳过 | ✅ | ✅ |
| 跳过指定时间节点 | ✅ | ✅ |
| 快速返回播放器 | ✅ | ✅ |
| 首页视频历史记录 | ✅ | ✅ |
| 首页付费检测 | ✅ | ✅ |
| 动态页默认投稿 | ✅ | ✅ |
| 设置面板（页面内） | ✅ | ✅ |
| 设置面板（独立） | ❌ | ✅ Options 页面 |
| 快速开关（工具栏） | ❌ | ✅ Popup |
| 更新检查（直接 API） | ❌ CORS 代理 | ✅ GitHub 直连 |
| AI API 代理 | ❌ 页面内 CORS | ✅ 后台代理 |
| 配置跨设备同步 | ❌ | ✅ chrome.storage.sync |
| 工具栏徽章 | ❌ | 可扩展 |

## 开发流程

### 加载插件
1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 目录

### 文件修改后
- 修改 `extension/scripts/` 下的文件 → 刷新 B 站页面即可（content script 会重新加载）
- 修改 `background.js` → 在 `chrome://extensions` 点击扩展的「Service Worker」的「重新加载」链接
- 修改 `popup/` 或 `options/` → 关闭并重新打开即可

### 调试
- **Content Script 日志**：B 站页面 F12 → Console，过滤 `[BiliAdjust]`
- **Background 日志**：`chrome://extensions` → 点击扩展的「Service Worker」
- **Popup 日志**：右键扩展图标 → 「审查弹出内容」
- **Options 日志**：打开设置页后 F12

## 消息协议

Content Script ↔ Background 通信使用 `chrome.runtime.sendMessage`。

消息类型共 17 种：`config:get/set/getMany/setMany/getAll/reset/remove`、`history:get/add/clear/search`、`update:check`、`ai:chat/validateKey/getModels`、`cache:get/set`。

## 迁移路线图

### Phase 1 ✅（当前）
- [x] 自包含架构，不依赖 userscript 构建产物
- [x] Mainfest V3 配置
- [x] Background Service Worker
- [x] Content Script 加载器
- [x] 存储适配 (`chrome.storage`)
- [x] Popup 快速开关面板
- [x] Options 完整设置页
- [x] 更新服务（后台直接请求 GitHub API）
- [x] AI 服务代理（后台绕过 CORS）
- [x] 全部三大模块移植（video / home / dynamic）

### Phase 2 (优化)
- [ ] 工具栏徽章 (Badge) 显示状态
- [ ] 定时后台广告预识别
- [ ] 右键菜单集成
- [ ] Edge / Firefox 适配

### Phase 3 (增强)
- [ ] HMR 开发支持
- [ ] 单元测试
- [ ] Chrome Web Store 发布
