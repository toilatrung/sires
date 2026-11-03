# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

from fastapi import APIRouter


def health_router(service: str) -> APIRouter:
    """`GET /health` with the same payload as the NestJS services."""
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"service": service, "status": "ok"}

    return router
