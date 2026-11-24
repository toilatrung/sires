# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""EC09 (PID-00029; PO 24/11/2026): the JSON checks of 00-common.sql return false instead of NULL.

`app.is_actor_ref`, `app.is_approval_record` and `app.is_provenance` returned NULL for JSON with a missing field, and a
CHECK treats NULL as passing. The SQL next to this file (`0002_ec09_jsonb_helpers.sql`) replaces the three functions
with the text of docs/database/ddl/00-common.sql, so the schema built by the revisions still matches the reference DDL.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-24
"""

from __future__ import annotations

from pathlib import Path

from alembic import op

try:  # SQLAlchemy 2.0
    from sqlalchemy.util import await_only
except ImportError:  # pragma: no cover - SQLAlchemy 2.1 renamed it
    from sqlalchemy.util import await_ as await_only

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SQL = Path(__file__).with_suffix(".sql")


def upgrade() -> None:
    bind = op.get_bind()
    # Same path as revision 0001: the script holds several CREATE FUNCTION statements with $$ bodies, which only the
    # asyncpg simple-query protocol runs in one call; same connection and transaction as the version stamp.
    bind.exec_driver_sql("SELECT 1")
    driver_connection = bind.connection.driver_connection
    if driver_connection is None:
        raise RuntimeError("revision 0002: không lấy được kết nối asyncpg của Alembic")
    await_only(driver_connection.execute(SQL.read_text(encoding="utf-8")))


def downgrade() -> None:
    # Forward only (architecture 6.10): fix with a new revision, never drop tables or data here.
    raise RuntimeError("agent-core chỉ migrate tiến; sửa bằng một revision mới")
