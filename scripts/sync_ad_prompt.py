# -*- coding: utf-8 -*-
"""把脚本仓库的提示词真源同步到平台仓库的 rules/*.md。

背景：提示词有**两份消费者**——用户脚本（Bilibili-Adjustment）与云端平台
（Bilibili-Adplatform）。它们要落到同一个 ad-cache.db，判定标准必须完全一致，
否则会出现「脚本认为是广告、平台认为不是」的矛盾。所以真源只有一处：

    src/shared/ad-detection-prompt.ts
      ├─ AD_DETECTION_PROMPT         → 平台 rules/ad_detection_prompt.md
      └─ AD_DETECTION_PROMPT_WINDOW  → 平台 rules/ad_detection_prompt_window.md

（本脚本曾一度从仓库里消失，而 AGENTS.md 仍在引用它，于是"真源"名存实亡——
两边的边界规则真的漂移过。恢复它是为了让 `--check` 能被 CI/人工随时跑起来。）

用法：
    python scripts/sync_ad_prompt.py            # 写入平台仓库
    python scripts/sync_ad_prompt.py --check     # 只比对，不一致则退出码 1
    python scripts/sync_ad_prompt.py --print     # 打印将写入的内容
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'src' / 'shared' / 'ad-detection-prompt.ts'
PLATFORM_RULES = HERE.parents[2] / 'Bilibili-Adplatform' / 'rules'

BANNER = (
    '<!-- 本文件由脚本仓库 src/shared/ad-detection-prompt.ts 同步生成，请勿手改。\n'
    '     同步：cd Bilibili-Adjustment && python scripts/sync_ad_prompt.py\n'
    '     单一真源在脚本仓库；改提示词请改那里再同步，避免平台与脚本判定不一致。 -->\n'
    '\n'
)

# 常量名 → 目标文件名
TARGETS = {
    'AD_DETECTION_PROMPT': 'ad_detection_prompt.md',
    'AD_DETECTION_PROMPT_WINDOW': 'ad_detection_prompt_window.md',
}


def extract(name: str) -> str:
    """取出 `export const NAME = `...`;` 里模板字面量的**原始内容**。

    刻意不做反转义：真源里反引号写成 \\` ，而平台 md 里也一直是 \\` ——
    保持原样才能与历史产物逐字节一致（模型看到的是同一种写法）。
    模板字面量内部不可能出现裸反引号（必须转义），所以第一个裸反引号即结尾。
    """
    text = SRC.read_text(encoding='utf-8')
    # 内容里含有**转义的反引号**（\\`）—— 必须显式放行，否则非贪婪的 .*? 会停在
    # 第一个 \\` 上（实测第一版就是这样：窗口提示词只抽出 972 字节）。
    pattern = re.compile(
        r'^export\s+const\s+%s\s*=\s*`((?:\\`|[^`])*)`\s*;?\s*$' % re.escape(name),
        re.MULTILINE | re.DOTALL)
    match = pattern.search(text)
    if not match:
        raise SystemExit('未在 %s 中找到常量 %s' % (SRC, name))
    return match.group(1).rstrip('\n')
    # 去掉模板字面量末尾的换行：历史产物（旧 sync 脚本写的）末尾就没有换行，
    # 保持逐字节一致，`--check` 才能当等号用。


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='只比对，不写入')
    parser.add_argument('--print', dest='do_print', action='store_true', help='打印内容')
    args = parser.parse_args()

    if not SRC.exists():
        raise SystemExit('提示词真源不存在：%s' % SRC)

    rc = 0
    for name, filename in TARGETS.items():
        content = BANNER + extract(name)
        target = PLATFORM_RULES / filename
        if args.do_print:
            print('==== %s ====' % filename)
            print(content)
            continue
        current = target.read_text(encoding='utf-8') if target.exists() else None
        if args.check:
            if current == content:
                print('一致  %s' % filename)
            else:
                rc = 1
                print('**不一致** %s（平台副本 %s）' % (
                    filename,
                    '缺失' if current is None else '%d 字节 vs 真源 %d 字节'
                    % (len(current.encode('utf-8')), len(content.encode('utf-8')))))
            continue
        if current == content:
            print('无变化  %s' % filename)
            continue
        target.write_text(content, encoding='utf-8', newline='\n')
        print('已同步  %s（%d 字节）' % (filename, len(content.encode('utf-8'))))
    return rc


if __name__ == '__main__':
    sys.exit(main())
