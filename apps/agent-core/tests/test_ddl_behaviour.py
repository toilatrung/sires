# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S05 — behaviour of the DDL as the role sires_agent_core_app, on a database built by the revision (PID-00020-AC03).

Expectations come from agent-core.sql (RLS through app.enable_tenant_rls, CHECK provider_slot_holder_ck) and from
app.grant_standard of 00-common.sql (_app has no access to outbox except INSERT, none to inbox and job_lock).
Each group has a valid control case that goes through.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg
import pytest
from migration_support import SERVICE_DB, upgrade

from sires_common.tenancy import Connection, Pool, create_pool, system_transaction, tenant_transaction, uuid7
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

ACCOUNT_A = UUID("0193a000-0000-7000-8000-00000000000a")
ACCOUNT_B = UUID("0193a000-0000-7000-8000-00000000000b")
CONNECTION_A = UUID("0193a000-0000-7000-8000-0000000000ca")
CONNECTION_B = UUID("0193a000-0000-7000-8000-0000000000cb")


@dataclass(frozen=True, slots=True)
class Seeded:
    db: ServiceDatabase
    app: Pool
    system: Pool


async def _insert_slot(conn: Connection, connection_id: UUID, slot: int, account: UUID, *,
                       holder: UUID | None = None, lease_until: datetime | None = None) -> None:
    await conn.execute(
        "INSERT INTO app.provider_slot (provider_connection_id, slot, account_id, holder_agent_run_id, acquired_at,"
        " lease_until) VALUES ($1, $2, $3, $4, $5, $6)",
        connection_id, slot, account, holder, datetime.now(UTC) if holder else None, lease_until,
    )


async def _insert_catalog(conn: Connection, connection_id: UUID, account: UUID) -> None:
    await conn.execute(
        "INSERT INTO app.model_catalog_cache (provider_connection_id, account_id, provider, models, expires_at)"
        " VALUES ($1, $2, 'anthropic', $3::jsonb, now() + interval '1 hour')",
        connection_id, account, json.dumps([{"id": "model-x", "capabilities": ["tools"]}]),
    )


@pytest.fixture
async def seeded(sires_postgres: PostgresServer) -> AsyncIterator[Seeded]:
    """Database from the revision (S01), roles from the fixture (D4); one slot and one catalog row per account,
    written by _app in each account's own transaction (allowed by database 3.2)."""
    db = await create_service_database(sires_postgres, SERVICE_DB, [], finalize=False)
    await upgrade(db.owner_dsn)
    app = await create_pool(db.app_dsn)
    system = await create_pool(db.system_dsn)
    try:
        for account, connection_id in ((ACCOUNT_A, CONNECTION_A), (ACCOUNT_B, CONNECTION_B)):
            async with tenant_transaction(app, account) as conn:
                await _insert_slot(conn, connection_id, 0, account)
                await _insert_catalog(conn, connection_id, account)
        yield Seeded(db, app, system)
    finally:
        await app.close()
        await system.close()


async def test_rls_blocks_cross_account(seeded: Seeded) -> None:
    """Case 1: account B neither sees nor changes A's rows of provider_slot and model_catalog_cache."""
    for table in ("provider_slot", "model_catalog_cache"):
        async with tenant_transaction(seeded.app, ACCOUNT_B) as conn:
            # Control: B sees exactly its own row.
            rows = await conn.fetch(f"SELECT provider_connection_id, account_id FROM app.{table}")
            assert [(r["provider_connection_id"], r["account_id"]) for r in rows] == [(CONNECTION_B, ACCOUNT_B)]
            # A's row is invisible, even when asked for by key.
            assert await conn.fetchval(
                f"SELECT count(*) FROM app.{table} WHERE provider_connection_id = $1", CONNECTION_A
            ) == 0
            # UPDATE and DELETE of A's row touch nothing.
            assert await conn.execute(
                f"UPDATE app.{table} SET account_id = account_id WHERE provider_connection_id = $1", CONNECTION_A
            ) == "UPDATE 0"
            assert await conn.execute(
                f"DELETE FROM app.{table} WHERE provider_connection_id = $1", CONNECTION_A
            ) == "DELETE 0"

        # Writing a row for A from B's transaction violates the policy's WITH CHECK.
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="row-level security"):
            async with tenant_transaction(seeded.app, ACCOUNT_B) as conn:
                if table == "provider_slot":
                    await _insert_slot(conn, CONNECTION_A, 1, ACCOUNT_A)
                else:
                    await _insert_catalog(conn, uuid7(), ACCOUNT_A)

        # Moving B's own row to A is refused the same way.
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="row-level security"):
            async with tenant_transaction(seeded.app, ACCOUNT_B) as conn:
                await conn.execute(
                    f"UPDATE app.{table} SET account_id = $1 WHERE provider_connection_id = $2", ACCOUNT_A, CONNECTION_B
                )

    # Without app.account_id (no helper) _app sees nothing at all.
    async with seeded.app.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM app.provider_slot") == 0

    # A's rows are untouched (checked with BYPASSRLS).
    async with system_transaction(seeded.system) as conn:
        assert await conn.fetchval("SELECT count(*) FROM app.provider_slot WHERE account_id = $1", ACCOUNT_A) == 1
        assert await conn.fetchval(
            "SELECT count(*) FROM app.model_catalog_cache WHERE account_id = $1", ACCOUNT_A
        ) == 1


async def test_provider_slot_holder_check(seeded: Seeded) -> None:
    """Case 2: a held slot without lease_until, or a lease without holder, is refused by provider_slot_holder_ck."""
    lease = datetime.now(UTC) + timedelta(minutes=5)
    for holder, lease_until in ((uuid7(), None), (None, lease)):
        with pytest.raises(asyncpg.CheckViolationError) as refused:
            async with tenant_transaction(seeded.app, ACCOUNT_A) as conn:
                await _insert_slot(conn, CONNECTION_A, 2, ACCOUNT_A, holder=holder, lease_until=lease_until)
        assert refused.value.constraint_name == "provider_slot_holder_ck"

    # Taking a free slot with only one of the two columns is refused too.
    with pytest.raises(asyncpg.CheckViolationError):
        async with tenant_transaction(seeded.app, ACCOUNT_A) as conn:
            await conn.execute(
                "UPDATE app.provider_slot SET holder_agent_run_id = $1 WHERE provider_connection_id = $2",
                uuid7(), CONNECTION_A,
            )

    # Control: holder and lease together, then both cleared, go through.
    async with tenant_transaction(seeded.app, ACCOUNT_A) as conn:
        await _insert_slot(conn, CONNECTION_A, 3, ACCOUNT_A, holder=uuid7(), lease_until=lease)
        assert await conn.execute(
            "UPDATE app.provider_slot SET holder_agent_run_id = NULL, acquired_at = NULL, lease_until = NULL"
            " WHERE provider_connection_id = $1 AND slot = 3", CONNECTION_A,
        ) == "UPDATE 1"


async def test_app_role_cannot_read_outbox(seeded: Seeded) -> None:
    """Case 3: _app cannot read app.outbox, app.inbox, app.job_lock (grant_standard); _system can."""
    for table in ("outbox", "inbox", "job_lock"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="permission denied"):
            async with tenant_transaction(seeded.app, ACCOUNT_A) as conn:
                await conn.fetch(f"SELECT * FROM app.{table}")

    # Control: _app may only append to the outbox, in its own transaction; _system reads it.
    async with tenant_transaction(seeded.app, ACCOUNT_A) as conn:
        await conn.execute(
            "INSERT INTO app.outbox (account_id, kind, routing_key, payload)"
            " VALUES ($1, 'event', 'test.recorded', '{}')",
            ACCOUNT_A,
        )
    async with system_transaction(seeded.system) as conn:
        assert await conn.fetchval("SELECT count(*) FROM app.outbox WHERE routing_key = 'test.recorded'") == 1
        for table in ("inbox", "job_lock"):
            assert await conn.fetchval(f"SELECT count(*) FROM app.{table}") == 0
