# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S05 — the four sub-modules of tickets 1.6 carry their scope and no logic; S02 — the indexing_job declaration
uses exactly the states of the CHECK on app.indexing_job.status."""

from __future__ import annotations

import importlib
import re

from migration_support import ddl

from knowledge.domain.state_machines import INDEXING_JOB, STATE_MACHINES

SUB_MODULES = ("extraction", "chunking", "embedding", "retrieval")


def test_sub_modules_have_scope_only() -> None:
    for name in SUB_MODULES:
        module = importlib.import_module(f"knowledge.{name}")
        assert module.__doc__ and "PID-" in module.__doc__, module.__name__
        # Skeleton only: the pipeline is PID-00051, PID-00077, PID-00093.
        public = [attr for attr in vars(module) if not attr.startswith("__")]
        assert public == [], f"{module.__name__}: {public}"


def test_indexing_job_states_match_ddl_check() -> None:
    match = re.search(r"status\s+text NOT NULL DEFAULT 'Queued' CHECK \(status IN \(([^)]*)\)\)", ddl("knowledge.sql"))
    assert match, "không tìm thấy CHECK của app.indexing_job.status trong knowledge.sql"
    assert set(INDEXING_JOB.states) == set(re.findall(r"'([^']+)'", match.group(1)))
    assert [machine.machine for machine in STATE_MACHINES] == ["indexing_job"]
