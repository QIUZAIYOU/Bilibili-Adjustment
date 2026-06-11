---
name: release
description: 完整发布流程：更新版本号 → 更新说明 → git推送 → npm构建 → FTP上传
---
# 发布 Skill

按顺序完成以下 5 步，每步完成后再执行下一步。

> ⚠️ FTP 凭证通过 `.env` 文件提供（已 `.gitignore`），发布前请确认 `.env` 中已填写正确的 `FTP_PASSWORD`。

## 1. 更新版本号
- 判断本次变更类型：修 Bug / 优化 → 改 Y；新增功能 / 重大更新 → 改 X
- 更新 `package.json` 的 `version` 字段
- 更新相关模块文件的 `version` 字段（如有）

## 2. 添加更新说明
- `package.json` 的 `updates` 字段：最前面追加，格式 `"功能描述;版本号 X.Y.Z;原有内容..."`
- `README.md` 更新日志：当前年份小节顶部追加一行 `\`MM.DD HH:MM\` — 描述`

## 3. 推送到远程仓库
```bash
git add -A
git commit -m "chore: bump to X.Y.Z"
git push origin main
```

## 4. 构建项目
```bash
npm run build
```

## 5. FTP 上传
上传 `dist/` 下的两个文件到阿里云虚拟主机（自动加载 `.env` 中的凭证）：
```bash
set -a && source .env 2>/dev/null && set +a
curl -T dist/bilibili-adjustment.user.js ftp://$FTP_HOST/htdocs/UserScripts/bilibili/ --user $FTP_USER:$FTP_PASSWORD --ssl
curl -T dist/bilibili-adjustment.meta.js ftp://$FTP_HOST/htdocs/UserScripts/bilibili/ --user $FTP_USER:$FTP_PASSWORD --ssl
```

## 验证
列出 FTP 目录确认文件存在：
```bash
set -a && source .env 2>/dev/null && set +a
curl ftp://$FTP_HOST/htdocs/UserScripts/bilibili/ --user $FTP_USER:$FTP_PASSWORD --ssl -l
```

> ⚠️ **安全提醒**：FTP 凭证通过环境变量 `$FTP_HOST`、`$FTP_USER`、`$FTP_PASSWORD` 传入，请勿硬编码到文件中。
