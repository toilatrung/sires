# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Alembic environment of agent-core: async engine on asyncpg, one transaction for the whole upgrade.

The DSN is the migrator role's (`DATABASE_MIGRATOR_URL`, agent_core.config); tests may pass it as
`Config.attributes["dsn"]`. `alembic_version` stays in the default schema (`public`), outside `app` and `replica`, so
`app.grant_standard` never grants on it and the schema comparison leaves it out (EC04).
"""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from agent_core.config import Settings, sqlalchemy_url


def _database_url() -> str:
    dsn = context.config.attributes.get("dsn") or Settings.from_env().require_migrator_database_url()
    return sqlalchemy_url(str(dsn))


def _run(connection: Connection) -> None:
    # transactional_ddl: the version table, every revision and the version stamp commit or roll back together, so a
    # failure half-way leaves no object behind (EC03).
    context.configure(connection=connection, target_metadata=None, transactional_ddl=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("agent-core không hỗ trợ alembic --sql: revision chạy SQL của DDL trực tiếp trên database")
asyncio.run(_run_online())
