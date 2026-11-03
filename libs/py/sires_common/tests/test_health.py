# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

from fastapi import FastAPI
from fastapi.testclient import TestClient

from sires_common.health import health_router


def test_health_router_reports_service() -> None:
    app = FastAPI()
    app.include_router(health_router("sample"))
    assert TestClient(app).get("/health").json() == {"service": "sample", "status": "ok"}
