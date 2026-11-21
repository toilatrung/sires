# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Command line for the PO and QA: ``python -m sires_eval.datasets check|convert <folder>``.

Exit code 0 when there is no error (warnings allowed), 1 when the dataset has errors, 2 on wrong usage.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from .convert import DatasetInvalid, convert
from .validate import ValidationResult, validate


def _print(result: ValidationResult) -> None:
    for issue in result.issues:
        print(issue.format())
    for line in result.summary():
        print(line)


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")  # Vietnamese messages on a Windows console
    parser = argparse.ArgumentParser(
        prog="python -m sires_eval.datasets", description="Kiểm và chuyển bộ dữ liệu nghiệm thu."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="Kiểm bộ CSV, báo lỗi theo file, dòng, cột.")
    check.add_argument("folder", type=Path, help="Thư mục một đề tài hoặc thư mục chứa các đề tài.")
    conv = sub.add_parser("convert", help="Kiểm rồi chuyển sang JSONL cho harness (chỉ khi không có lỗi).")
    conv.add_argument("folder", type=Path)
    conv.add_argument("--out", type=Path, default=None, help="Thư mục kết quả; mặc định build/datasets/<tên bộ>.")
    args = parser.parse_args(argv)

    if args.command == "check":
        result = validate(args.folder)
        _print(result)
        return 0 if result.ok else 1
    try:
        conversion = convert(args.folder, args.out)
    except DatasetInvalid as exc:
        _print(exc.result)
        print("Chưa chuyển sang JSONL: sửa các lỗi trên rồi chạy lại.")
        return 1
    except ValueError as exc:
        print(f"LỖI  {exc}")
        return 2
    _print(conversion.result)
    counts = ", ".join(f"{v} {k}" for k, v in conversion.counts.items())
    print(f"Đã ghi JSONL vào {conversion.out}: {counts}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
