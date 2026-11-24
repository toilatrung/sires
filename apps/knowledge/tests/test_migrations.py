# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01, S02, S03 — Alembic revisions of knowledge against the reference DDL on PostgreSQL 16 + pgvector
(PID-00026-AC01; EC02–EC09)."""

from __future__ import annotations

import os
import secrets
import shutil
import subprocess
from uuid import UUID

import asyncpg
import pytest
import sqlalchemy.exc
import yaml
from migration_support import (
    HEAD,
    REPO_ROOT,
    SERVICE_DB,
    VALUES_YAML,
    VERSIONS_DIR,
    Snapshot,
    catalog_rows,
    ddl,
    downgrade,
    fetch,
    fetchval,
    revision_module,
    schema_diff,
    schema_snapshot,
    state_transition_rows,
    tables,
    upgrade,
    version,
)

from knowledge.domain.state_machines import INDEXING_JOB, STATE_MACHINES
from sires_common.state_machine import (
    StateTransitionDiff,
    StateTransitionRow,
    Transition,
    compare_state_transition_rows,
    define_state_machine,
    state_transition_statements,
)
from sires_common.testing.fixtures import PostgresServer, ServiceDatabase, create_service_database

pytestmark = pytest.mark.anyio

# Spec 2.3: the ten tables of knowledge.sql, replica.project_state (app.create_replica_project_state()) and the
# platform tables of 00-common.sql.
OWN_TABLES = {
    ("replica", "reference_state"),
    ("replica", "project_reference_scope"),
    ("replica", "account_embedding"),
    ("app", "embedding_model_catalog"),
    ("app", "source_document"),
    ("app", "indexing_job"),
    ("app", "chunk"),
    ("app", "chunk_text"),
    ("vec", "emb_openai_text_embedding_3_small"),
    ("app", "embedding_usage"),
}
REPLICA_PROJECT_STATE = ("replica", "project_state")
PLATFORM_TABLES = {("app", t) for t in ("outbox", "inbox", "idempotency_key", "job_lock", "state_transition")}
NO_DIFF = StateTransitionDiff((), (), ())


@pytest.fixture
async def empty_db(sires_postgres: PostgresServer) -> ServiceDatabase:
    """A fresh database with the knowledge roles (fixture, D4) and nothing else."""
    return await create_service_database(sires_postgres, SERVICE_DB, [], finalize=False)


@pytest.fixture
async def revision_db(empty_db: ServiceDatabase) -> ServiceDatabase:
    await upgrade(empty_db.owner_dsn)
    return empty_db


@pytest.fixture
async def ddl_db(sires_postgres: PostgresServer) -> ServiceDatabase:
    """The second database of AC01: 00-common.sql then knowledge.sql, which enables RLS and grants itself."""
    return await create_service_database(
        sires_postgres, SERVICE_DB, [ddl("00-common.sql"), ddl("knowledge.sql")], finalize=False
    )


async def test_schema_matches_ddl(revision_db: ServiceDatabase, ddl_db: ServiceDatabase) -> None:
    """PID-00026-AC01 (structure, catalog row), EC05, EC06: the revisions build the same schema as the DDL."""
    from_revision = await schema_snapshot(revision_db.owner_dsn)
    from_ddl = await schema_snapshot(ddl_db.owner_dsn)

    # Not two empty schemas: every table of the spec exists, with RLS on and forced where there is an account_id.
    assert OWN_TABLES | {REPLICA_PROJECT_STATE} | PLATFORM_TABLES <= tables(from_ddl)
    rls = {(row[0], row[1]): (row[3], row[4]) for row in from_ddl["tables"]}
    for table in OWN_TABLES - {("app", "embedding_model_catalog")} | {REPLICA_PROJECT_STATE}:
        assert rls[table] == (True, True), table
    assert rls[("app", "embedding_model_catalog")] == (False, False)
    extensions = {row[0]: row[1] for row in from_ddl["extensions"]}
    assert {"pgcrypto", "unaccent", "pg_trgm", "vector"} <= extensions.keys()
    # DDL: pgvector ≥ 0.8 (AQ-09).
    assert tuple(int(part) for part in extensions["vector"].split(".")[:2]) >= (0, 8), extensions["vector"]
    columns = {(row[0], row[1], row[2]): row[3] for row in from_ddl["column_types"]}
    assert columns[("vec", "emb_openai_text_embedding_3_small", "embedding")] == "vector(1536)"
    assert columns[("app", "chunk_text", "tsv")] == "tsvector"
    hnsw = [row[3] for row in from_ddl["indexes"] if row[2] == "emb_openai_text_embedding_3_small_hnsw_idx"]
    assert len(hnsw) == 1 and "USING hnsw (embedding vector_cosine_ops)" in hnsw[0]

    assert schema_diff(from_revision, from_ddl) == {}

    # EC06: the one sample row of the catalog, exactly as the DDL inserts it.
    assert await catalog_rows(revision_db.owner_dsn) == await catalog_rows(ddl_db.owner_dsn)
    assert await catalog_rows(revision_db.owner_dsn) == [
        ("openai_text_embedding_3_small", "openai", "text-embedding-3-small", 1536,
         "emb_openai_text_embedding_3_small", True)
    ]

    # EC05: alembic_version lives in public, outside app, replica and vec, and is not granted to the service roles.
    assert await version(revision_db.owner_dsn) == HEAD
    for schema in ("app", "replica", "vec"):
        assert await fetchval(revision_db.owner_dsn, f"SELECT to_regclass('{schema}.alembic_version')") is None
    granted = await fetchval(
        revision_db.owner_dsn,
        "SELECT count(*) FROM information_schema.role_table_grants "
        "WHERE table_name = 'alembic_version' AND grantee LIKE 'sires\\_knowledge\\_%'",
    )
    assert granted == 0


async def test_upgrade_twice(revision_db: ServiceDatabase) -> None:
    """EC03: a second `upgrade head` (Job migration before every deploy) does nothing and does not fail."""
    dsn = revision_db.owner_dsn
    before = (await schema_snapshot(dsn), await catalog_rows(dsn), await state_transition_rows(dsn))
    await upgrade(dsn)
    after = (await schema_snapshot(dsn), await catalog_rows(dsn), await state_transition_rows(dsn))
    assert schema_diff(after[0], before[0]) == {}
    assert after[1:] == before[1:]
    assert await version(dsn) == HEAD


async def test_missing_roles_rolls_back(sires_postgres: PostgresServer, empty_db: ServiceDatabase) -> None:
    """EC04: without the role sires_knowledge_app the GRANT fails, PostgreSQL's error is raised and nothing remains.

    The database is created here, not through the fixture. Roles are cluster-wide and `empty_db` made sure they
    exist, so sires_knowledge_app is renamed for the duration of the test (its privileges follow it) and renamed back
    afterwards. The revision never creates roles.
    """
    name = f"sires_knowledge_noroles_{secrets.token_hex(4)}"
    admin = await asyncpg.connect(sires_postgres.dsn())
    try:
        await admin.execute(f'CREATE DATABASE "{name}"')
        await admin.execute('ALTER ROLE "sires_knowledge_app" RENAME TO "sires_knowledge_app_hidden"')
        try:
            with pytest.raises((asyncpg.PostgresError, sqlalchemy.exc.DBAPIError)) as failure:
                await upgrade(sires_postgres.dsn(database=name))
        finally:
            await admin.execute('ALTER ROLE "sires_knowledge_app_hidden" RENAME TO "sires_knowledge_app"')
    finally:
        await admin.close()

    assert 'role "sires_knowledge_app" does not exist' in str(failure.value)
    dsn = sires_postgres.dsn(database=name)
    assert await fetchval(dsn, "SELECT count(*) FROM pg_namespace WHERE nspname IN ('app', 'replica', 'vec')") == 0
    assert await fetchval(
        dsn, "SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto', 'unaccent', 'pg_trgm', 'vector')"
    ) == 0
    assert await fetchval(dsn, "SELECT count(*) FROM pg_ts_config WHERE cfgname = 'sires_simple'") == 0
    assert await version(dsn) is None


# Database 3.2: the owner owns the schema and runs the DDL without logging in; the migrator logs in, is a member of the
# owner with `SET role` owner at login, and has no privilege of its own. Roles are cluster-wide: create them once.
OWNER = "sires_knowledge_owner"
MIGRATOR = "sires_knowledge_migrator"
_MIGRATOR_ROLES_SQL = f"""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{OWNER}') THEN
    CREATE ROLE "{OWNER}" NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{MIGRATOR}') THEN
    CREATE ROLE "{MIGRATOR}" LOGIN PASSWORD 'migrator' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      IN ROLE "{OWNER}";
  END IF;
END $$;
ALTER ROLE "{MIGRATOR}" SET role = '{OWNER}';
"""


def _without_owner(snapshot: Snapshot) -> Snapshot:
    """The owner holds every privilege on its own objects; the DDL database is owned by the superuser instead."""
    return {aspect: {row for row in rows if OWNER not in row} for aspect, rows in snapshot.items()}


async def test_migrator_role_needs_vector_preinstalled(sires_postgres: PostgresServer, ddl_db: ServiceDatabase) -> None:
    """QC Lần 1 G1, EC01, EC09: the revisions run as sires_knowledge_migrator of database 3.2 on a database owned by
    sires_knowledge_owner. pgvector is not a trusted extension: without `vector` created beforehand by a superuser,
    CREATE EXTENSION is refused and nothing remains; with it, the revisions run to head (twice), the schema matches the
    DDL and every object belongs to the owner. `ddl_db` also makes sure the roles _app, _system, _purge exist."""
    bare, ready = (f"sires_knowledge_migrator_{kind}_{secrets.token_hex(4)}" for kind in ("bare", "ready"))
    admin = await asyncpg.connect(sires_postgres.dsn())
    try:
        await admin.execute(_MIGRATOR_ROLES_SQL)
        for name in (bare, ready):
            await admin.execute(f'CREATE DATABASE "{name}" OWNER "{OWNER}"')
    finally:
        await admin.close()
    # What the infrastructure does before the Job migration (PID-00159-AC04 locally, PID-00011-AC02 on staging).
    superuser = await asyncpg.connect(sires_postgres.dsn(database=ready))
    try:
        await superuser.execute("CREATE EXTENSION vector")
    finally:
        await superuser.close()

    def migrator(name: str) -> str:
        return sires_postgres.dsn(user=MIGRATOR, password="migrator", database=name)

    # The session of the migrator runs as the owner (ALTER ROLE … SET role), without superuser rights.
    assert await fetchval(migrator(bare), "SELECT current_user") == OWNER
    assert await fetchval(migrator(bare), "SELECT rolsuper FROM pg_roles WHERE rolname = current_user") is False

    # Without `vector`: refused by PostgreSQL, the whole transaction rolls back.
    with pytest.raises((asyncpg.PostgresError, sqlalchemy.exc.DBAPIError)) as refused:
        await upgrade(migrator(bare))
    assert 'permission denied to create extension "vector"' in str(refused.value)
    dsn = migrator(bare)
    assert await fetchval(dsn, "SELECT count(*) FROM pg_namespace WHERE nspname IN ('app', 'replica', 'vec')") == 0
    assert await fetchval(
        dsn, "SELECT count(*) FROM pg_extension WHERE extname IN ('pgcrypto', 'unaccent', 'pg_trgm', 'vector')"
    ) == 0
    assert await version(dsn) is None

    # With `vector` created by a superuser: CREATE EXTENSION IF NOT EXISTS skips it and the revisions run to head.
    dsn = migrator(ready)
    for _ in range(2):
        await upgrade(dsn)
    assert await version(dsn) == HEAD
    assert schema_diff(_without_owner(await schema_snapshot(dsn)), await schema_snapshot(ddl_db.owner_dsn)) == {}
    assert await catalog_rows(dsn) == await catalog_rows(ddl_db.owner_dsn)
    assert len(await state_transition_rows(dsn)) == 7
    owners = await fetch(
        dsn,
        """SELECT 'schema' AS kind, pg_get_userbyid(nspowner) AS owner FROM pg_namespace
             WHERE nspname IN ('app', 'replica', 'vec')
           UNION SELECT 'relation', pg_get_userbyid(c.relowner) FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('app', 'replica', 'vec', 'public')
           UNION SELECT 'function', pg_get_userbyid(p.proowner) FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'""",
    )
    assert {(row["kind"], row["owner"]) for row in owners} == {
        ("schema", OWNER), ("relation", OWNER), ("function", OWNER)
    }


async def test_downgrade_refused(sires_postgres: PostgresServer, revision_db: ServiceDatabase) -> None:
    """EC02: downgrade below the first revision fails clearly and drops nothing (forward only)."""
    # From head: the first step down (0002) already refuses, whatever the target.
    dsn = revision_db.owner_dsn
    before = (await schema_snapshot(dsn), await catalog_rows(dsn), await state_transition_rows(dsn))
    for target in ("base", "0001"):
        with pytest.raises(RuntimeError, match="chỉ migrate tiến"):
            await downgrade(dsn, target)
    after = (await schema_snapshot(dsn), await catalog_rows(dsn), await state_transition_rows(dsn))
    assert schema_diff(after[0], before[0]) == {}
    assert after[1:] == before[1:]
    assert OWN_TABLES <= tables(before[0])
    assert len(before[2]) == 7
    assert await version(dsn) == HEAD

    # From revision 0001 alone (another fresh database): its own downgrade refuses to go below the first revision.
    first = (await create_service_database(sires_postgres, SERVICE_DB, [], finalize=False)).owner_dsn
    await upgrade(first, "0001")
    assert await version(first) == "0001"
    first_schema, first_catalog = await schema_snapshot(first), await catalog_rows(first)
    with pytest.raises(RuntimeError, match="không có downgrade dưới revision 0001"):
        await downgrade(first, "base")
    assert schema_diff(await schema_snapshot(first), first_schema) == {}
    assert await catalog_rows(first) == first_catalog
    assert await version(first) == "0001"


async def test_state_transitions_from_declaration(revision_db: ServiceDatabase, ddl_db: ServiceDatabase) -> None:
    """PID-00026-AC01 (transition data), EC07: three sources agree — the rows the PID-00158 helper generates from the
    domain declaration, the rows of the database built by the revisions, the rows of the database built by the DDL."""
    # The revision runs exactly what the helper generates from the declaration: nothing written by hand (DEC-57) ...
    assert revision_module("0002_state_transition").STATEMENTS == state_transition_statements(STATE_MACHINES)
    # ... and the INSERT block of the DDL was not copied into revision 0001.
    assert "INSERT INTO app.state_transition" not in (VERSIONS_DIR / "0001_initial_schema.sql").read_text("utf-8")
    assert "INSERT INTO app.state_transition" in ddl("knowledge.sql")

    from_revision = await state_transition_rows(revision_db.owner_dsn)
    from_ddl = await state_transition_rows(ddl_db.owner_dsn)
    triples = {(r["machine"], r["from_state"], r["to_state"]) for r in from_revision}
    assert triples == {(r["machine"], r["from_state"], r["to_state"]) for r in from_ddl}
    assert len(triples) == 7 and {machine for machine, _, _ in triples} == {"indexing_job"}
    assert compare_state_transition_rows(from_revision, STATE_MACHINES) == NO_DIFF
    assert compare_state_transition_rows(from_ddl, STATE_MACHINES) == NO_DIFF

    # EC07 controls: a declaration missing a pair, or with an extra pair, is caught and the diff names that pair.
    short = define_state_machine("indexing_job", INDEXING_JOB.states, INDEXING_JOB.transitions[1:])
    diff = compare_state_transition_rows(from_ddl, [short])
    assert diff == StateTransitionDiff((), (StateTransitionRow("indexing_job", "Queued", "Indexing", None),), ())
    extra = define_state_machine(
        "indexing_job", INDEXING_JOB.states, [*INDEXING_JOB.transitions, Transition("Indexed", "Queued")]
    )
    diff = compare_state_transition_rows(from_ddl, [extra])
    assert diff == StateTransitionDiff((StateTransitionRow("indexing_job", "Indexed", "Queued", None),), (), ())


async def test_transition_outside_table_rejected(revision_db: ServiceDatabase) -> None:
    """EC08: once the rows are loaded, indexing_job Indexed → Queued (not in the table) is refused by the trigger."""
    conn = await asyncpg.connect(revision_db.system_dsn)
    try:
        job: UUID = await conn.fetchval(
            "INSERT INTO app.indexing_job (account_id, reference_id, content_hash, embedding_model)"
            " VALUES (app.uuid_v7(), app.uuid_v7(), '\\x01'::bytea, 'openai_text_embedding_3_small') RETURNING id"
        )
        # Control: declared pairs go through.
        for status in ("Indexing", "Indexed"):
            updated = await conn.execute("UPDATE app.indexing_job SET status = $1 WHERE id = $2", status, job)
            assert updated == "UPDATE 1", status
        with pytest.raises(asyncpg.CheckViolationError, match="indexing_job: Indexed → Queued"):
            await conn.execute("UPDATE app.indexing_job SET status = 'Queued' WHERE id = $1", job)
        assert await conn.fetchval("SELECT status FROM app.indexing_job WHERE id = $1", job) == "Indexed"
    finally:
        await conn.close()


def _migration_command() -> list[str]:
    values = yaml.safe_load(VALUES_YAML.read_text(encoding="utf-8"))
    migration = values["migration"]
    assert migration["enabled"] is True
    command = migration["command"]
    assert isinstance(command, list) and all(isinstance(part, str) for part in command)
    return command


async def test_migrate_command(empty_db: ServiceDatabase) -> None:
    """S03, EC03, EC09: the exact `migration.command` of deploy/values.yaml, from the repository root (the image's
    /repo), with the migrator DSN in DATABASE_MIGRATOR_URL; run twice. QC Lần 1 G2: the Job's log shows each revision
    applied on the first run and none on the second."""
    command = _migration_command()
    assert shutil.which(command[0]), f"{command[0]} không có trên PATH: chạy test qua uv như knowledge:test"
    env = {**os.environ, "DATABASE_MIGRATOR_URL": empty_db.owner_dsn}
    dsn = empty_db.owner_dsn
    snapshots = []
    logs = []
    for _ in range(2):
        result = subprocess.run(command, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=300)
        assert result.returncode == 0, result.stderr
        logs.append(result.stderr)
        snapshots.append((await schema_snapshot(dsn), await catalog_rows(dsn), await state_transition_rows(dsn)))
    assert "Running upgrade  -> 0001" in logs[0] and "Running upgrade 0001 -> 0002" in logs[0], logs[0]
    assert "Running upgrade" not in logs[1], logs[1]
    assert empty_db.owner_dsn not in logs[0] + logs[1]
    assert OWN_TABLES | {REPLICA_PROJECT_STATE} | PLATFORM_TABLES <= tables(snapshots[0][0])
    assert schema_diff(snapshots[1][0], snapshots[0][0]) == {}
    assert snapshots[1][1:] == snapshots[0][1:]
    assert len(snapshots[0][2]) == 7
    assert await version(dsn) == HEAD

    # Without the variable the command stops with a message naming it, never a DSN.
    missing = {key: value for key, value in env.items() if key != "DATABASE_MIGRATOR_URL"}
    result = subprocess.run(command, cwd=REPO_ROOT, env=missing, capture_output=True, text=True, timeout=300)
    assert result.returncode != 0
    assert "DATABASE_MIGRATOR_URL" in result.stderr
