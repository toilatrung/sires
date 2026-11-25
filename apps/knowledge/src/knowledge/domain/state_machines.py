# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""State machines of knowledge, declared as data (DEC-57, DR-01, NFR-MAINT-003; PID-00026 S02, H1).

The only place the pairs of `indexing_job` are declared. Two uses:

- the rows of `app.state_transition`: `python -m sires_common.state_machine knowledge.domain.state_machines` prints
  the SQL that revision `migrations/versions/0002_state_transition.py` runs (helper of PID-00158; not written by
  hand, no generator here);
- the domain check before a write of `app.indexing_job.status`: `assert_transition(INDEXING_JOB, current, target)`
  (job lifecycle, PID-00105), the trigger `indexing_job_state` being the second line of defence.

States are those of the CHECK on `app.indexing_job.status`, pairs those of docs/database/ddl/knowledge.sql; no
transition condition (technical machine, architecture 7.1, 5.6). Change the machine: edit this declaration, print the
SQL again and put it in a new revision (with the CHECK of the column when a state is added); never edit a shipped
revision or the table by hand.
"""

from __future__ import annotations

from typing import Final

from sires_common.state_machine import StateMachine, Transition, define_state_machine

__all__ = ["INDEXING_JOB", "STATE_MACHINES"]

INDEXING_JOB: Final = define_state_machine(
    "indexing_job",
    ["Queued", "Indexing", "Indexed", "Failed", "Waiting Configuration"],
    [
        Transition("Queued", "Indexing"),
        Transition("Indexing", "Indexed"),
        Transition("Indexing", "Failed"),
        Transition("Indexing", "Queued"),
        Transition("Failed", "Queued"),
        Transition("Queued", "Waiting Configuration"),
        Transition("Waiting Configuration", "Queued"),
    ],
)

#: Every machine of the knowledge database; read by `python -m sires_common.state_machine` (default attribute).
STATE_MACHINES: Final[tuple[StateMachine, ...]] = (INDEXING_JOB,)
