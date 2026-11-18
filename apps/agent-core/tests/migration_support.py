# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Helpers for the migration tests: run agent-core's Alembic, read the DDL, snapshot a schema from pg_catalog."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import anyio
import asyncpg
from alembic import command
from alembic.config import Config

APP_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = APP_ROOT.parents[1]
ALEMBIC_INI = APP_ROOT / "alembic.ini"
DDL_DIR = REPO_ROOT / "docs" / "database" / "ddl"
VALUES_YAML = APP_ROOT / "deploy" / "values.yaml"
SERVICE_DB = "agent_core"  # sires_<service> naming of the fixture and of app.grant_standard('agent_core', ...)
SCHEMAS = ("app", "replica")


def ddl(name: str) -> str:
    """A reference DDL file (read only)."""
    return (DDL_DIR / name).read_text(encoding="utf-8")


def alembic_config(dsn: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["dsn"] = dsn
    return config


async def upgrade(dsn: str, revision: str = "head") -> None:
    # env.py calls asyncio.run(): run Alembic in a worker thread, outside the test's event loop.
    await anyio.to_thread.run_sync(command.upgrade, alembic_config(dsn), revision)


async def downgrade(dsn: str, revision: str) -> None:
    await anyio.to_thread.run_sync(command.downgrade, alembic_config(dsn), revision)


# Each query returns rows for one aspect of PID-00020-AC01; the snapshot is a set per aspect, so ordering and OIDs
# never matter. Everything is restricted to the schemas app and replica, which leaves alembic_version (public) out.
_SNAPSHOT_QUERIES: dict[str, str] = {
    "extensions": "SELECT extname FROM pg_extension",
    "schemas": "SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])",
    "tables": """
        SELECT n.nspname, c.relname, c.relkind::text, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p', 'v', 'm', 'S')""",
    "columns": """
        SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default,
               character_maximum_length, numeric_precision, numeric_scale, is_identity, is_generated
        FROM information_schema.columns WHERE table_schema = ANY($1::text[])""",
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
        SELECT n.nspname, c.cfgname, m.maptokentype, m.mapseq, d.dictname
        FROM pg_ts_config c
        JOIN pg_namespace n ON n.oid = c.cfgnamespace
        JOIN pg_ts_config_map m ON m.mapcfg = c.oid
        JOIN pg_ts_dict d ON d.oid = m.mapdict
        WHERE n.nspname = ANY($1::text[])""",
}


async def schema_snapshot(dsn: str) -> dict[str, set[tuple[Any, ...]]]:
    """Every aspect PID-00020-AC01 compares, as sets of rows."""
    conn = await asyncpg.connect(dsn)
    try:
        snapshot: dict[str, set[tuple[Any, ...]]] = {}
        for aspect, query in _SNAPSHOT_QUERIES.items():
            args = [] if aspect == "extensions" else [list(SCHEMAS)]
            rows = await conn.fetch(query, *args)
            snapshot[aspect] = {tuple(row.values()) for row in rows}
        return snapshot
    finally:
        await conn.close()


async def fetchval(dsn: str, query: str, *args: Any) -> Any:
    conn = await asyncpg.connect(dsn)
    try:
        return await conn.fetchval(query, *args)
    finally:
        await conn.close()
