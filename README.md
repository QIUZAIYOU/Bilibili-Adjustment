# 🎬 哔哩哔哩（bilibili.com）调整

> 一个简单的小脚本，主要是给自己用的。

为了方便开发，脚本已完全重构并新增了功能，此为第三个版本。  
因脚本托管网站（如 GreasyFork）不允许上传混淆压缩后的代码，该版本将不再使用脚本托管网站发布。  
目前第二个版本 [哔哩哔哩（bilibili.com）播放页调整](https://greasyfork.org/zh-CN/scripts/493405-%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9-bilibili-com-%E8%B0%83%E6%95%B4) 依然可用，但将**停止更新**。

---

## ✨ 新功能与改进

相比第二版，第三版有以下显著更新：
1. **浏览器适配**：已适配火狐浏览器，目前主流浏览器已全部支持。  
2. **常用功能重构**：性能和样式全面优化；
3. **独立设置项**：无需依赖篡改猴等脚本插件，支持页面内直接修改设置；
4. **评论区增强**：新增「IP属地」显示；
5. **自动更新提醒**：脚本托管在个人网站，支持自动检查更新并弹窗提醒。

> **注意**：本人利用空闲时间开发并修修补补，虽已使用数月未发现问题，但仍无法保证完全没有 Bug。若使用中遇到问题，请随时反馈，我会尽快处理！

---

## 🚀 安装指南

请先安装以下脚本引擎扩展之一：
- [Tampermonkey](https://www.crxsoso.com/webstore/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Violentmonkey](https://www.crxsoso.com/webstore/detail/jinjaccalgkegednnccohejagnlnfdag)
- [ScriptCat](https://www.crxsoso.com/webstore/detail/ndcooeababalnlpkfedmmbbbgkljhpjf)

> **提示**：以上链接使用了油小猴的 [crxsoso](https://www.crxsoso.com) 源。如不放心，可在浏览器扩展商店自行搜索安装。

安装完成后，点击右侧按钮在线安装脚本：👉 [在线安装](https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js)

---

## 🛠 功能列表

### 首页调整
1. **推荐视频回溯**: 首页新增推荐视频历史记录（仅记录前10个推荐位中的非广告内容），防止误点刷新错过想看的视频。

### 动态页调整
1. **默认显示「投稿视频」**: 默认显示「投稿视频」内容，支持自定义URL以防未来变化。

### 播放页调整
1. **自动定位播放器**：进入播放页后自动滚动至播放器，支持偏移量设置；
2. **播放器模式设置**：可自定义默认模式；
3. **画质选择**：支持自动选择最高画质；
4. **快速返回按钮**：新增悬浮按钮，一键返回播放器；
5. **时间锚点支持**：点击评论区时间锚点快速跳转至播放器；
6. **网页全屏解锁**：全屏模式下可滚动查看评论，并新增「跳转至评论区」按钮；
7. **视频简介优化**：替换静态内容为跳转链接；
8. **推荐视频支持**：点击合集、推荐视频卡片快速返回播放器；
9. **自动暂停与播放**：离开页面时暂停视频，返回时自动播放；
10. **字幕功能**：新增自动开启字幕设置项。
11. **IP属地展示**：视频评论区显示评论IP归属地。

---

## 📋 更新日志

### 2025

`04.10 23:38`：修复「播放器默认模式」选择「关闭」时导致的页面异常锁定及选项样式异常显示的问题;「[#4](https://github.com/QIUZAIYOU/Bilibili-Adjustment/issues/4)」;

`04.10 22:32`：修复评论区「视频简介时间锚点」跳转功能;

`04.08 23:34`：使用更合理的 V3 版本号;优化「自动更新」弹窗样式，新增「更新内容」显示(如果有的话);

`04.05 00:00`：修复首页「推荐视频历史记录」失效的问题;「[#3](https://github.com/QIUZAIYOU/Bilibili-Adjustment/issues/3)」;

`04.02 23:04`：~~评论区标题最右侧添加「显示评论归属地」按钮，当脚本未按预期显示时可手动点击该按钮进行修复;~~ 目前「IP属地展示」功能按预期正确执行，此功能下线；

`04.02 21:44`：「IP属地展示」、「脚本设置开关」等功能适配「bangumi」页面;

`03.31 11:08`：新增移除评论中「标签(UP主觉得很赞)」的功能并添加相关设置项;

> 日常更新见 commits 历史记录。

---

## ⭐ 第二版与第一版

### 第二版
Github: [哔哩哔哩（bilibili.com）播放页调整](https://github.com/QIUZAIYOU/Bilibili-Adjustment-Archived) (已归档)

### 第一版
Github:
- [哔哩哔哩（bilibili.com）播放页调整](https://github.com/QIUZAIYOU/Bilibili-VideoPage-Adjustment) (已归档)
- [哔哩哔哩（bilibili.com）动态页调整](https://github.com/QIUZAIYOU/Bilibili-DynamicPage-Adjustment) (已归档)

### 📋 历史更新（第二版）

### 2025

`02.13 23:01`：修复「点击评论区时间锚点」返回至播放器失效的问题;

`02.12 15:01`：修复「网页全屏解锁」后「插入跳转评论按钮」点击失效的问题;

`01.31 19:23`：优化「定位至播放器」功能执行逻辑，并默认开启解锁合集/选集视频集数选择按钮功能；

`01.26 11:20`：修复「视频简介优化」及「点击评论区时间锚点可快速返回播放器」功能；

### 2024

`10.20 21:07`：修复点击视频结尾推荐视频不自动定位的问题；

`10.17 20:37`：新增自动开启字幕功能并添加快速开关；修复失效的函数；

`06.17 19:25`：修复「视频简介优化」功能因 VUE 版本号更新导致的样式错误问题。

`05.16 22:25`：优化「首页」推荐视频历史记录功能。

### 📋 历史更新（第一版）

### 2024

`01.26 22:36`：优化「自动选择最高画质」功能逻辑，增加对勾选 「是否包含4K」或「是否包含8K」选项，但视频本身没有提供这两个清晰度选项的情况的处理，此时将自动勾选除这两项之外的最高画质。

`01.24 20:52`：修复开启「网页全屏模式解锁」功能后，网页全屏状态下按某些顺序切换至其他模式会导致页面错乱的问题。

`01.22 09:45`：修复因 `01.17 09:48` 更新，误把「自动选择播放器默认模式」功能关闭状态的检测逻辑删除，在功能关闭状态下脚本错误反复尝试切换播放器模式导致页面闪烁的问题。

`01.21 21:07`：修复因播放页代码变动导致的「自动选择最高画质」功能失效的问题。

`01.19 18:30`：修复开启「网页全屏解锁」功能后错误循环执行「自动定位至播放器」的问题。[#2](https://github.com/QIUZAIYOU/Bilibili-VideoPage-Adjustment/issues/2)

`01.19 17:57`：增加检查视频是否处于可播放状态的次数。

`01.17 09:48`：优化代码，移除代码中已失效的部分。

`01.09 21:14`：修复「bangumi」页面右侧漂浮导航插入「自动定位至播放器」按钮失效的问题。

`01.09 11:10`：修复「bangumi」页面播放「电影」类型视频时自动选择「播放器默认模式」失败的问题。设置中新增「脚本执行失败自动刷新重试」选项。

### 2023

`12.28 20:20`：适配最新的「bangumi」页面代码，修复「自动定位至播放器」及「点击播放器自动定位至播放器」错位的问题，其他积累问题修复。

`11.14 20:58`：调整「自动定位至播放器」判定条件，提高定位成功率。

`11.11 21:49`：修复「bangumi」播放页自动选择「播放器默认模式」失败的问题。

`11.11 20:59`：修复因数字精度问题导致「自动定位至播放器」功能失效的问题。

`07.04 08:10`：修复因一行调试代码未注释导致火狐浏览器中脚本报错不执行的问题。

`06.19 23:23`：设置中新增「播放器默认模式」选项，可选择关闭。

`06.18 14:37`：重构后代码重新加入浏览器标签页激活状态检测，调整设置将在当前标签页激活时应用。

`04.08 14:21`：优化对「video」播放页新版网页结构的适配。

`04.01 23:41`：重构代码，优化脚本，适配「video」播放页新版网页结构。

`02.26 21:50`：设置中新增「自动定位至播放器」选项，可自由选择在「video」或「bangumi」类型播放页中开启本功能。默认全部开启。

`02.13 22:55`：修复点击浏览器前进后退按钮后「自动定位至播放器」功能不生效的问题。

`02.11 22:11`：修复点击「bangumi」播放页「时间锚点」自动定位至播放器功能失效的问题。

`02.11 20:37`：修复点击新加载评论中的「时间锚点」自动定位至播放器功能失效的问题。

`02.10 19:25`：修复因 `02.10 16:29` 更新覆盖评论区「时间锚点」原有功能导致的视频播放进度不跳转的问题。

`02.10 16:29`：新增点击评论区「时间锚点」自动定位至播放器功能。

`02.08 22:28`：1.优化代码，修复部分函数会重复执行的问题。2.「网页全屏模式解锁」功能开启状态下视频控制条「进入全屏」按钮旁新增「前往评论」按钮，可点击此按钮直达评论区，避免滚动鼠标滚轮出现调整音量提示。

`02.08 09:52`：适配「稍后再看」视频播放页面。

### 2022

`10.14 11:40`：开启「网页全屏模式解锁」功能后，下滑新增迷你播放器显示，不过比较简陋，只支持暂停/播放操作，有条件的建议还是直接使用浏览器自带的小窗播放功能。

`10.14 09:53`：修复开启「自动选择最高画质」功能后，未勾选 「是否包含4K」及「是否包含8K」的情况下错误选择 8K 画质的问题。

`10.11 20:45`：修复开启「网页全屏模式解锁」功能后，网页全屏状态下切换其他模式页面错乱的问题。

`09.30 23:00`：新增「网页全屏模式解锁」功能，网页全屏模式下可以滑动滚动条查看下方评论等内容（因bangumi播放页网页全屏时下方评论仍未加载所以暂不支持），需在设置里重新勾选播放器默认模式并保存后生效（如不生效多保存几次并清除浏览器缓存试试）。

`09.30 10:10`：重构部分代码，修复积累问题。

`08.09 09:15`：修复「自动选择最高画质」功能「是否包含4K」的问题。

`08.08 17:00`：加入浏览器标签页激活状态检测，调整设置将在当前标签页激活时应用。

`08.02 20:56`：适配新版播放页改动。

`07.18 10:16`：尝试修复「自动定位至播放器」概率失效的问题。

`07.15 16:27`：尝试修复自动选择「播放器默认模式」概率失效的问题。

`07.09 22:50`：修复「自动定位至播放器」会在首次定位成功后重复执行的问题。

---

## 📞 反馈与支持

如有任何问题或建议，请通过以下方式联系我：
- 提交 Issue：[GitHub Issues](https://github.com/QIUZAIYOU/Bilibili-Adjustment/issues)
- 邮件：暂无

感谢您的支持与使用！🌟
