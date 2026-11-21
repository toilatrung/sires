# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Convert a validated CSV dataset to the JSONL the harness reads (design notes: JSONL is generated, never edited).

Output folder (default ``build/datasets/<set name>``, ignored by Git)::

    manifest.json      format version, topics, counts, warnings at conversion time
    topics.jsonl       one line per topic
    references.jsonl   one line per reference, with topic_id
    claims.jsonl       one line per claim, with topic_id and support_label
    citations.jsonl    one line per citation, with topic_id and expected_outcome
    evidence.jsonl     one line per labelled evidence passage (empty when no topic has evidence.csv)

Every record keeps ``source`` = {"file", "row"} so a harness result can be traced back to the Excel row.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .reader import Issue
from .schema import FILES, LIST_SEPARATOR, FileSpec, Kind
from .validate import Topic, ValidationResult, validate

FORMAT_VERSION = 1
OUTPUTS: dict[str, str] = {
    "topic.csv": "topics.jsonl",
    "references.csv": "references.jsonl",
    "claims.csv": "claims.jsonl",
    "citations.csv": "citations.jsonl",
    "evidence.csv": "evidence.jsonl",
}
MANIFEST = "manifest.json"


class DatasetInvalid(Exception):
    """The CSV dataset has errors; nothing was written."""

    def __init__(self, result: ValidationResult) -> None:
        super().__init__(f"{len(result.errors)} lỗi trong bộ dữ liệu {result.root}")
        self.result = result


@dataclass(frozen=True)
class Conversion:
    out: Path
    result: ValidationResult
    counts: dict[str, int]


def default_out(root: Path) -> Path:
    return Path("build") / "datasets" / root.resolve().name


def _value(kind: Kind, raw: str) -> Any:
    if raw == "":
        return [] if kind is Kind.LIST else None
    if kind is Kind.INT:
        return int(raw)
    if kind is Kind.LIST:
        return [p.strip() for p in raw.split(LIST_SEPARATOR) if p.strip()]
    if kind is Kind.PATH:
        return raw.replace("\\", "/")
    return raw


def _records(topic: Topic, spec: FileSpec, topic_id: str) -> list[dict[str, Any]]:
    table = topic.tables.get(spec.name)
    if table is None:
        return []
    records = []
    for row in table.rows:
        record: dict[str, Any] = {} if spec.single_row else {"topic_id": topic_id}
        for column in spec.columns:
            record[column.name] = _value(column.kind, row.values.get(column.name, ""))
        record["source"] = {"file": table.file, "row": row.number}
        records.append(record)
    return records


def _issue_json(issue: Issue) -> dict[str, Any]:
    return {"code": issue.code, "file": issue.file, "row": issue.row, "column": issue.column, "message": issue.message}


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def convert(root: Path | str, out: Path | str | None = None) -> Conversion:
    """Validate ``root`` and, when it has no error, write the JSONL files to ``out``; raise DatasetInvalid otherwise."""
    root = Path(root)
    result = validate(root)
    if not result.ok:
        raise DatasetInvalid(result)
    target = Path(out) if out is not None else default_out(root)
    if _inside(target, root):
        raise ValueError(f"Thư mục kết quả {target} nằm trong bộ CSV {root}; chọn thư mục khác (JSONL không commit).")

    lines: dict[str, list[str]] = {name: [] for name in OUTPUTS.values()}
    for topic in result.topics:
        topic_id = topic.topic_id or ""
        for spec in FILES:
            for record in _records(topic, spec, topic_id):
                lines[OUTPUTS[spec.name]].append(json.dumps(record, ensure_ascii=False, sort_keys=False))

    target.mkdir(parents=True, exist_ok=True)
    for name, content in lines.items():
        (target / name).write_text("".join(f"{line}\n" for line in content), encoding="utf-8", newline="\n")
    counts = {name.removesuffix(".jsonl"): len(content) for name, content in lines.items()}
    manifest = {
        "format_version": FORMAT_VERSION,
        "source_dir": root.resolve().name,
        "topics": [
            {
                "topic_id": t.topic_id,
                "folder": t.name,
                "discipline": t.discipline,
                "has_evidence": t.count("evidence.csv") > 0,
                "counts": {OUTPUTS[s.name].removesuffix(".jsonl"): t.count(s.name) for s in FILES if not s.single_row},
            }
            for t in result.topics
        ],
        "counts": counts,
        "warnings": [_issue_json(i) for i in result.warnings],
    }
    (target / MANIFEST).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return Conversion(target, result, counts)


def load_jsonl(folder: Path | str) -> dict[str, Any]:
    """Read a converted dataset back: {"manifest": {...}, "topics": [...], "references": [...], ...}."""
    folder = Path(folder)
    manifest_path = folder / MANIFEST
    if not manifest_path.is_file():
        raise FileNotFoundError(f"{folder} không phải bộ JSONL đã chuyển (thiếu {MANIFEST}).")
    data: dict[str, Any] = {"manifest": json.loads(manifest_path.read_text(encoding="utf-8"))}
    for name in OUTPUTS.values():
        path = folder / name
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        data[name.removesuffix(".jsonl")] = [json.loads(line) for line in text.splitlines() if line.strip()]
    return data
