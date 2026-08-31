#!/usr/bin/env python3
"""SCP 上传 dist 产物到轻量服务器

用法：python scripts/upload.py
前置：先执行 npm run build 生成 dist/bilibili-adjustment.{user,meta}.js
凭据：读取项目根 .env 的 SERVER_HOST / SERVER_USER / SERVER_SSH_KEY / SERVER_DEPLOY_PATH
"""
import os
import subprocess
import sys

FILES = [
    'bilibili-adjustment.user.js',
    'bilibili-adjustment.meta.js',
]


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

    # 检查必需的环境变量
    required = ['SERVER_HOST', 'SERVER_USER', 'SERVER_DEPLOY_PATH']
    missing = [k for k in required if not env.get(k)]
    if missing:
        sys.exit('缺少 .env 配置: ' + ', '.join(missing))

    host = env['SERVER_HOST']
    user = env['SERVER_USER']
    remote_dir = env['SERVER_DEPLOY_PATH']
    ssh_key = env.get('SERVER_SSH_KEY', '')

    # 检查构建产物
    files = [os.path.join(root, 'dist', name) for name in FILES]
    for path in files:
        if not os.path.isfile(path):
            sys.exit('缺少构建产物: ' + path + '（请先 npm run build）')

    # 构建 SCP 命令
    scp_cmd = ['scp', '-o', 'StrictHostKeyChecking=no']
    if ssh_key:
        scp_cmd.extend(['-i', ssh_key])

    # 上传每个文件
    ok = True
    for path in files:
        name = os.path.basename(path)
        size = os.path.getsize(path)
        dest = f'{user}@{host}:{remote_dir}/{name}'
        result = subprocess.run(
            scp_cmd + [path, dest],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            print(f'上传失败 {name}: {(result.stderr or result.stdout).strip()[-200:]}')
            ok = False
            continue
        print(f'OK {name} {size} bytes')

    # 验证：通过 SSH 检查远程文件大小
    ssh_cmd = ['ssh', '-o', 'StrictHostKeyChecking=no']
    if ssh_key:
        ssh_cmd.extend(['-i', ssh_key])
    ssh_cmd.append(f'{user}@{host}')

    for path in files:
        name = os.path.basename(path)
        size = os.path.getsize(path)
        check_cmd = ssh_cmd + [f'wc -c < {remote_dir}/{name}']
        result = subprocess.run(
            check_cmd, capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print(f'验证失败 {name}: {result.stderr.strip()[-200:]}')
            ok = False
            continue
        remote_size = int(result.stdout.strip())
        if remote_size == size:
            print(f'验证通过 {name} {remote_size} bytes')
        else:
            print(f'大小不一致 {name} remote={remote_size} local={size}')
            ok = False

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
