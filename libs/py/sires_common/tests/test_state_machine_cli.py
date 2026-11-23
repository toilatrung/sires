# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00158 S06 — `python -m sires_common.state_machine <module.path> [ATTR]` (main), EC17."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from support import REPO_ROOT

from sires_common.state_machine import main

TESTDATA = REPO_ROOT / "libs" / "ts" / "platform" / "src" / "state-machine" / "testdata"
MODULE = "pid00158_sample_machines"
SOURCE = f"""
import json
import pathlib

from sires_common.state_machine import define_state_machine

AS_DATA = json.loads(pathlib.Path({str(TESTDATA / "golden-machines.json")!r}).read_text(encoding="utf-8"))
STATE_MACHINES = [define_state_machine(**d) for d in AS_DATA]
NOT_A_LIST = {{"machine": "sample_task", "states": ["A", "B"], "transitions": [{{"from": "A", "to": "B"}}]}}
EMPTY = []
WRONG = [{{"machine": "Sample Task", "states": ["A", "B"], "transitions": [{{"from": "A", "to": "B"}}]}}]
DUPLICATE = [STATE_MACHINES[0], AS_DATA[0]]
"""


def golden_sql() -> str:
    with open(TESTDATA / "golden.txt", encoding="utf-8", newline="") as file:
        return file.read().replace("\r", "")


@pytest.fixture
def sample_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    (tmp_path / f"{MODULE}.py").write_text(SOURCE, encoding="utf-8")
    (tmp_path / "pid00158_broken.py").write_text('raise RuntimeError("hỏng lúc nạp")\n', encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path))
    for name in (MODULE, "pid00158_broken"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    yield tmp_path
    for name in (MODULE, "pid00158_broken"):
        sys.modules.pop(name, None)


def test_cli_prints_sql(sample_module: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """PID-00158-AC06: stdout is exactly render_state_transition_sql (golden.txt), exit code 0."""
    assert main([MODULE]) == 0
    assert capsys.readouterr() == (golden_sql(), "")
    assert main([MODULE, "STATE_MACHINES"]) == 0
    assert capsys.readouterr() == (golden_sql(), "")
    # Data declarations of the same shape go through define_state_machine.
    assert main([MODULE, "AS_DATA"]) == 0
    assert capsys.readouterr() == (golden_sql(), "")


def test_cli_errors(sample_module: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """EC17: missing module, missing attribute, not a list of valid machines → 1, reason on stderr, stdout empty."""
    cases = [
        ([], "sai tham số"),
        ([MODULE, "STATE_MACHINES", "x"], "sai tham số"),
        (["pid00158_missing_module"], "không nạp được module pid00158_missing_module"),
        (["pid00158_broken"], "hỏng lúc nạp"),
        ([MODULE, "MISSING"], 'không có thuộc tính "MISSING"'),
        ([MODULE, "NOT_A_LIST"], "không phải danh sách machine"),
        ([MODULE, "EMPTY"], "danh sách machine rỗng"),
        ([MODULE, "WRONG"], '"Sample Task"'),
        ([MODULE, "DUPLICATE"], "trùng tên"),
    ]
    for argv, reason in cases:
        assert main(argv) == 1, argv
        out, err = capsys.readouterr()
        assert out == "", argv
        assert err.startswith("sires_common.state_machine: "), argv
        assert reason in err, (argv, err)


def test_cli_module_entry_point(sample_module: Path) -> None:
    """`python -m sires_common.state_machine` in a child process: same bytes as golden.txt (UTF-8, LF on Windows too),
    and machines defined by the service module are recognised although the command runs as __main__."""
    env = {**os.environ, "PYTHONPATH": os.pathsep.join([str(sample_module), *sys.path])}
    ok = subprocess.run(
        [sys.executable, "-m", "sires_common.state_machine", MODULE], capture_output=True, env=env, timeout=120
    )
    assert ok.returncode == 0, ok.stderr.decode("utf-8", "replace")
    assert ok.stdout == golden_sql().encode("utf-8")
    assert ok.stderr == b""

    failed = subprocess.run(
        [sys.executable, "-m", "sires_common.state_machine", MODULE, "MISSING"],
        capture_output=True,
        env=env,
        timeout=120,
    )
    assert failed.returncode == 1
    assert failed.stdout == b""
    assert 'không có thuộc tính "MISSING"' in failed.stderr.decode("utf-8")
