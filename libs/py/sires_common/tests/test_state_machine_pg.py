# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""PID-00158 S06 — sires_common.state_machine on PostgreSQL 16 (pgvector image, Testcontainers): the rows of the
knowledge and planning DDL blocks, generated again and run one statement at a time through asyncpg (EC19). Needs
Docker: without it the sires_postgres fixture fails (EC16); the unit tests are in test_state_machine.py."""

from __future__ import annotations

import json
import re

import asyncpg
import pytest
from support import REPO_ROOT, common_ddl

from sires_common.state_machine import (
    StateMachine,
    StateTransitionDiff,
    StateTransitionRow,
    compare_state_transition_rows,
    define_state_machine,
    render_state_transition_sql,
    state_transition_rows,
    state_transition_statements,
)
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

DDL_DIR = REPO_ROOT / "docs" / "database" / "ddl"
TESTDATA = REPO_ROOT / "libs" / "ts" / "platform" / "src" / "state-machine" / "testdata"
# Count of 18/11/2026 (spec 2.3): machines, pairs.
EXPECTED = {"knowledge.sql": (1, 7), "planning.sql": (2, 32)}
INSERT = re.compile(r"INSERT INTO app\.state_transition \([^)]*\) VALUES(?:[^;']|'(?:[^']|'')*')*;")


def ddl_insert(name: str) -> str:
    """The `INSERT INTO app.state_transition` statement of a DDL file (exactly one; the full reader is in TS S03)."""
    found = INSERT.findall((DDL_DIR / name).read_text(encoding="utf-8"))
    assert len(found) == 1, f"{name}: cần đúng 1 khối INSERT INTO app.state_transition, có {len(found)}"
    return str(found[0])


def declarations_from(rows: list[StateTransitionRow]) -> list[StateMachine]:
    """States are every value seen in a pair, in order of appearance."""
    grouped: dict[str, tuple[list[str], list[dict[str, str | None]]]] = {}
    for r in rows:
        states, transitions = grouped.setdefault(r.machine, ([], []))
        for state in (r.from_state, r.to_state):
            if state not in states:
                states.append(state)
        transitions.append({"from": r.from_state, "to": r.to_state, "code": r.code})
    return [define_state_machine(machine, states, transitions) for machine, (states, transitions) in grouped.items()]


async def read_rows(conn: asyncpg.Connection) -> list[StateTransitionRow]:
    records = await conn.fetch("SELECT machine, from_state, to_state, code FROM app.state_transition")
    rows = [StateTransitionRow(r["machine"], r["from_state"], r["to_state"], r["code"]) for r in records]
    return sorted(rows, key=lambda r: (r.machine, r.from_state, r.to_state))


async def run_statements(conn: asyncpg.Connection, machines: list[StateMachine]) -> list[str]:
    """One prepared statement per call, as `op.execute` does on asyncpg; returns the command tags."""
    tags: list[str] = []
    for statement in state_transition_statements(machines):
        prepared = await conn.prepare(statement)
        await prepared.fetch()
        tags.append(prepared.get_statusmsg())
    return tags


@pytest.fixture
async def state_db(sires_postgres: PostgresServer) -> ServiceDatabase:
    return await create_service_database(sires_postgres, "state_machine", [common_ddl()], finalize=False)


async def test_ddl_rows_knowledge_planning(state_db: ServiceDatabase) -> None:
    """PID-00158-AC04 (knowledge, planning), EC12, EC19."""
    conn = await asyncpg.connect(state_db.owner_dsn)
    try:
        for name, (machine_count, pair_count) in EXPECTED.items():
            await conn.execute("DELETE FROM app.state_transition")
            await conn.execute(ddl_insert(name))
            ddl_rows = await read_rows(conn)
            assert len(ddl_rows) == pair_count, name

            await conn.execute("DELETE FROM app.state_transition")
            machines = declarations_from(ddl_rows)
            assert len(machines) == machine_count, name
            # The whole SQL is two commands: a prepared statement refuses it, hence state_transition_statements.
            with pytest.raises(asyncpg.PostgresSyntaxError):
                await conn.prepare(render_state_transition_sql(machines))
            await run_statements(conn, machines)
            generated = await read_rows(conn)
            assert generated == ddl_rows, name
            assert state_transition_rows(machines) == ddl_rows, name
            assert compare_state_transition_rows(generated, machines) == StateTransitionDiff((), (), ())

            # Run again: no row deleted, inserted or updated.
            assert await run_statements(conn, machines) == ["DELETE 0", "INSERT 0 0"], name
            assert await read_rows(conn) == generated, name
            records = await conn.fetch("SELECT machine, from_state, to_state, code FROM app.state_transition")
            assert compare_state_transition_rows(records, machines) == StateTransitionDiff((), (), ())
    finally:
        await conn.close()


async def test_sync_one_machine(state_db: ServiceDatabase) -> None:
    """PID-00158-AC05, EC11, EC13: the sync for `task` fixes task and leaves every row of plan_version."""
    conn = await asyncpg.connect(state_db.owner_dsn)
    try:
        await conn.execute("DELETE FROM app.state_transition")
        await conn.execute(ddl_insert("planning.sql"))
        planning = await read_rows(conn)
        task = declarations_from([r for r in planning if r.machine == "task"])[0]
        plan_version = declarations_from([r for r in planning if r.machine == "plan_version"])[0]
        task_rows = state_transition_rows([task])

        dropped = next(r for r in task_rows if (r.from_state, r.to_state) == ("Draft", "Ready"))
        recoded = next(r for r in task_rows if (r.from_state, r.to_state) == ("In Review", "Completed"))
        extra = StateTransitionRow("task", "Completed", "Draft", "T-99")
        plan_extra = StateTransitionRow("plan_version", "Rejected", "Draft", None)
        await conn.execute(
            "DELETE FROM app.state_transition WHERE machine = 'task' AND from_state = 'Draft' AND to_state = 'Ready'"
        )
        await conn.execute(
            "UPDATE app.state_transition SET code = 'T-00'"
            " WHERE machine = 'task' AND from_state = $1 AND to_state = $2",
            recoded.from_state,
            recoded.to_state,
        )
        for r in (extra, plan_extra):
            await conn.execute(
                "INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES ($1, $2, $3, $4)",
                r.machine,
                r.from_state,
                r.to_state,
                r.code,
            )
        before = await read_rows(conn)
        diff = compare_state_transition_rows(before, [task])
        assert diff.missing == (dropped,)
        assert diff.unexpected == (extra,)
        assert [(m.expected, m.actual_code) for m in diff.code_mismatch] == [(recoded, "T-00")]

        await run_statements(conn, [task])
        after = await read_rows(conn)
        assert [r for r in after if r.machine == "task"] == task_rows
        assert [r for r in after if r.machine != "task"] == [r for r in before if r.machine != "task"]
        assert compare_state_transition_rows(after, [task]) == StateTransitionDiff((), (), ())
        assert compare_state_transition_rows(after, [plan_version]) == StateTransitionDiff((), (plan_extra,), ())
    finally:
        await conn.close()


async def test_golden_statements_on_postgres(state_db: ServiceDatabase) -> None:
    """The shared golden declarations (quotes, backslash, non-ASCII) round-trip through asyncpg."""
    declarations = json.loads((TESTDATA / "golden-machines.json").read_text(encoding="utf-8"))
    machines = [define_state_machine(**d) for d in declarations]
    conn = await asyncpg.connect(state_db.owner_dsn)
    try:
        await conn.execute("DELETE FROM app.state_transition")
        await run_statements(conn, machines)
        assert await read_rows(conn) == state_transition_rows(machines)
    finally:
        await conn.close()
