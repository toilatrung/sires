# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Empty eval report skeleton (NFR-EVAL-003): sections by agent and by provider, model, prompt version.

The skeleton lists every metric (a)–(e) of NFR-EVAL-003 in every section with no value; the harness (PID-00129)
fills values, baselines and the list of results that disagree with the expert labels (each one links to its Eval
Trace). Run from ``eval/`` on a converted dataset::

    uv run python -m sires_eval.report build/datasets/sample
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .datasets import load_jsonl

REPORT_FORMAT_VERSION = 1
# Agents the harness runs (NFR-EVAL-001) and the three MVP providers (REL-06).
AGENTS: tuple[str, ...] = ("Retrieval Agent", "Synthesis Agent", "Verification Agent", "Writing Agent")
PROVIDERS: tuple[str, ...] = ("Claude", "OpenAI", "Gemini")
NO_TARGET = "Ghi làm baseline, chưa gắn ngưỡng (Assumption, NFR-EVAL-003)"
EMPTY = "chưa có số liệu"


@dataclass(frozen=True)
class Metric:
    id: str
    group: str  # letter of NFR-EVAL-003
    name: str
    source: str
    target: str | None  # acceptance threshold from the PRD; None = baseline only


METRICS: tuple[Metric, ...] = (
    Metric(
        "kpi_01", "a", "KPI-01: tỷ lệ claim có evidence liên kết hợp lệ", "NFR-EVAL-003 (a), TS-13-02", "≥ 95% (REL-03)"
    ),
    Metric(
        "kpi_02",
        "a",
        "KPI-02: tỷ lệ citation key phân giải về Trusted Reference",
        "NFR-EVAL-003 (a), TS-13-03",
        "= 100% (REL-03)",
    ),
    Metric(
        "support_agreement",
        "b",
        "Tỷ lệ khớp mức hỗ trợ với nhãn chuyên gia",
        "NFR-EVAL-003 (b), TS-13-08",
        "≥ 85% (REL-10)",
    ),
    Metric("supported_precision", "b", "Precision của nhãn Supported", "NFR-EVAL-003 (b)", None),
    Metric(
        "citation_mismatch_detection",
        "c",
        "Tỷ lệ phát hiện citation không khớp nguồn",
        "NFR-EVAL-003 (c), TS-13-09",
        "≥ 95% (REL-10)",
    ),
    Metric(
        "retrieval_recall",
        "d",
        "Recall của retrieval trên evidence đã gán nhãn",
        "NFR-EVAL-003 (d), OQ-096, DEC-45",
        None,
    ),
    Metric("usage", "e", "Usage (NFR-USAGE-001)", "NFR-EVAL-003 (e)", None),
    Metric("latency", "e", "Độ trễ", "NFR-EVAL-003 (e)", None),
)


def _dataset(data: dict[str, Any]) -> dict[str, Any]:
    manifest = data["manifest"]
    topics = manifest.get("topics", [])
    return {
        "source_dir": manifest.get("source_dir"),
        "format_version": manifest.get("format_version"),
        "topics": topics,
        # Topics with evidence labels: the only ones metric (d) is measured on (DEC-45).
        "evidence_topics": [t["topic_id"] for t in topics if t.get("has_evidence")],
        "counts": manifest.get("counts", {}),
    }


def build_skeleton(data: dict[str, Any], providers: tuple[str, ...] = PROVIDERS) -> dict[str, Any]:
    """Report with one section per (agent, provider); model and prompt version are unknown until a run."""
    return {
        "report_format_version": REPORT_FORMAT_VERSION,
        "status": "skeleton",
        "status_note": f"Khung rỗng, {EMPTY}: harness chưa chạy (PID-00129).",
        "run": {"run_id": None, "started_at": None, "finished_at": None},
        "dataset": _dataset(data),
        "metrics": [
            {"id": m.id, "group": m.group, "name": m.name, "source": m.source, "target": m.target or NO_TARGET}
            for m in METRICS
        ],
        "sections": [
            {
                "agent": agent,
                "provider": provider,
                "model": None,
                "prompt_version": None,
                "metrics": {m.id: {"value": None, "baseline": None} for m in METRICS},
                # Each result that disagrees with the expert label: topic_id, item id, expected, actual, eval_trace_id.
                "mismatches": [],
            }
            for agent in AGENTS
            for provider in providers
        ],
    }


def _cell(value: Any) -> str:
    return "—" if value is None else str(value)


def render_markdown(report: dict[str, Any]) -> str:
    dataset = report["dataset"]
    lines = [
        "# Báo cáo eval",
        "",
        f"**Trạng thái:** {report['status_note']}",
        "",
        f"## Bộ dữ liệu `{_cell(dataset['source_dir'])}`",
        "",
        "| Đề tài | Lĩnh vực | Reference | Claim | Citation | Evidence |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for topic in dataset["topics"]:
        counts = topic.get("counts", {})
        lines.append(
            f"| {_cell(topic.get('topic_id'))} | {_cell(topic.get('discipline'))} | {counts.get('references', 0)} | "
            f"{counts.get('claims', 0)} | {counts.get('citations', 0)} | {counts.get('evidence', 0)} |"
        )
    evidence_topics = ", ".join(dataset["evidence_topics"]) or "chưa có (metric (d) không đo được)"
    lines += ["", f"Đề tài có nhãn evidence: {evidence_topics}.", "", "## Metric (NFR-EVAL-003)", ""]
    lines += ["| Mã | Nhóm | Metric | Nguồn | Ngưỡng |", "| --- | --- | --- | --- | --- |"]
    lines += [
        f"| `{m['id']}` | ({m['group']}) | {m['name']} | {m['source']} | {m['target']} |" for m in report["metrics"]
    ]
    metric_ids = [m["id"] for m in report["metrics"]]
    for agent in dict.fromkeys(s["agent"] for s in report["sections"]):
        lines += ["", f"## {agent}", ""]
        lines.append("| Provider | Model | Phiên bản prompt | " + " | ".join(f"`{i}`" for i in metric_ids) + " |")
        lines.append("| --- | --- | --- | " + " | ".join("---" for _ in metric_ids) + " |")
        sections = [s for s in report["sections"] if s["agent"] == agent]
        for section in sections:
            values = " | ".join(_cell(section["metrics"][i]["value"]) for i in metric_ids)
            lines.append(
                f"| {section['provider']} | {_cell(section['model'])} | {_cell(section['prompt_version'])} | {values} |"
            )
        mismatches = sum(len(s["mismatches"]) for s in sections)
        lines += ["", f"Kết quả lệch nhãn chuyên gia: {mismatches or EMPTY}."]
    return "\n".join(lines) + "\n"


def write_report(jsonl_dir: Path | str, out: Path | str, providers: tuple[str, ...] = PROVIDERS) -> dict[str, Any]:
    report = build_skeleton(load_jsonl(jsonl_dir), providers)
    target = Path(out)
    target.mkdir(parents=True, exist_ok=True)
    (target / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    (target / "report.md").write_text(render_markdown(report), encoding="utf-8", newline="\n")
    return report


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m sires_eval.report", description="Dựng khung báo cáo eval rỗng.")
    parser.add_argument("jsonl_dir", type=Path, help="Thư mục JSONL do python -m sires_eval.datasets convert tạo.")
    parser.add_argument("--out", type=Path, default=None, help="Thư mục ghi report.json, report.md.")
    parser.add_argument(
        "--provider", action="append", default=None, help="Provider (lặp lại); mặc định ba provider MVP."
    )
    args = parser.parse_args(argv)
    try:
        data = load_jsonl(args.jsonl_dir)
    except FileNotFoundError as exc:
        print(f"LỖI  {exc}")
        return 1
    out = args.out or Path("build") / "reports" / str(data["manifest"].get("source_dir") or args.jsonl_dir.name)
    write_report(args.jsonl_dir, out, tuple(args.provider) if args.provider else PROVIDERS)
    print(f"Đã ghi khung báo cáo vào {out} (report.json, report.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
