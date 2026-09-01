#!/usr/bin/env python3
"""SCP 上传 dist 产物 + www 落地页 + API 接口到轻量服务器

用法：python scripts/upload.py
前置：先执行 npm run build 生成 dist/bilibili-adjustment.{user,meta}.js
凭据：读取项目根 .env 的 SERVER_HOST / SERVER_USER / SERVER_SSH_KEY / SERVER_DEPLOY_PATH
"""
import os
import subprocess
import sys

# dist 构建产物
DIST_FILES = [
    'bilibili-adjustment.user.js',
    'bilibili-adjustment.meta.js',
]

# www 落地页文件
WWW_FILES = [
    'index.html',
    'style.css',
    'script.js',
]

# API 接口文件
API_FILES = [
    'ad-cache.php',
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


def build_ssh_cmd(ssh_key):
    cmd = ['ssh', '-o', 'StrictHostKeyChecking=no']
    if ssh_key:
        cmd.extend(['-i', ssh_key])
    return cmd


def build_scp_cmd(ssh_key):
    cmd = ['scp', '-o', 'StrictHostKeyChecking=no']
    if ssh_key:
        cmd.extend(['-i', ssh_key])
    return cmd


def get_remote_size(ssh_cmd, user, host, remote_path):
    """通过 SSH 获取远程文件大小，不存在返回 -1"""
    check_cmd = ssh_cmd + [f'{user}@{host}', f'wc -c < {remote_path} 2>/dev/null || echo -1']
    result = subprocess.run(check_cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return -1
    try:
        return int(result.stdout.strip())
    except ValueError:
        return -1


def upload_file(scp_cmd, local_path, user, host, remote_path):
    """上传单个文件，返回是否成功"""
    dest = f'{user}@{host}:{remote_path}'
    result = subprocess.run(scp_cmd + [local_path, dest], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f'上传失败 {os.path.basename(local_path)}: {(result.stderr or result.stdout).strip()[-200:]}')
        return False
    return True


def upload_with_check(scp_cmd, ssh_cmd, local_dir, files, remote_dir, user, host, label):
    """按需上传文件：对比本地与远程大小，有变更才上传"""
    print(f'\n--- 检查 {label} ---')
    needs_upload = []

    for name in files:
        local_path = os.path.join(local_dir, name)
        remote_path = f'{remote_dir}/{name}'
        if not os.path.isfile(local_path):
            print(f'跳过 {name}：本地文件不存在')
            continue
        local_size = os.path.getsize(local_path)
        remote_size = get_remote_size(ssh_cmd, user, host, remote_path)
        if local_size != remote_size:
            needs_upload.append((local_path, remote_path, name, local_size))
            print(f'检测到变更 {name}（本地 {local_size} vs 远程 {remote_size}）')
        else:
            print(f'无变更 {name}（{local_size} bytes）')

    if needs_upload:
        print(f'上传 {len(needs_upload)} 个变更文件...')
        ok = True
        for local_path, remote_path, name, size in needs_upload:
            if upload_file(scp_cmd, local_path, user, host, remote_path):
                remote_size = get_remote_size(ssh_cmd, user, host, remote_path)
                if remote_size == size:
                    print(f'OK {name} {size} bytes')
                else:
                    print(f'验证失败 {name} local={size} remote={remote_size}')
                    ok = False
            else:
                ok = False
        return ok
    else:
        print(f'{label}无变更，跳过上传')
        return True


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

    # 远程路径
    remote_www_dir = '/www/wwwroot/www.asifadeaway.com/UserScripts/bilibili/www'
    remote_api_dir = '/www/wwwroot/www.asifadeaway.com/UserScripts/bilibili/api'

    scp_cmd = build_scp_cmd(ssh_key)
    ssh_cmd = build_ssh_cmd(ssh_key)

    ok = True

    # ========== 上传 dist 构建产物 ==========
    print('--- 上传 dist 构建产物 ---')
    dist_files = [os.path.join(root, 'dist', name) for name in DIST_FILES]
    for path in dist_files:
        if not os.path.isfile(path):
            sys.exit('缺少构建产物: ' + path + '（请先 npm run build）')

    for path in dist_files:
        name = os.path.basename(path)
        size = os.path.getsize(path)
        remote_path = f'{remote_dir}/{name}'
        if not upload_file(scp_cmd, path, user, host, remote_path):
            ok = False
            continue
        # 验证
        remote_size = get_remote_size(ssh_cmd, user, host, remote_path)
        if remote_size == size:
            print(f'OK {name} {size} bytes')
        else:
            print(f'验证失败 {name} local={size} remote={remote_size}')
            ok = False

    # ========== 上传 www 落地页（按需） ==========
    www_local_dir = os.path.join(root, 'www')
    if not upload_with_check(scp_cmd, ssh_cmd, www_local_dir, WWW_FILES, remote_www_dir, user, host, 'www 落地页'):
        ok = False

    # ========== 上传 API 接口（按需） ==========
    api_local_dir = os.path.join(root, 'scripts')
    if not upload_with_check(scp_cmd, ssh_cmd, api_local_dir, API_FILES, remote_api_dir, user, host, 'API 接口'):
        ok = False

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
