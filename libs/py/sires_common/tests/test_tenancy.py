# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01 — tenancy, transactions, UUIDv7 on a real PostgreSQL 16 (pgvector image), RLS from 00-common.sql."""

from __future__ import annotations

import time
from uuid import UUID

import asyncpg
import pytest
from support import common_ddl

from sires_common.tenancy import create_pool, system_transaction, tenant_transaction, uuid7
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

NOTE_TABLE = """
CREATE TABLE app.note (
  id          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  account_id  uuid NOT NULL,
  body        text NOT NULL
);
"""

ACCOUNT_A = UUID("0193a000-0000-7000-8000-00000000000a")
ACCOUNT_B = UUID("0193a000-0000-7000-8000-00000000000b")


@pytest.fixture
async def notes_db(sires_postgres: PostgresServer) -> ServiceDatabase:
    return await create_service_database(sires_postgres, "tenancy", [common_ddl(), NOTE_TABLE])


async def _insert(pool: asyncpg.Pool, account: UUID, body: str) -> None:
    async with tenant_transaction(pool, account) as conn:
        await conn.execute("INSERT INTO app.note (account_id, body) VALUES ($1, $2)", account, body)


def test_uuid7_layout() -> None:
    first = uuid7()
    time.sleep(0.002)
    second = uuid7()
    assert first.version == 7 and second.version == 7
    assert first.variant == "specified in RFC 4122"
    assert first < second  # sorted by creation time (architecture 6.2)
    ms = first.int >> 80
    assert abs(ms - time.time() * 1000) < 5_000
    assert len({uuid7() for _ in range(1000)}) == 1000


async def test_rls(notes_db: ServiceDatabase) -> None:
    """PID-00005-AC01: B does not see A's rows through the helper; without app.account_id → 0 rows."""
    pool = await create_pool(notes_db.app_dsn)
    try:
        await _insert(pool, ACCOUNT_A, "note of A")
        await _insert(pool, ACCOUNT_B, "note of B")

        async with tenant_transaction(pool, ACCOUNT_B) as conn:
            rows = await conn.fetch("SELECT account_id, body FROM app.note")  # no tenant condition in the query
        assert [(r["account_id"], r["body"]) for r in rows] == [(ACCOUNT_B, "note of B")]

        async with tenant_transaction(pool, ACCOUNT_A) as conn:
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 1

        async with pool.acquire() as conn:  # raw query, app.account_id never set
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 0

        # Writing a row of another account from B's transaction is refused by the policy (WITH CHECK).
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with tenant_transaction(pool, ACCOUNT_B) as conn:
                await conn.execute("INSERT INTO app.note (account_id, body) VALUES ($1, 'x')", ACCOUNT_A)
    finally:
        await pool.close()

    # Both rows exist: the _system role (BYPASSRLS) sees them.
    system = await create_pool(notes_db.system_dsn)
    try:
        async with system_transaction(system) as conn:
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 2
    finally:
        await system.close()


async def test_account_does_not_leak_between_transactions(notes_db: ServiceDatabase) -> None:
    """SET LOCAL semantics: the pooled connection returns without tenant."""
    pool = await create_pool(notes_db.app_dsn, min_size=1, max_size=1)
    try:
        await _insert(pool, ACCOUNT_A, "a")
        async with tenant_transaction(pool, ACCOUNT_A) as conn:
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 1
        async with pool.acquire() as conn:  # same single connection
            assert await conn.fetchval("SELECT current_setting('app.account_id', true)") in (None, "")
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 0
    finally:
        await pool.close()


async def test_rollback_on_error(notes_db: ServiceDatabase) -> None:
    pool = await create_pool(notes_db.app_dsn)
    try:
        with pytest.raises(RuntimeError):
            async with tenant_transaction(pool, ACCOUNT_A) as conn:
                await conn.execute("INSERT INTO app.note (account_id, body) VALUES ($1, 'lost')", ACCOUNT_A)
                raise RuntimeError("handler failed")
        async with tenant_transaction(pool, ACCOUNT_A) as conn:
            assert await conn.fetchval("SELECT count(*) FROM app.note") == 0
    finally:
        await pool.close()


async def test_invalid_account_id_is_refused(notes_db: ServiceDatabase) -> None:
    pool = await create_pool(notes_db.app_dsn)
    try:
        with pytest.raises(ValueError):
            async with tenant_transaction(pool, "not-a-uuid"):
                pass
    finally:
        await pool.close()
