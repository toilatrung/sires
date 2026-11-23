# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Run Schemathesis against a local service fixture."""

import argparse
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]


def run_contract(schema: Path, url: str, extra: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "uv", "tool", "run", "--from", "schemathesis==4.6.0", "schemathesis", "run",
            str(schema), "--url", url, *extra,
        ],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("service", help="Tên file OpenAPI nội bộ, bỏ phần .yaml")
    parser.add_argument("url", help="URL của service test chạy trên loopback")
    args, flags = parser.parse_known_args()
    url = urlsplit(args.url)
    if url.hostname not in {"localhost", "127.0.0.1", "::1"} or url.scheme not in {"https", "http"}:
        parser.error("URL cần trỏ tới service test trên loopback.")
    spec_dir = ROOT / "docs" / "api-design" / "internal"
    spec = (spec_dir / f"{args.service}.yaml").resolve()
    if spec.parent != spec_dir or not spec.is_file():
        parser.error(f"Không tìm thấy OpenAPI nội bộ của {args.service}.")
    result = run_contract(spec, args.url, flags)
    print(result.stdout, end="")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
