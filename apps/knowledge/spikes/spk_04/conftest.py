# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Fixtures of the SPK-04 tests: anyio on asyncio, and a pgvector server (SPK04_ADMIN_DSN or Testcontainers)."""

from __future__ import annotations

import os

import pytest

# Imported to register the session fixture `sires_postgres` (pytest_plugins is only allowed in the root conftest).
from sires_common.testing.fixtures import PostgresServer, sires_postgres  # noqa: F401

from .schema import server_from_dsn


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def spk04_server(request: pytest.FixtureRequest) -> PostgresServer:
    """An existing pgvector server given by SPK04_ADMIN_DSN, otherwise PostgreSQL 16 + pgvector in Testcontainers."""
    dsn = os.environ.get("SPK04_ADMIN_DSN")
    if dsn:
        return server_from_dsn(dsn)
    server: PostgresServer = request.getfixturevalue("sires_postgres")
    return server
