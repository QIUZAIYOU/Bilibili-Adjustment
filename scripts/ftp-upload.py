#!/usr/bin/env python3
"""FTP 上传 dist 产物到服务器（阿里云虚拟主机）

用法：python scripts/ftp-upload.py
前置：先执行 npm run build 生成 dist/bilibili-adjustment.{user,meta}.js
凭据：读取项目根 .env 的 FTP_HOST / FTP_USER / FTP_PASSWORD，绝不打印

阿里云虚拟主机适配（已验证）：
- PASV/EPSV 响应返回内网 IP（127.0.0.1），curl 会自动改用控制连接地址
- 数据端口轮询分配、部分节点不可达，依赖 curl --retry 重试
- 站点根目录不可写，上传目录固定为 /htdocs/UserScripts/bilibili
"""
import os
import subprocess
import sys
from ftplib import FTP

# 远程上传目录：绝对不要更改（服务器站点根下的固定目录）
REMOTE_DIR = '/htdocs/UserScripts/bilibili'
FILES = [
    'bilibili-adjustment.user.js',
    'bilibili-adjustment.meta.js',
]
CURL_RETRY = 12
CURL_RETRY_DELAY = 5
CURL_TIMEOUT = 45


def load_env(path):
    env = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip()
    return env


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env = load_env(os.path.join(root, '.env'))
    missing = [k for k in ('FTP_HOST', 'FTP_USER', 'FTP_PASSWORD') if not env.get(k)]
    if missing:
        sys.exit('缺少 .env 凭据: ' + ', '.join(missing))
    host, user, password = env['FTP_HOST'], env['FTP_USER'], env['FTP_PASSWORD']

    files = [os.path.join(root, 'dist', name) for name in FILES]
    for path in files:
        if not os.path.isfile(path):
            sys.exit('缺少构建产物: ' + path + '（请先 npm run build）')

    # 登录与目录校验：控制连接，不受数据端口不稳定影响
    ftp = FTP()
    ftp.connect(host, 21, timeout=30)
    ftp.login(user, password)
    ftp.cwd(REMOTE_DIR)

    ok = True
    for path in files:
        name = os.path.basename(path)
        size = os.path.getsize(path)
        url = 'ftp://' + host + '/' + REMOTE_DIR + '/' + name
        result = subprocess.run(
            ['curl', '-sS', '-m', str(CURL_TIMEOUT),
             '--retry', str(CURL_RETRY), '--retry-delay', str(CURL_RETRY_DELAY),
             '--retry-all-errors', '-T', path, url,
             '--user', user + ':' + password],
            capture_output=True, text=True)
        if result.returncode != 0:
            print('上传失败 ' + name + ': ' + (result.stderr or result.stdout).strip()[-200:])
            ok = False
            continue
        remote = ftp.size(name)
        if remote == size:
            print('OK ' + name + ' ' + str(size) + ' bytes')
        else:
            print('SIZE 不一致 ' + name + ' remote=' + str(remote) + ' local=' + str(size))
            ok = False
    ftp.quit()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
