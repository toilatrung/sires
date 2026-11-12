# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

from __future__ import annotations

from collections.abc import Iterator

import pytest
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from sires_common.telemetry import init_telemetry

pytest_plugins = ["sires_common.testing.fixtures"]

_SPANS = InMemorySpanExporter()


@pytest.fixture(scope="session", autouse=True)
def tracing() -> Iterator[InMemorySpanExporter]:
    """One global TracerProvider for the session (OpenTelemetry accepts a single one)."""
    init_telemetry("sires-common-test", exporter=_SPANS, batch=False)
    yield _SPANS


@pytest.fixture
def spans(tracing: InMemorySpanExporter) -> InMemorySpanExporter:
    tracing.clear()
    return tracing


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
