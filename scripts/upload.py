#!/usr/bin/env python3
"""SCP 上传 dist 产物 + version.json + www 落地页 + API 接口到轻量服务器

用法：python scripts/upload.py
前置：先执行 npm run build 生成 dist/bilibili-adjustment.{user,meta}.js
凭据：读取项目根 .env 的 SERVER_HOST / SERVER_USER / SERVER_SSH_KEY / SERVER_DEPLOY_PATH
      （可选 GITEE_PERSONAL_TOKEN：仅本脚本用于提高 Gitee API 读取限额，**绝不进用户脚本**）

version.json：从构建产物元数据里抄 @version 与 @build-sha，供脚本端做「同版本覆盖发布」兜底
（版本号没变但线上内容变了 → 提示用户重新安装）。字段与产物同源，不可能不一致。
Gitee 镜像校验：脚本端在 GitHub 不可达时会回退读 Gitee API，故这里确认镜像已同步到本版本。
"""
import base64
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

# Windows 控制台默认编码是 GBK：直接打印 ⚠ 这类非 GBK 字符会抛 UnicodeEncodeError 并把上传脚本打断
# （2026-09-24 实测：Gitee 未同步的那条警告让脚本中途退出，后面的 www 落地页/API 步骤直接没跑）。
# 统一把标准输出改成 UTF-8 + 出错替换：最坏只是控制台显示乱码，绝不会再因"打印"而中断上传。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

# 脚本端回退源用的 Gitee 仓库（镜像）
GITEE_REPO = 'aiideai/Bilibili-Adjustment'

# dist 构建产物
DIST_FILES = [
    'bilibili-adjustment.user.js',
    'bilibili-adjustment.meta.js',
]

# 远程提示词/覆盖表等「热更资产」目录（服务器上 meta.js 同级的子目录）
HOT_CONFIG_DIR = 'hot-config'
# 热更资产：dist/hot-config/<生成物> 与仓库 hot-config/<人工维护>
HOT_CONFIG_DIST_FILES = ['ad-detection-prompt.js']
HOT_CONFIG_REPO_FILES = ['selectors.js', 'ai-providers.js', 'regexps.js', 'templates.js', 'themes.js']

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
        # 注意：这里按大小比对，会漏掉「改了字符但字节数不变」的编辑（例如 60px -> 58px）。
        # 需要强制全部上传时，设置环境变量 UPLOAD_FORCE=1。
        if local_size != remote_size or os.environ.get('UPLOAD_FORCE') == '1':
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


def build_version_json(root, meta_path, user_path):
    """从构建产物元数据生成 version.json 内容（version/sha 与产物同源）"""
    with open(meta_path, encoding='utf-8') as f:
        meta = f.read()
    version_match = re.search(r'//\s*@version\s+([\d.]+)', meta)
    if not version_match:
        sys.exit('无法从 ' + meta_path + ' 解析 @version')
    sha_match = re.search(r'//\s*@build-sha\s+(\S+)', meta)
    with open(user_path, 'rb') as f:
        content = f.read()
    return {
        'version': version_match.group(1),
        'sha': sha_match.group(1) if sha_match else '',
        'builtAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'size': len(content),
        'sha256': hashlib.sha256(content).hexdigest(),
    }


def check_gitee_mirror(local_version, token):
    """校验 Gitee 镜像是否已同步到本版本（脚本端的兜底源不能是旧版本）

    只读公开 API，不写入；镜像落后时仅告警，不影响上传结果。
    token 仅用于提高读取限额，只在本机脚本里使用。
    """
    url = f'https://gitee.com/api/v5/repos/{GITEE_REPO}/contents/package.json'
    if token:
        url += '?' + urllib.parse.urlencode({'access_token': token})
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'bilibili-adjustment-upload'})
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode('utf-8'))
        content = base64.b64decode(payload.get('content', '')).decode('utf-8')
        remote_version = json.loads(content).get('version', '')
    except Exception as error:  # 网络/限流等一律忽略，不能因此让发布失败
        print(f'Gitee 镜像校验跳过（{type(error).__name__}: {error}）')
        return
    if remote_version == local_version:
        print(f'Gitee 镜像已同步 v{remote_version}')
    else:
        print(f'⚠️ Gitee 镜像版本 {remote_version or "未知"} ≠ 本地 v{local_version}：'
              f'镜像未同步，GitHub 不可达的用户会读到旧版本（请同步 Gitee 仓库）')


def upload_hot_config(scp_cmd, ssh_cmd, root, remote_dir, user, host):
    """上传「热更资产」到服务器 hot-config/ 目录（提示词 + 五张覆盖表）

    这些文件让「改配置」不必发版：脚本运行时优先读它们，拉不到再回退内置值。
    """
    remote_hot_dir = f'{remote_dir}/{HOT_CONFIG_DIR}'
    mkdir_cmd = ssh_cmd + [f'{user}@{host}', f'mkdir -p {remote_hot_dir}']
    subprocess.run(mkdir_cmd, capture_output=True, text=True, timeout=30,
                   encoding='utf-8', errors='replace')
    ok = True
    # 1) 生成物（提示词：由 npm run build 或本脚本的 HOT_ONLY 模式生成）
    for name in HOT_CONFIG_DIST_FILES:
        local_path = os.path.join(root, 'dist', HOT_CONFIG_DIR, name)
        if not os.path.isfile(local_path):
            print(f'⚠️ 缺少 dist/{HOT_CONFIG_DIR}/{name}（请先 npm run build 或 npm run build:hot-config），跳过')
            ok = False
            continue
        if name == 'ad-detection-prompt.js':
            try:
                with open(local_path, encoding='utf-8') as handle:
                    meta = json.loads(handle.read())
                print(f"提示词资产：v{meta.get('version', '?')} #{meta.get('hash', '?')} "
                      f"{len(meta.get('prompt', ''))} 字（生成于 {meta.get('updatedAt', '?')}）")
            except Exception as error:
                print(f'⚠️ {name} 无法解析（{error}）')
                ok = False
                continue
        size = os.path.getsize(local_path)
        remote_path = f'{remote_hot_dir}/{name}'
        if not upload_file(scp_cmd, local_path, user, host, remote_path):
            ok = False
            continue
        remote_size = get_remote_size(ssh_cmd, user, host, remote_path)
        if remote_size == size:
            print(f'OK {HOT_CONFIG_DIR}/{name} {size} bytes')
        else:
            print(f'验证失败 {HOT_CONFIG_DIR}/{name} local={size} remote={remote_size}')
            ok = False
    # 2) 人工维护的覆盖表（仓库 hot-config/ 原样上传）
    for name in HOT_CONFIG_REPO_FILES:
        local_path = os.path.join(root, HOT_CONFIG_DIR, name)
        if not os.path.isfile(local_path):
            print(f'⚠️ 缺少 {HOT_CONFIG_DIR}/{name}，跳过')
            ok = False
            continue
        try:
            with open(local_path, encoding='utf-8') as handle:
                data = json.loads(handle.read())
            entries = data.get('overrides') or {}
            print(f'{name}：{len(entries)} 条覆盖' + (f'（{", ".join(entries)}）' if entries else '（当前为空，不影响识别）'))
        except Exception as error:
            print(f'⚠️ {HOT_CONFIG_DIR}/{name} 不是合法 JSON（{error}），已跳过')
            ok = False
            continue
        size = os.path.getsize(local_path)
        remote_path = f'{remote_hot_dir}/{name}'
        if not upload_file(scp_cmd, local_path, user, host, remote_path):
            ok = False
            continue
        remote_size = get_remote_size(ssh_cmd, user, host, remote_path)
        if remote_size == size:
            print(f'OK {HOT_CONFIG_DIR}/{name} {size} bytes')
        else:
            print(f'验证失败 {HOT_CONFIG_DIR}/{name} local={size} remote={remote_size}')
            ok = False
    return ok


def check_hot_config(root):
    """上传前用「运行时同一套校验代码」过一遍热更资产（写错的值在用户侧是静默丢弃，必须在这里拦住）"""
    print('--- 校验热更资产（发布侧，与运行时同一套规则）---')
    result = subprocess.run(
        ['node', '--import', './test/alias-loader.js', os.path.join('scripts', 'check-hot-config.mjs')],
        cwd=root, capture_output=True, text=True, timeout=120,
        encoding='utf-8', errors='replace')
    print((result.stdout or '').strip() or (result.stderr or '').strip())
    return result.returncode == 0


def check_hot_content(root):
    """上传前拦住"把可热更内容写死在代码里"（选择器/结构正则/注入模板），否则只能等发版才能修"""
    print('--- 校验无硬编码的可热更内容（选择器/结构正则）---')
    result = subprocess.run(
        ['node', os.path.join('scripts', 'check-hot-content.mjs')],
        cwd=root, capture_output=True, text=True, timeout=120,
        encoding='utf-8', errors='replace')
    print((result.stdout or '').strip() or (result.stderr or '').strip())
    return result.returncode == 0


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

    # ========== 硬编码门禁：可热更内容必须走热更表，不能写死在代码里 ==========
    # （两种上传模式都先过这一关：写死的东西只能等发版才能修，属于发布前必须拦住的债）
    if not check_hot_content(root):
        sys.exit('发现硬编码的可热更内容，已中止（未上传任何文件）')

    # ========== 提示词热更模式：只生成并上传提示词，不动脚本产物 ==========
    # 用途：改了提示词但不想让用户更新脚本（也就不会触发「同版本内容已更新」的重新安装提示）
    prompt_only = os.environ.get('HOT_ONLY', os.environ.get('PROMPT_ONLY')) == '1'
    if prompt_only:
        print('--- 热更模式（HOT_ONLY=1，PROMPT_ONLY=1 为旧名）：只重新生成并上传 hot-config/ 资产，不动脚本产物 ---')
        generated = subprocess.run(['node', os.path.join(root, 'scripts', 'build-hot-config.mjs')],
                                   capture_output=True, text=True, timeout=120,
                                   encoding='utf-8', errors='replace')
        print((generated.stdout or '').strip() or (generated.stderr or '').strip())
        if generated.returncode != 0:
            sys.exit('热更资产生成失败，已中止（未上传任何文件）')
        if not check_hot_config(root):
            sys.exit('热更资产校验失败，已中止（未上传任何文件）')
        if not upload_hot_config(scp_cmd, ssh_cmd, root, remote_dir, user, host):
            ok = False
        sys.exit(0 if ok else 1)

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

    # ========== 生成并上传 version.json（供脚本端同版本覆盖发布兜底） ==========
    version_json_path = os.path.join(root, 'dist', 'version.json')
    info = build_version_json(root, os.path.join(root, 'dist', 'bilibili-adjustment.meta.js'),
                             os.path.join(root, 'dist', 'bilibili-adjustment.user.js'))
    with open(version_json_path, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print(f"\n--- 上传 version.json ---")
    print(f"v{info['version']} sha={info['sha']} size={info['size']} sha256={info['sha256'][:12]}…")
    version_remote = f'{remote_dir}/version.json'
    if upload_file(scp_cmd, version_json_path, user, host, version_remote):
        remote_size = get_remote_size(ssh_cmd, user, host, version_remote)
        local_size = os.path.getsize(version_json_path)
        if remote_size == local_size:
            print(f'OK version.json {local_size} bytes')
        else:
            print(f'验证失败 version.json local={local_size} remote={remote_size}')
            ok = False
    else:
        ok = False

    # ========== 上传远程热更资产（脚本运行时优先读它们） ==========
    print('\n--- 上传热更资产（hot-config/）---')
    if not check_hot_config(root):
        sys.exit('热更资产校验失败，已中止（脚本产物与 version.json 已上传，热更资产未上传）')
    if not upload_hot_config(scp_cmd, ssh_cmd, root, remote_dir, user, host):
        ok = False

    # ========== 校验 Gitee 镜像新鲜度（脚本端 GitHub 兜底源） ==========
    print('\n--- 校验 Gitee 镜像 ---')
    check_gitee_mirror(info['version'], os.environ.get('GITEE_PERSONAL_TOKEN') or env.get('GITEE_PERSONAL_TOKEN', ''))

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

