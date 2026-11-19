# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

from __future__ import annotations

import pytest

# PostgreSQL 16 + pgvector in Testcontainers and create_service_database (roles _app, _system, _purge; D4).
pytest_plugins = ["sires_common.testing.fixtures"]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
