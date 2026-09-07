#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主题迁移静态断言（docs/theme-system.md §7 阶段4 / R6）：
检查 src 下所有 .js 是否残留「字面色值」，保证样式全部走 var(--adj-*) 主题变量。

允许的例外：
- src/shared/theme/：变量定义唯一来源（token 值）
- logger.service.js：console %c 输出配色（开发者日志，非 UI）
- SVG/HTML 中 fill="#" 属性：B 站官方克隆控件原色（跟随官方，见方案 §2）
- 注释中的色值说明
用法：python scripts/check-theme-colors.py；退出码 0=通过，1=存在残留
"""
import os
import re
import sys

HEX = re.compile(r'#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b')
RGB = re.compile(r'rgba?\([^)]*\)')
ALLOW_DIR = ('theme',)
ALLOW_FILE = ('logger.service.js',)


def has_literal_color(line):
    """行内是否含未被 var() 包裹的字面色值"""
    if not (HEX.search(line) or RGB.search(line)):
        return False
    # 把合法 var(--adj-*) / rgba(var(--adj-x),a) 摘除后再判定
    cleaned = RGB.sub('X', line)
    cleaned = re.sub(r'var\(--adj-[\w-]+\)', 'Y', cleaned)
    return bool(HEX.search(cleaned) or RGB.search(cleaned))


def main(root):
    hits = []
    for base, _, files in os.walk(root):
        for f in files:
            if not f.endswith('.js'):
                continue
            fp = os.path.join(base, f)
            rel = os.path.relpath(fp, root).replace('\\', '/')
            parts = rel.split('/')
            if len(parts) > 1 and parts[1] in ALLOW_DIR:
                continue
            if f in ALLOW_FILE:
                continue
            for i, ln in enumerate(open(fp, encoding='utf-8').read().splitlines(), 1):
                s = ln.lstrip()
                if s.startswith('//') or s.startswith('*') or s.startswith('/*'):
                    continue
                if 'fill=' in ln:
                    continue  # 官方克隆控件 fill 属性
                if has_literal_color(ln):
                    hits.append((rel, i, ln.strip()[:140]))
    if hits:
        print(f'[check-theme-colors] 发现 {len(hits)} 处残留字面色值（应改为 var(--adj-*)，例外见脚本头部说明）：')
        for rel, i, t in hits:
            print(f'  {rel}:{i}: {t}')
        return 1
    print('[check-theme-colors] 通过：src 下无残留字面色值（主题变量全覆盖）')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'src'))
