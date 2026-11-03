# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""ASGI entry point: `uvicorn knowledge.main:app`."""

from fastapi import FastAPI

from sires_common.health import health_router

SERVICE = "knowledge"

app = FastAPI(title=f"SIRes {SERVICE}")
app.include_router(health_router(SERVICE))
