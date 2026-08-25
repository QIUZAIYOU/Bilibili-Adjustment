# Project memory

## Notes

- ---
name: release-workflow
description: 发布流程：更新版本号 → 更新说明 → 推送 → 构建 → FTP 上传
type: project
scope: project
created: 2026-06-03
priority: high
---
# 发布流程

推送更新时必须按顺序执行以下步骤：

## 1. 更新版本号

版本号格式 **`3.X.Y`**，首位 `3` 固定不变：

| 变更类型 | 示例 | 规则 |
|---|---|---|
| 小修小补（优化、修 Bug） | `3.13.0` → `3.13.1` | 只改 **Y** |
| 功能调整（新增、重大更新） | `3.12.7` → `3.13.0` | 只改 **X**，Y 归零 |

需更新的文件：
- **`package.json`** 的 `version` 字段
- 相关模块文件的 `version` 字段（如 `home.module.js`）

## 2. 添加更新说明

- **`package.json`** 的 `updates` 字段：在已有内容最前面追加，格式 `"版本号 X.Y.Z：功能描述;原有内容..."`。**注意：①每条更新内容末尾必须有 `;`；②更新内容中严禁出现分号 `;`，因为弹窗按 `;` 分割展示内容，出现分号会导致分割错位。**
- **`README.md`** 更新日志：在当前年份小节顶部追加一行，格式 `` `MM.DD HH:MM` — 描述 ``（注意 ` 反引号包裹日期时间）。**时间必须是执行 `date '+%m.%d %H:%M'` 得到的当前实际时间，严禁复制粘贴旧时间或随意填写。**

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

## 5. FTP 上传到阿里云虚拟主机

将 `dist/` 目录下的两个文件上传（**用 Python ftplib，勿用 curl**——本机代理会拦截 curl 的 FTP 数据连接导致超时）：

```bash
set -a && source .env 2>/dev/null && set +a
python3 - <<'EOF'
from ftplib import FTP, parse227
import os
class FTPPasvFix(FTP):
    def makepasv(self):
        host, port = parse227(self.sendcmd('PASV'))
        if host in ('127.0.0.1', '0.0.0.0', 'localhost'):
            host = self.host
        return host, port
# 数据通道偶发超时（本地代理 FTP 转发不稳定），每个文件重试数次即可成功
for f in ['bilibili-adjustment.user.js', 'bilibili-adjustment.meta.js']:
    for attempt in range(1, 6):
        print(f'{f} attempt {attempt}...')
        try:
            ftp = FTPPasvFix(os.environ['FTP_HOST'], timeout=15)
            ftp.login(os.environ['FTP_USER'], os.environ['FTP_PASSWORD'])
            ftp.cwd('/htdocs/UserScripts/bilibili/')
            with open(f'dist/{f}', 'rb') as fh:
                ftp.storbinary(f'STOR {f}', fh)
            print(f'UPLOAD {f} OK')
            ftp.quit()
            break
        except Exception as e:
            print(f'FAIL: {type(e).__name__}: {e}')
            try: ftp.close()
            except Exception: pass
EOF
```

上传后验证（同样用 Python，用 SIZE 命令核对大小，避开偶发超时的数据连接命令）：

```bash
set -a && source .env 2>/dev/null && set +a
python3 - <<'EOF'
from ftplib import FTP
import os
ftp = FTP(os.environ['FTP_HOST'], timeout=30)
ftp.login(os.environ['FTP_USER'], os.environ['FTP_PASSWORD'])
ftp.cwd('/htdocs/UserScripts/bilibili/')
for f in ['bilibili-adjustment.user.js', 'bilibili-adjustment.meta.js']:
    remote = ftp.size(f)
    local = os.path.getsize(f'dist/{f}')
    print(f'{f}: remote={remote} local={local} {"MATCH" if remote == local else "MISMATCH"}')
ftp.quit()
EOF
```

**Why:** 之前发布只推送到 GitHub，用户需要从个人服务器获取更新。构建 + FTP 上传确保服务器上的文件与最新代码同步。**curl 的 FTP 数据连接会被本机代理拦截（被动模式解析到 198.18.0.x 保留地址超时、主动模式 PORT 失败），必须改用 Python ftplib。** 2026-08-25 发布 3.17.4 时发现：服务器 PASV 响应返回 `127.0.0.1:端口`，客户端直连回环必然超时，必须用 `FTPPasvFix` 覆写 `makepasv` 把 127.0.0.1 重写为服务器域名（实测有效）；验证改用 SIZE 命令（nlst 等数据连接命令偶发超时，SIZE 走控制连接稳定）。发布 3.17.5 时确认：数据通道超时是**间歇性**的（本地代理 FTP 转发不稳定），每个文件重试数次即可成功，脚本已内置重试循环。

**How to apply:** 用户说"发布"时，按上述 5 步依次执行。如果已经是发布状态（版本号已更新、已推送），从第 4 步开始。
