#!/usr/bin/env python3
"""通过 **workbench（阿里云云助手）** 发布到轻量服务器

为什么是这个脚本（不是 `scripts/upload.py` 的 SCP）：
    轻量服务器 `i-2zeeo1jt2not5iri8b14` 的 SSH 只认密钥，而**这台开发机上没有那把私钥**
    （本机只有 GitHub 用的 id_ed25519/tms，服务器 authorized_keys 里没有它们）。
    但 workbench CLI 走**阿里云云助手 API**（文件经 OSS 中转），**不需要 SSH 私钥**，
    凭据在 workbench 自己的 profile 里 —— 这才是这台机器上实际可用的发布通道。

与 `scripts/upload.py` 的关系：
    **发布物、目录布局、门禁、校验全部复用 upload.py**（本文件直接 import 它的函数），
    只把「传输层」换成 workbench。所以两条通道发布出来的线上状态完全一致。

用法：
    python scripts/upload-workbench.py
    HOT_ONLY=1 python scripts/upload-workbench.py   # 只更新 hot-config/ 热更资产

前置：
    - `npm run build`（产物必须比源码新、版本与 package.json 一致 —— upload.py 的门禁会查）
    - workbench 已登录（`workbench list` 可见实例 / 能 exec 成功）
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 复用 upload.py 的门禁与文件清单（不重复实现，避免两条通道的门禁漂移）
from upload import (  # noqa: E402
    API_FILES,
    DIST_FILES,
    HOT_CONFIG_DIR,
    HOT_CONFIG_DIST_FILES,
    HOT_CONFIG_REPO_FILES,
    WWW_FILES,
    build_version_json,
    check_build_stats,
    check_dist_matches_package,
    check_gitee_mirror,
    check_hot_config,
    check_hot_content,
    check_theme_colors,
    check_www_version,
    load_env,
    local_sha256,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = load_env(os.path.join(ROOT, '.env'))

# 实例与部署目录：.env 可覆盖，默认值取自现网布局
INSTANCE_ID = ENV.get('SERVER_INSTANCE_ID', 'i-2zeeo1jt2not5iri8b14')
DEPLOY_PATH = ENV.get('SERVER_DEPLOY_PATH', '/www/wwwroot/www.asifadeaway.com/UserScripts/bilibili')
REMOTE_WWW_DIR = f'{DEPLOY_PATH}/www'
REMOTE_API_DIR = f'{DEPLOY_PATH}/api'

# workbench CLI 位置
def find_workbench():
    candidates = [
        os.environ.get('WORKBENCH_CLI', ''),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'workbench', 'workbench.exe'),
        os.path.join(os.path.expanduser('~'), 'AppData', 'Local', 'Programs', 'workbench', 'workbench.exe'),
        'workbench'
    ]
    for candidate in candidates:
        if candidate and (os.path.isfile(candidate) or candidate == 'workbench'):
            return candidate
    sys.exit('找不到 workbench CLI（可用 WORKBENCH_CLI 环境变量指定路径）')


WORKBENCH = find_workbench()


def wb(args, timeout=300):
    """跑 workbench CLI，返回解析后的 JSON"""
    result = subprocess.run([WORKBENCH] + args + ['--output', 'json'], capture_output=True, text=True,
                            timeout=timeout, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or '').strip()[-300:])
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {'raw': result.stdout}


def remote_sha256(remote_path):
    """取远端文件 sha256（不存在返回空串）"""
    payload = wb(['exec', '-i', INSTANCE_ID, '-c',
                  f"sha256sum '{remote_path}' 2>/dev/null | cut -d' ' -f1 || true"], timeout=120)
    stdout = (payload.get('stdout') or '').strip()
    return stdout.split()[0] if stdout else ''


def remote_size(remote_path):
    payload = wb(['exec', '-i', INSTANCE_ID, '-c', f"wc -c < '{remote_path}' 2>/dev/null || echo -1"], timeout=120)
    try:
        return int((payload.get('stdout') or '-1').strip())
    except ValueError:
        return -1


def upload_file(local_path, remote_path, owner=None, mode=None):
    """上传单个文件（先比 sha256，无变更就跳过），上传后校验 sha256 并修正属主/权限"""
    if not os.path.isfile(local_path):
        print(f'跳过 {os.path.basename(local_path)}：本地文件不存在')
        return True
    local_hash = local_sha256(local_path)
    local_size = os.path.getsize(local_path)
    if remote_sha256(remote_path) == local_hash:
        print(f'无变更 {os.path.basename(remote_path)}（{local_size} bytes，sha256 {local_hash[:12]}…）')
        return True
    print(f'上传 {os.path.basename(local_path)} → {remote_path}（{local_size} bytes）')
    wb(['upload', local_path, remote_path, '-i', INSTANCE_ID, '--force'], timeout=600)
    got = remote_sha256(remote_path)
    if got != local_hash:
        print(f'✗ 验证失败 {remote_path}：本地 {local_hash[:12]}… 远端 {(got or "无")[:12]}…')
        return False
    # 属主/权限：跟现网保持一致（脚本产物 www:www 755，其余 root:root 644）
    if owner or mode:
        chown = f"chown {owner or 'root:root'} '{remote_path}' && chmod {mode or '644'} '{remote_path}'"
        wb(['exec', '-i', INSTANCE_ID, '-c', chown], timeout=120)
    print(f'✓ {os.path.basename(remote_path)} {local_size} bytes sha256 {local_hash[:12]}…')
    return True


def main():
    root = ROOT
    print('=== 门禁（与 upload.py 同一套）===')
    if not check_hot_content(root):
        sys.exit('发现硬编码的可热更内容，已中止（未上传任何文件）')
    if not check_www_version(root):
        sys.exit('www 落地页未与当前版本同步，已中止（未上传任何文件）')
    if not check_theme_colors(root):
        sys.exit('存在字面色值，已中止（未上传任何文件）')
    prompt_only = os.environ.get('HOT_ONLY', os.environ.get('PROMPT_ONLY')) == '1'
    if not check_dist_matches_package(root, require_fresh=not prompt_only):
        sys.exit('构建产物与当前版本不同步，已中止（未上传任何文件）')
    if not check_hot_config(root):
        sys.exit('热更资产校验失败，已中止（未上传任何文件）')

    print(f'\n目标：实例 {INSTANCE_ID}  部署目录 {DEPLOY_PATH}')
    ok = True

    if prompt_only:
        print('--- 热更模式：只更新 hot-config/，不动脚本产物 ---')
        for name in HOT_CONFIG_DIST_FILES:
            ok &= upload_file(os.path.join(root, 'dist', HOT_CONFIG_DIR, name),
                              f'{DEPLOY_PATH}/{HOT_CONFIG_DIR}/{name}', 'root:root', '644')
        for name in HOT_CONFIG_REPO_FILES:
            ok &= upload_file(os.path.join(root, HOT_CONFIG_DIR, name),
                              f'{DEPLOY_PATH}/{HOT_CONFIG_DIR}/{name}', 'root:root', '644')
        sys.exit(0 if ok else 1)

    print('--- 上传 dist 构建产物 ---')
    if not check_build_stats(root):
        sys.exit('产物体积超出预算，已中止（未上传任何文件）')
    for name in DIST_FILES:
        ok &= upload_file(os.path.join(root, 'dist', name), f'{DEPLOY_PATH}/{name}', 'www:www', '755')

    print('\n--- 上传 version.json ---')
    info = build_version_json(root, os.path.join(root, 'dist', 'bilibili-adjustment.meta.js'),
                              os.path.join(root, 'dist', 'bilibili-adjustment.user.js'))
    version_json_path = os.path.join(root, 'dist', 'version.json')
    with open(version_json_path, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print(f"v{info['version']} sha={info['sha']} size={info['size']} sha256={info['sha256'][:12]}…")
    ok &= upload_file(version_json_path, f'{DEPLOY_PATH}/version.json', 'root:root', '644')

    print('\n--- 上传热更资产（hot-config/）---')
    for name in HOT_CONFIG_DIST_FILES:
        ok &= upload_file(os.path.join(root, 'dist', HOT_CONFIG_DIR, name),
                          f'{DEPLOY_PATH}/{HOT_CONFIG_DIR}/{name}', 'root:root', '644')
    for name in HOT_CONFIG_REPO_FILES:
        ok &= upload_file(os.path.join(root, HOT_CONFIG_DIR, name),
                          f'{DEPLOY_PATH}/{HOT_CONFIG_DIR}/{name}', 'root:root', '644')

    print('\n--- 校验 Gitee 镜像 ---')
    check_gitee_mirror(info['version'], os.environ.get('GITEE_PERSONAL_TOKEN') or ENV.get('GITEE_PERSONAL_TOKEN', ''))

    print('\n--- 上传 www 落地页 ---')
    for name in WWW_FILES:
        ok &= upload_file(os.path.join(root, 'www', name), f'{REMOTE_WWW_DIR}/{name}', 'root:root', '644')

    print('\n--- 上传 API 接口 ---')
    for name in API_FILES:
        ok &= upload_file(os.path.join(root, 'scripts', name), f'{REMOTE_API_DIR}/{name}', 'www:www', '644')

    print('\n发布完成' + ('（全部文件校验通过）' if ok else '（有文件校验失败，见上）'))
    print(f"版本 v{info['version']} 构建 {info['sha']} 时间 {datetime.datetime.now().astimezone().isoformat(timespec='seconds')}")
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
