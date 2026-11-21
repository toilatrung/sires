# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Smoke tests of the SPK-08 spike (PID-00022): the measurement code keeps running; no latency threshold is asserted.

Collected by ``pnpm nx run agent-core:test``. The S02 test needs the clients generated from the contracts
(``pnpm nx run @sires/contracts:generate-python``) and is skipped without them.
"""

import json
from pathlib import Path
from typing import Any

import context_size
import jsonschema  # type: ignore[import-untyped]
import pytest
import spk08_contract
import spk08_stub
import spk08_synthetic as synthetic
import spk08_tokens as tokens

FIXED = (1, 2, 3)
TRIM_ORDER = ["L7", "L6", "L5", "L4"]


@pytest.fixture(scope="module")
def result() -> dict[str, Any]:
    return context_size.run(["typical", "ceiling"], 16384)


def test_upper_bound_is_never_below_the_estimate() -> None:
    for text in ["plain English text", "nghiên cứu dữ liệu tổng quan", r"\section{Kết quả} \cite{key}", ""]:
        size = tokens.measure(text)
        assert all(tokens.estimate(size, provider) <= tokens.upper_bound(size) for provider in tokens.RATIOS)


def test_ac01_every_agent_has_a_size_table_and_a_verdict_per_model(result: dict[str, Any]) -> None:
    profiles = result["profiles"]
    models = {m.model for m in context_size.load_models()}
    for data in profiles.values():
        assert set(data["agents"]) == set(synthetic.AGENTS)
        for info in data["agents"].values():
            assert {str(n) for n in synthetic.LAYERS} == set(info["layers"])
            assert {(f["model"], f["mode"]) for f in info["fits"]} == {(m, x) for m in models for x in ("estimate",
                                                                                                         "upper")}
    markdown = context_size.markdown(result)
    assert "vừa context window?" in markdown and "ca vượt" in markdown


def test_trimming_never_touches_layers_1_to_3_and_follows_prd_14_2_order(result: dict[str, Any]) -> None:
    profiles = result["profiles"]
    for data in profiles.values():
        for info in data["agents"].values():
            for item in info["fits"]:
                assert all(item["after"][n] == item["before"][n] for n in FIXED)
                order = [TRIM_ORDER.index(trim.split(" ")[0]) for trim in item["trims"]]
                assert order == sorted(order)
                if item["status"] in ("fits", "trimmed"):
                    assert sum(item["after"].values()) <= item["budget"]


def test_ec01_layers_1_to_3_over_budget_give_context_too_long() -> None:
    project = synthetic.Project(synthetic.load_profile(), "typical")
    tiny = context_size.Model("openai", "tiny", "test", None, 1000, 100, "test", "test")
    verdict = context_size.fit(project.context("writing"), tiny, tiny.budget(0), "estimate")
    assert verdict.status == "context_too_long"
    assert verdict.over_layer in FIXED


def test_stub_payloads_match_the_contracts() -> None:
    payloads = spk08_stub.build_payloads("writing", "typical")
    broken = dict(payloads["getTaskContextBundle"])
    del broken["definition"]
    with pytest.raises(jsonschema.ValidationError):
        spk08_contract.validate_response("getTaskContextBundle", broken)


def test_ac02_ec03_read_latency_runs_end_to_end(tmp_path: Path) -> None:
    pytest.importorskip("sires_common.generated.planning", reason="generate-python not run (PID-00007)")
    import read_latency

    code = read_latency.main(["--payloads", "typical", "--modes", "parallel,two_wave", "--delays-ms", "0,5",
                              "--sigmas", "0.5", "--iterations", "3", "--warmup", "1", "--ec03-attempts", "1",
                              "--ec03-timeout-ms", "300", "--out", str(tmp_path)])
    assert code == 0
    summary = json.loads((tmp_path / "read_latency.json").read_text("utf-8"))
    assert {(r["mode"], r["median_ms"]) for r in summary["rows"]} == {(m, d) for m in ("parallel", "two_wave")
                                                                      for d in (0.0, 5.0)}
    assert all(r["total"]["p95"] >= r["total"]["p50"] for r in summary["rows"])
    assert {r["slow_service"] for r in summary["ec03"]} == set(read_latency.SERVICES)
    for row in summary["ec03"]:
        assert row["outcome"] == "failed" and row["service_named"] and not row["partial_context_returned"]
    assert (tmp_path / "read_latency_raw.csv").read_text("utf-8").count("\n") == 1 + 2 * 2 * 3
