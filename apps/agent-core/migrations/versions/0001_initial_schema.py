# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Initial schema of sires_agent_core: 00-common.sql then agent-core.sql (PID-00020 S01, D1).

The SQL is a copy of docs/database/ddl at the time of this revision, kept next to this file
(`0001_initial_schema.sql`) because the image carries no docs/ and a revision must never change after it ships.
Later DDL changes go into new revisions. Roles `sires_agent_core_*` are created by the infrastructure (database 3.2),
not here: without them the GRANTs of `app.grant_standard` fail and the whole transaction rolls back (EC03).

Revision ID: 0001
Revises:
Create Date: 2026-11-18
"""

from __future__ import annotations

from pathlib import Path

from alembic import op

try:  # SQLAlchemy 2.0
    from sqlalchemy.util import await_only
except ImportError:  # pragma: no cover - SQLAlchemy 2.1 renamed it
    from sqlalchemy.util import await_ as await_only

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL = Path(__file__).with_suffix(".sql")


def upgrade() -> None:
    bind = op.get_bind()
    # Make sure the asyncpg transaction of this connection is open, then run the multi-statement script through the
    # driver: asyncpg's simple-query protocol accepts many statements (DO blocks, functions) in one call, which a
    # prepared statement through SQLAlchemy does not. Same connection, same transaction as the version stamp.
    bind.exec_driver_sql("SELECT 1")
    driver_connection = bind.connection.driver_connection
    await_only(driver_connection.execute(SQL.read_text(encoding="utf-8")))


def downgrade() -> None:
    # Forward only (spec 4.7, architecture 6.10; EC01): no DROP of tables or data. Fix with a new revision.
    raise RuntimeError("agent-core chỉ migrate tiến: không có downgrade dưới revision 0001; sửa bằng một revision mới")
