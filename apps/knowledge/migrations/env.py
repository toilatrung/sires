# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Alembic environment of knowledge: async engine on asyncpg, one transaction for the whole upgrade.

The DSN is the migrator role's, from `DATABASE_MIGRATOR_URL` (`postgresql://…`, the asyncpg form sires_common uses);
tests may pass it as `Config.attributes["dsn"]`. `alembic_version` stays in the default schema (`public`), outside
`app`, `replica` and `vec`, so neither `app.grant_standard` nor the GRANTs on schema `vec` reach it and the schema
comparison leaves it out (EC05).

Run as a command (Job migration, Dev), the logging of `alembic.ini` is loaded, so each revision applied is printed on
stderr (`Running upgrade …`); a run at head prints none. Callers that drive Alembic in-process (tests) set
`Config.attributes["configure_logger"] = False` to keep their own logging setup (Alembic cookbook).
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

ENV_MIGRATOR_DATABASE_URL = "DATABASE_MIGRATOR_URL"


def _database_url() -> str:
    dsn = context.config.attributes.get("dsn") or os.environ.get(ENV_MIGRATOR_DATABASE_URL, "").strip()
    if not dsn:
        raise SystemExit(f"knowledge: thiếu biến môi trường {ENV_MIGRATOR_DATABASE_URL} (DSN của vai trò migrator)")
    # `postgresql://…` (asyncpg form) → `postgresql+asyncpg://…` for SQLAlchemy; the DSN itself is never printed.
    for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
        if dsn.startswith(prefix):
            return "postgresql+asyncpg://" + dsn[len(prefix) :]
    raise SystemExit(f"knowledge: {ENV_MIGRATOR_DATABASE_URL} phải bắt đầu bằng postgresql://")


def _run(connection: Connection) -> None:
    # transactional_ddl: the version table, every revision and the version stamp commit or roll back together, so a
    # failure half-way leaves no object behind (EC04).
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


if context.config.config_file_name is not None and context.config.attributes.get("configure_logger", True):
    fileConfig(context.config.config_file_name, disable_existing_loggers=False)
if context.is_offline_mode():
    raise SystemExit("knowledge không hỗ trợ alembic --sql: revision chạy SQL của DDL trực tiếp trên database")
asyncio.run(_run_online())
