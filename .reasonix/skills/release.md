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
- `package.json` 的 `updates` 字段：最前面追加，格式 `"功能描述;版本号 X.Y.Z;原有内容..."`。**注意：①每条更新内容末尾必须有 `;`；②更新内容中严禁出现分号 `;`，否则弹窗会错误分割展示。**
- `README.md` 更新日志：当前年份小节顶部追加一行 `\`MM.DD HH:MM\` — 描述`。**时间必须通过 `date '+%m.%d %H:%M'` 获取当前实际时间，严禁随意填写或复制。**

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
python3 - <<'EOF'
from ftplib import FTP
import os
ftp = FTP(os.environ['FTP_HOST'], timeout=30)
ftp.login(os.environ['FTP_USER'], os.environ['FTP_PASSWORD'])
ftp.cwd('/htdocs/UserScripts/bilibili/')
for f in ['bilibili-adjustment.user.js', 'bilibili-adjustment.meta.js']:
    with open(f'dist/{f}', 'rb') as fh:
        ftp.storbinary(f'STOR {f}', fh)
    print(f'UPLOAD {f} OK')
print(ftp.nlst())
ftp.quit()
EOF
```

## 验证
列出 FTP 目录确认文件存在：
```bash
set -a && source .env 2>/dev/null && set +a
python3 - <<'EOF'
from ftplib import FTP
import os
ftp = FTP(os.environ['FTP_HOST'], timeout=30)
ftp.login(os.environ['FTP_USER'], os.environ['FTP_PASSWORD'])
ftp.cwd('/htdocs/UserScripts/bilibili/')
print(ftp.nlst())
ftp.quit()
EOF
```

> ⚠️ **安全提醒**：FTP 凭证通过环境变量 `$FTP_HOST`、`$FTP_USER`、`$FTP_PASSWORD` 传入，请勿硬编码到文件中。
> ⚠️ **为何用 Python ftplib 而非 curl**：本机网络代理/防火墙会拦截 curl 的 FTP 数据连接（被动模式解析到代理保留地址 `198.18.0.x` 超时，主动模式 `Failed to do PORT`）。Python `ftplib` 走独立网络栈可正常上传。若 curl 可用则仍可用 curl。
