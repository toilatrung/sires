# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00033 S03 — empty report skeleton (AC04, NFR-EVAL-003)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from eval_support import SAMPLE

from sires_eval.datasets import convert, load_jsonl
from sires_eval.report import AGENTS, METRICS, PROVIDERS, build_skeleton, main, render_markdown, write_report


@pytest.fixture
def sample_jsonl(tmp_path: Path) -> Path:
    return convert(SAMPLE, tmp_path / "jsonl").out


def test_report_skeleton(sample_jsonl: Path, tmp_path: Path) -> None:
    """PID-00033-AC04: from the sample JSONL the skeleton has sections by agent and provider, with no numbers yet."""
    report = build_skeleton(load_jsonl(sample_jsonl))

    assert report["status"] == "skeleton"
    assert AGENTS == ("Retrieval Agent", "Synthesis Agent", "Verification Agent", "Writing Agent")
    assert PROVIDERS == ("Claude", "OpenAI", "Gemini")
    sections = report["sections"]
    assert [(s["agent"], s["provider"]) for s in sections] == [(a, p) for a in AGENTS for p in PROVIDERS]
    # Metrics (a)–(e) of NFR-EVAL-003 in every section, none measured.
    assert {m.group for m in METRICS} == {"a", "b", "c", "d", "e"}
    for section in sections:
        assert section["model"] is None and section["prompt_version"] is None
        assert list(section["metrics"]) == [m.id for m in METRICS]
        assert all(v == {"value": None, "baseline": None} for v in section["metrics"].values())
        assert section["mismatches"] == []
    targets = {m["id"]: m["target"] for m in report["metrics"]}
    assert targets["support_agreement"] == "≥ 85% (REL-10)"
    assert targets["citation_mismatch_detection"] == "≥ 95% (REL-10)"
    assert targets["retrieval_recall"].startswith("Ghi làm baseline, chưa gắn ngưỡng")

    dataset = report["dataset"]
    assert dataset["source_dir"] == "sample"
    assert dataset["evidence_topics"] == ["T01-MAU"]
    assert dataset["topics"][0]["counts"] == {"references": 4, "claims": 6, "citations": 7, "evidence": 6}

    markdown = render_markdown(report)
    for agent in AGENTS:
        assert f"## {agent}" in markdown
    for provider in PROVIDERS:
        assert markdown.count(f"| {provider} | — | — | " + " | ".join("—" for _ in METRICS) + " |") == len(AGENTS)
    assert "chưa có số liệu" in markdown

    out = tmp_path / "report"
    write_report(sample_jsonl, out)
    assert json.loads((out / "report.json").read_text(encoding="utf-8")) == report
    assert (out / "report.md").read_text(encoding="utf-8") == markdown


def test_report_cli(sample_jsonl: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tmp_path / "r"
    assert main([str(sample_jsonl), "--out", str(out), "--provider", "Claude"]) == 0
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert {s["provider"] for s in report["sections"]} == {"Claude"}
    assert len(report["sections"]) == len(AGENTS)
    assert main([str(tmp_path / "missing")]) == 1
    assert "không phải bộ JSONL" in capsys.readouterr().out
