# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Helpers for the migration tests: run knowledge's Alembic, read the DDL, snapshot a schema from pg_catalog."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import anyio
import asyncpg
from alembic import command
from alembic.config import Config

APP_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = APP_ROOT.parents[1]
ALEMBIC_INI = APP_ROOT / "alembic.ini"
VERSIONS_DIR = APP_ROOT / "migrations" / "versions"
DDL_DIR = REPO_ROOT / "docs" / "database" / "ddl"
VALUES_YAML = APP_ROOT / "deploy" / "values.yaml"
SERVICE_DB = "knowledge"  # sires_<service> naming of the fixture and of app.grant_standard('knowledge', ...)
SCHEMAS = ("app", "replica", "vec")
HEAD = "0002"


def ddl(name: str) -> str:
    """A reference DDL file (read only)."""
    return (DDL_DIR / name).read_text(encoding="utf-8")


def revision_module(stem: str) -> ModuleType:
    """Load a revision file (its name starts with a digit, so it cannot be imported by name)."""
    path = VERSIONS_DIR / f"{stem}.py"
    spec = importlib.util.spec_from_file_location(f"knowledge_revision_{stem}", path)
    assert spec is not None and spec.loader is not None, path
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def alembic_config(dsn: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["dsn"] = dsn
    # In-process run: keep pytest's logging, do not load the [loggers] of alembic.ini (migrations/env.py).
    config.attributes["configure_logger"] = False
    return config


async def upgrade(dsn: str, revision: str = "head") -> None:
    # env.py calls asyncio.run(): run Alembic in a worker thread, outside the test's event loop.
    await anyio.to_thread.run_sync(command.upgrade, alembic_config(dsn), revision)


async def downgrade(dsn: str, revision: str) -> None:
    await anyio.to_thread.run_sync(command.downgrade, alembic_config(dsn), revision)


# Each query returns rows for one aspect of PID-00026-AC01; the snapshot is a set per aspect, so ordering and OIDs
# never matter. Everything is restricted to the schemas app, replica and vec, which leaves alembic_version (public)
# out (EC05). `column_types` adds what information_schema hides: the dimension of vector(1536).
_SNAPSHOT_QUERIES: dict[str, str] = {
    "extensions": "SELECT extname, extversion FROM pg_extension",
    "schemas": "SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])",
    "tables": """
        SELECT n.nspname, c.relname, c.relkind::text, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p', 'v', 'm', 'S')""",
    "columns": """
        SELECT table_schema, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
               column_default, character_maximum_length, numeric_precision, numeric_scale, is_identity, is_generated
        FROM information_schema.columns WHERE table_schema = ANY($1::text[])""",
    "column_types": """
        SELECT n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped""",
    "constraints": """
        SELECT n.nspname, c.relname, k.conname, k.contype::text, pg_get_constraintdef(k.oid)
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[])""",
    "indexes": "SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = ANY($1::text[])",
    "triggers": """
        SELECT n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = ANY($1::text[])""",
    "functions": """
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1::text[])""",
    "policies": """
        SELECT schemaname, tablename, policyname, permissive, roles::text[], cmd, qual, with_check
        FROM pg_policies WHERE schemaname = ANY($1::text[])""",
    "table_grants": """
        SELECT grantee, table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = ANY($1::text[]) AND grantee LIKE 'sires\\_%'""",
    "schema_grants": """
        SELECT n.nspname, r.rolname, a.privilege_type
        FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a JOIN pg_roles r ON r.oid = a.grantee
        WHERE n.nspname = ANY($1::text[]) AND r.rolname LIKE 'sires\\_%'""",
    "function_grants": """
        SELECT routine_schema, routine_name, grantee, privilege_type
        FROM information_schema.role_routine_grants
        WHERE routine_schema = ANY($1::text[]) AND grantee LIKE 'sires\\_%'""",
    "text_search": """
        SELECT n.nspname, c.cfgname, m.maptokentype, m.mapseqno, d.dictname
        FROM pg_ts_config c
        JOIN pg_namespace n ON n.oid = c.cfgnamespace
        JOIN pg_ts_config_map m ON m.mapcfg = c.oid
        JOIN pg_ts_dict d ON d.oid = m.mapdict
        WHERE n.nspname = ANY($1::text[])""",
}

Snapshot = dict[str, set[tuple[Any, ...]]]


def _hashable(value: Any) -> Any:
    # Array columns (pg_policies.roles) come back as lists; a row must be hashable to go into a set.
    if isinstance(value, list):
        return tuple(_hashable(item) for item in value)
    return value


async def schema_snapshot(dsn: str) -> Snapshot:
    """Every aspect PID-00026-AC01 compares, as sets of rows."""
    conn = await asyncpg.connect(dsn)
    try:
        snapshot: Snapshot = {}
        for aspect, query in _SNAPSHOT_QUERIES.items():
            args = [] if aspect == "extensions" else [list(SCHEMAS)]
            rows = await conn.fetch(query, *args)
            snapshot[aspect] = {tuple(_hashable(value) for value in row.values()) for row in rows}
        return snapshot
    finally:
        await conn.close()


def schema_diff(left: Snapshot, right: Snapshot) -> dict[str, Any]:
    """Aspects that differ, with the rows only on each side (empty when the two schemas match)."""
    return {
        aspect: {
            "chỉ ở revision": sorted(map(str, left[aspect] - right[aspect])),
            "chỉ ở DDL": sorted(map(str, right[aspect] - left[aspect])),
        }
        for aspect in left
        if left[aspect] != right[aspect]
    }


def tables(snapshot: Snapshot) -> set[tuple[str, str]]:
    return {(row[0], row[1]) for row in snapshot["tables"] if row[2] == "r"}


async def fetch(dsn: str, query: str, *args: Any) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(dsn)
    try:
        return list(await conn.fetch(query, *args))
    finally:
        await conn.close()


async def fetchval(dsn: str, query: str, *args: Any) -> Any:
    conn = await asyncpg.connect(dsn)
    try:
        return await conn.fetchval(query, *args)
    finally:
        await conn.close()


async def catalog_rows(dsn: str) -> list[tuple[Any, ...]]:
    """Rows of app.embedding_model_catalog, every column, in slug order (EC06)."""
    rows = await fetch(dsn, "SELECT * FROM app.embedding_model_catalog ORDER BY slug")
    return [tuple(row.values()) for row in rows]


async def state_transition_rows(dsn: str) -> list[asyncpg.Record]:
    return await fetch(
        dsn, "SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3"
    )


async def version(dsn: str) -> str | None:
    exists = await fetchval(dsn, "SELECT to_regclass('public.alembic_version') IS NOT NULL")
    if not exists:
        return None
    value: str | None = await fetchval(dsn, "SELECT version_num FROM public.alembic_version")
    return value
