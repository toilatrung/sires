# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Errors as RFC 9457 problem+json for FastAPI (`Problem` in docs/api-design/components/schemas/common.yaml).

A declared error is a `ProblemError` carrying its stable `code`. Request validation errors become
`400 validation_failed`; any other exception becomes `500 internal_error` without stack trace or message.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sires_common.telemetry import current_trace_id

PROBLEM_JSON = "application/problem+json"
PROBLEM_TYPE_BASE = "https://sires.etroy.local/problems/"
INTERNAL_ERROR = "internal_error"
VALIDATION_FAILED = "validation_failed"

_log = structlog.get_logger("sires_common.errors")


class ProblemError(Exception):
    """A declared error: HTTP status, stable `code`, title and optional Problem fields."""

    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        *,
        detail: str | None = None,
        errors: Sequence[Mapping[str, str]] | None = None,
        current_state: str | None = None,
        suggested_action: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(f"{status} {code}: {title}")
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = [dict(e) for e in errors] if errors else None
        self.current_state = current_state
        self.suggested_action = suggested_action
        self.headers = dict(headers) if headers else None

    def to_problem(self, *, instance: str | None = None, correlation_id: str | None = None) -> dict[str, Any]:
        problem: dict[str, Any] = {
            "type": PROBLEM_TYPE_BASE + self.code,
            "title": self.title,
            "status": self.status,
            "code": self.code,
        }
        optional = {
            "detail": self.detail,
            "instance": instance,
            "currentState": self.current_state,
            "errors": self.errors,
            "suggestedAction": self.suggested_action,
            "correlationId": correlation_id,
        }
        problem.update({k: v for k, v in optional.items() if v is not None})
        return problem


def validation_failed(errors: Sequence[Mapping[str, str]], *, detail: str | None = None) -> ProblemError:
    """`400 validation_failed` with `errors[]` ({field, code, message}) — components/responses.yaml BadRequest."""
    return ProblemError(400, VALIDATION_FAILED, "Dữ liệu không hợp lệ", errors=errors, detail=detail)


def problem_response(problem: Mapping[str, Any], headers: Mapping[str, str] | None = None) -> JSONResponse:
    return JSONResponse(dict(problem), status_code=int(problem["status"]), media_type=PROBLEM_JSON, headers=headers)


def internal_error_problem(instance: str | None = None) -> dict[str, Any]:
    return ProblemError(500, INTERNAL_ERROR, "Lỗi hệ thống").to_problem(
        instance=instance, correlation_id=current_trace_id()
    )


async def _problem_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ProblemError)
    problem = exc.to_problem(instance=request.url.path, correlation_id=current_trace_id())
    return problem_response(problem, exc.headers)


def _field_of(loc: Sequence[int | str]) -> str:
    parts = list(loc)
    if parts and parts[0] in ("body", "query", "path", "header", "cookie"):
        parts = parts[1:]
    return ".".join(str(p) for p in parts)


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = [
        {
            "field": _field_of(err.get("loc", ())),
            "code": "required" if err.get("type") == "missing" else str(err.get("type", "invalid")),
            "message": str(err.get("msg", "")),
        }
        for err in exc.errors()
    ]
    problem = validation_failed(errors).to_problem(instance=request.url.path, correlation_id=current_trace_id())
    return problem_response(problem)


async def _http_handler(request: Request, exc: Exception) -> JSONResponse:
    """Framework HTTP errors (unknown route, wrong method…) keep their status, as problem+json."""
    assert isinstance(exc, StarletteHTTPException)
    try:
        phrase = HTTPStatus(exc.status_code).phrase
    except ValueError:
        phrase = "Error"
    code = phrase.lower().replace(" ", "_").replace("-", "_")
    detail = exc.detail if isinstance(exc.detail, str) and exc.detail != phrase else None
    error = ProblemError(exc.status_code, code, phrase, detail=detail, headers=exc.headers)
    problem = error.to_problem(instance=request.url.path, correlation_id=current_trace_id())
    return problem_response(problem, error.headers)


class ProblemMiddleware:
    """Turns an exception that escaped every handler into `500 internal_error` (no stack trace in the body).

    The exception is logged through structlog, whose processors redact secrets (telemetry.redact).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            _log.exception("unhandled_error", path=scope.get("path"))
            if started:
                raise
            body = json.dumps(internal_error_problem(scope.get("path"))).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [(b"content-type", PROBLEM_JSON.encode()), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})


def install_problem_handlers(app: FastAPI) -> None:
    """Register problem+json handlers. Add `telemetry.RequestContextMiddleware` after this call (outermost)."""
    app.add_exception_handler(ProblemError, _problem_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_handler)
    app.add_middleware(ProblemMiddleware)
