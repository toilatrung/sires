# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""EC04 of SPK-01: check that no API key reached the evidence, the report or the spike code before submitting.

    python scan_secrets.py <file or folder> [...]

Looks for the exact values of the keys in the environment or the Dev machine's keys file (ANTHROPIC_API_KEY,
OPENAI_API_KEY, GEMINI_API_KEY / GOOGLE_API_KEY and the *_OFFICIAL keys), the host of each configured gateway, and
key-shaped strings (sk-ant-…, sk-…, AIza…). Prints only file, line and the kind of match, never the match itself.
Exit code 1 when anything is found.
"""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlsplit

from common import KEY_PATTERNS, PROVIDERS, base_url_for, official_key, read_key

SKIP_DIRS = {"__pycache__", ".git", "node_modules", ".venv"}


def files(paths: list[str]) -> list[Path]:
    out: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_file():
            out.append(path)
        elif path.is_dir():
            out += [p for p in path.rglob("*") if p.is_file() and not SKIP_DIRS & set(p.parts)]
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    keys = {p: k for p in PROVIDERS if (k := read_key(p))}
    keys |= {f"{p}-official": k for p in PROVIDERS if (k := official_key(p)) and k not in keys.values()}
    hosts = {h.lower() for p in PROVIDERS if (url := base_url_for(p)) and (h := urlsplit(url).hostname)}
    found = 0
    scanned = files(sys.argv[1:])
    for path in scanned:
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for no, line in enumerate(text.splitlines(), 1):
            for provider, key in keys.items():
                if key in line:
                    print(f"{path}:{no}: giá trị {provider} key")
                    found += 1
            if any(host in line.lower() for host in hosts):
                print(f"{path}:{no}: host của cổng trung gian")
                found += 1
            for name, pattern in KEY_PATTERNS.items():
                if pattern.search(line):
                    print(f"{path}:{no}: chuỗi có dạng {name}")
                    found += 1
    print(
        f"Đã quét {len(scanned)} file với {len(keys)} key ({', '.join(keys) or 'không có'}) và {len(hosts)} host "
        f"cổng: {found} chỗ khớp."
    )
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
