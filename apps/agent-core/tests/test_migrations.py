# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01, S04 — Alembic revision of agent-core against the reference DDL on PostgreSQL 16 + pgvector (PID-00020-AC01)."""

from __future__ import annotations

import os
import shutil
import subprocess
from typing import Any

import asyncpg
import pytest
import sqlalchemy.exc
import yaml
from migration_support import (
    REPO_ROOT,
    SERVICE_DB,
    VALUES_YAML,
    ddl,
    downgrade,
    fetchval,
    schema_snapshot,
    upgrade,
)

from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

OWN_TABLES = {("app", "provider_slot"), ("app", "model_catalog_cache")}
PLATFORM_TABLES = {("app", t) for t in ("outbox", "inbox", "idempotency_key", "job_lock", "state_transition")}


@pytest.fixture
async def empty_db(sires_postgres: PostgresServer) -> ServiceDatabase:
    """A fresh database with the agent_core roles (fixture, D4) and nothing else."""
    return await create_service_database(sires_postgres, SERVICE_DB, [], finalize=False)


@pytest.fixture
async def revision_db(empty_db: ServiceDatabase) -> ServiceDatabase:
    await upgrade(empty_db.owner_dsn)
    return empty_db


def _diff(left: dict[str, set[tuple[Any, ...]]], right: dict[str, set[tuple[Any, ...]]]) -> dict[str, Any]:
    return {
        aspect: {"chỉ ở revision": sorted(map(str, left[aspect] - right[aspect])),
                 "chỉ ở DDL": sorted(map(str, right[aspect] - left[aspect]))}
        for aspect in left
        if left[aspect] != right[aspect]
    }


def _tables(snapshot: dict[str, set[tuple[Any, ...]]]) -> set[tuple[str, str]]:
    return {(row[0], row[1]) for row in snapshot["tables"] if row[2] == "r"}


async def _version(dsn: str) -> str | None:
    exists = await fetchval(dsn, "SELECT to_regclass('public.alembic_version') IS NOT NULL")
    if not exists:
        return None
    value: str | None = await fetchval(dsn, "SELECT version_num FROM public.alembic_version")
    return value


async def test_schema_matches_ddl(sires_postgres: PostgresServer, revision_db: ServiceDatabase) -> None:
    """PID-00020-AC01, EC04: the revision builds the same schema as 00-common.sql then agent-core.sql."""
    reference = await create_service_database(
        sires_postgres, SERVICE_DB, [ddl("00-common.sql"), ddl("agent-core.sql")], finalize=False
    )
    from_revision = await schema_snapshot(revision_db.owner_dsn)
    from_ddl = await schema_snapshot(reference.owner_dsn)

    # Not two empty schemas: both tables of agent-core.sql and the platform tables exist, RLS is on and forced.
    assert OWN_TABLES | PLATFORM_TABLES <= _tables(from_ddl)
    rls = {(row[0], row[1]): (row[3], row[4]) for row in from_ddl["tables"]}
    assert rls[("app", "provider_slot")] == (True, True)
    assert rls[("app", "model_catalog_cache")] == (True, True)
    assert {"pgcrypto", "unaccent", "pg_trgm"} <= {row[0] for row in from_ddl["extensions"]}

    assert _diff(from_revision, from_ddl) == {}

    # EC04: alembic_version lives in public, outside app and replica, and is not granted to the service roles.
    assert await _version(revision_db.owner_dsn) == "0001"
    assert await fetchval(revision_db.owner_dsn, "SELECT to_regclass('app.alembic_version')") is None
    assert await fetchval(revision_db.owner_dsn, "SELECT to_regclass('replica.alembic_version')") is None
    granted = await fetchval(
        revision_db.owner_dsn,
        "SELECT count(*) FROM information_schema.role_table_grants "
        "WHERE table_name = 'alembic_version' AND grantee LIKE 'sires\\_agent\\_core\\_%'",
    )
    assert granted == 0


async def test_upgrade_twice(revision_db: ServiceDatabase) -> None:
    """EC02: a second `upgrade head` (Job migration before every deploy) does nothing and does not fail."""
    before = await schema_snapshot(revision_db.owner_dsn)
    await upgrade(revision_db.owner_dsn)
    after = await schema_snapshot(revision_db.owner_dsn)
    assert _diff(after, before) == {}
    assert await _version(revision_db.owner_dsn) == "0001"


async def test_missing_roles_rolls_back(sires_postgres: PostgresServer, empty_db: ServiceDatabase) -> None:
    """EC03: without the role sires_agent_core_app the GRANT fails, PostgreSQL's error is raised and nothing remains.

    Roles are cluster-wide and other tests already created them, so the role is renamed for the duration of the
    test (its privileges follow it) and renamed back afterwards. The revision never creates roles.
    """
    admin = await asyncpg.connect(sires_postgres.dsn())
    try:
        await admin.execute('ALTER ROLE "sires_agent_core_app" RENAME TO "sires_agent_core_app_hidden"')
        try:
            with pytest.raises((asyncpg.PostgresError, sqlalchemy.exc.DBAPIError)) as failure:
                await upgrade(empty_db.owner_dsn)
        finally:
            await admin.execute('ALTER ROLE "sires_agent_core_app_hidden" RENAME TO "sires_agent_core_app"')
    finally:
        await admin.close()

    assert "sires_agent_core_app" in str(failure.value)
    dsn = empty_db.owner_dsn
    assert await fetchval(dsn, "SELECT count(*) FROM pg_namespace WHERE nspname IN ('app', 'replica')") == 0
    assert await fetchval(
        dsn, "SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto', 'unaccent', 'pg_trgm')"
    ) == 0
    assert await _version(dsn) is None


async def test_downgrade_refused(revision_db: ServiceDatabase) -> None:
    """EC01: downgrade below the first revision fails clearly and drops nothing (forward only)."""
    with pytest.raises(RuntimeError, match="chỉ migrate tiến"):
        await downgrade(revision_db.owner_dsn, "base")
    snapshot = await schema_snapshot(revision_db.owner_dsn)
    assert OWN_TABLES <= _tables(snapshot)
    assert await _version(revision_db.owner_dsn) == "0001"


def _migration_command() -> list[str]:
    values = yaml.safe_load(VALUES_YAML.read_text(encoding="utf-8"))
    migration = values["migration"]
    assert migration["enabled"] is True
    command = migration["command"]
    assert isinstance(command, list) and all(isinstance(part, str) for part in command)
    return command


async def test_migrate_command(empty_db: ServiceDatabase) -> None:
    """S04, EC02, EC07: the exact `migration.command` of deploy/values.yaml, from the repository root (the image's
    /repo), with the migrator DSN in DATABASE_MIGRATOR_URL; run twice."""
    command = _migration_command()
    assert shutil.which(command[0]), f"{command[0]} không có trên PATH: chạy test qua uv như agent-core:test"
    env = {**os.environ, "DATABASE_MIGRATOR_URL": empty_db.owner_dsn}
    snapshots = []
    for _ in range(2):
        result = subprocess.run(command, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=300)
        assert result.returncode == 0, result.stderr
        snapshots.append(await schema_snapshot(empty_db.owner_dsn))
    assert OWN_TABLES <= _tables(snapshots[0])
    assert _diff(snapshots[1], snapshots[0]) == {}
    assert await _version(empty_db.owner_dsn) == "0001"
