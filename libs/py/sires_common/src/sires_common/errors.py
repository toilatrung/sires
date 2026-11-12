# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Errors as RFC 9457 problem+json for FastAPI (`Problem` in docs/api-design/components/schemas/common.yaml).

`code` belongs to the closed catalog `ErrorCode` and `errors[].code` to `FieldErrorCode` (PO 11/11/2026): a code
outside them is a programming error and raises `ValueError`. A declared error is a `ProblemError`. Request
validation errors become `400 validation_failed` with pydantic error types mapped to `FieldErrorCode`. Framework
HTTP errors keep their status when the catalog has a code for it (404 `not_found`, 405 `method_not_allowed`…);
any other status, and any other exception, becomes `500 internal_error` without stack trace or message.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any, Final, Literal, NotRequired, TypedDict, get_args

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sires_common.telemetry import current_trace_id

PROBLEM_JSON = "application/problem+json"
PROBLEM_TYPE_BASE = "https://sires.etroy.local/problems/"
INTERNAL_ERROR: Final = "internal_error"
VALIDATION_FAILED: Final = "validation_failed"

# Same order as `ErrorCode.enum` in common.yaml; tests/test_errors.py compares both lists.
ErrorCode = Literal[
    "validation_failed",
    "unauthenticated",
    "invalid_service_token",
    "forbidden",
    "caller_not_allowed",
    "not_found",
    "method_not_allowed",
    "invalid_transition",
    "action_not_allowed_in_state",
    "project_archived",
    "active_workflow_exists",
    "readiness_failed",
    "open_plan_version_exists",
    "base_revision_mismatch",
    "citation_check_failed",
    "connection_in_use",
    "duplicate_name",
    "restore_window_expired",
    "stale_agent_run",
    "precondition_failed",
    "payload_too_large",
    "idempotency_key_reused",
    "dependency_cycle",
    "reference_not_trusted",
    "pdf_without_text_layer",
    "model_not_available",
    "instance_required",
    "instance_not_allowed",
    "schema_invalid",
    "draft_reference",
    "change_reason_required",
    "entry_immutable",
    "synthesis_incomplete",
    "problem_type_not_allowed",
    "analysis_agent_not_configured",
    "deliberation_not_confirmed",
    "deliberation_mismatch",
    "precondition_required",
    "internal_error",
    "service_unavailable",
]
ERROR_CODES: Final[frozenset[str]] = frozenset(get_args(ErrorCode))

FieldErrorCode = Literal[
    "required", "invalid_type", "invalid_format", "too_small", "too_big", "invalid_value", "unrecognized_field"
]
FIELD_ERROR_CODES: Final[frozenset[str]] = frozenset(get_args(FieldErrorCode))


class FieldError(TypedDict):
    """One item of `Problem.errors[]`."""

    field: str
    code: FieldErrorCode
    message: NotRequired[str]


_log = structlog.get_logger("sires_common.errors")


class ProblemError(Exception):
    """A declared error: HTTP status, stable `code` from `ErrorCode`, title and optional Problem fields."""

    def __init__(
        self,
        status: int,
        code: ErrorCode,
        title: str,
        *,
        detail: str | None = None,
        errors: Sequence[FieldError] | None = None,
        current_state: str | None = None,
        suggested_action: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        if code not in ERROR_CODES:
            raise ValueError(f"mã lỗi {code!r} không thuộc danh mục ErrorCode")
        for error in errors or ():
            if error["code"] not in FIELD_ERROR_CODES:
                raise ValueError(f"mã lỗi trường {error['code']!r} không thuộc danh mục FieldErrorCode")
        super().__init__(f"{status} {code}: {title}")
        self.status = status
        self.code: ErrorCode = code
        self.title = title
        self.detail = detail
        self.errors: list[dict[str, object]] | None = [dict(e) for e in errors] if errors else None
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


def validation_failed(errors: Sequence[FieldError], *, detail: str | None = None) -> ProblemError:
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


# ---------- Request validation: pydantic error types → FieldErrorCode ----------

_FIELD_CODE_BY_PYDANTIC_TYPE: Final[Mapping[str, FieldErrorCode]] = {
    "missing": "required",
    "missing_argument": "required",
    "missing_keyword_only_argument": "required",
    "missing_positional_only_argument": "required",
    "extra_forbidden": "unrecognized_field",
    "unexpected_keyword_argument": "unrecognized_field",
    "unexpected_positional_argument": "unrecognized_field",
    # A JSON value of the wrong kind (string for a number…).
    "int_parsing": "invalid_type",
    "int_from_float": "invalid_type",
    "float_parsing": "invalid_type",
    "bool_parsing": "invalid_type",
    "decimal_parsing": "invalid_type",
    "complex_str_parsing": "invalid_type",
    "is_instance_of": "invalid_type",
    "is_subclass_of": "invalid_type",
    "int_parsing_size": "too_big",
    "json_invalid": "invalid_format",
    "string_pattern_mismatch": "invalid_format",
    "uuid_version": "invalid_format",
    "url_syntax_violation": "invalid_format",
    "url_scheme": "invalid_format",
    "timezone_aware": "invalid_format",
    "timezone_naive": "invalid_format",
    "url_too_long": "too_big",
    "decimal_max_digits": "too_big",
    "decimal_max_places": "too_big",
    "decimal_whole_digits": "too_big",
    "greater_than": "too_small",
    "greater_than_equal": "too_small",
    "less_than": "too_big",
    "less_than_equal": "too_big",
}


def field_error_code(pydantic_type: str) -> FieldErrorCode:
    """Map a pydantic v2 error type to `FieldErrorCode`; the library's own code never reaches the response."""
    mapped = _FIELD_CODE_BY_PYDANTIC_TYPE.get(pydantic_type)
    if mapped is not None:
        return mapped
    if pydantic_type.endswith("_type"):
        return "invalid_type"
    if pydantic_type.endswith("too_short"):
        return "too_small"
    if pydantic_type.endswith("too_long"):
        return "too_big"
    if pydantic_type.endswith("_parsing"):  # uuid, url, date, datetime, time, timedelta
        return "invalid_format"
    return "invalid_value"  # literal_error, enum, value_error, multiple_of, finite_number…


def _field_of(loc: Sequence[int | str], pydantic_type: str) -> str:
    parts = list(loc)
    if parts and parts[0] in ("body", "query", "path", "header", "cookie"):
        parts = parts[1:]
    if pydantic_type == "json_invalid":
        return ""  # the location is a character offset in the body, not a field
    return ".".join(str(p) for p in parts)


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors: list[FieldError] = []
    for err in exc.errors():
        pydantic_type = str(err.get("type", ""))
        errors.append(
            {
                "field": _field_of(err.get("loc", ()), pydantic_type),
                "code": field_error_code(pydantic_type),
                "message": str(err.get("msg", "")),
            }
        )
    problem = validation_failed(errors).to_problem(instance=request.url.path, correlation_id=current_trace_id())
    return problem_response(problem)


# ---------- Framework HTTP errors: status → ErrorCode ----------

_HTTP_PROBLEMS: Final[Mapping[int, tuple[ErrorCode, str]]] = {
    400: ("validation_failed", "Dữ liệu không hợp lệ"),
    401: ("unauthenticated", "Chưa đăng nhập"),
    403: ("forbidden", "Không được phép"),
    404: ("not_found", "Không tìm thấy"),
    405: ("method_not_allowed", "Method không được hỗ trợ"),
    412: ("precondition_failed", "Dữ liệu đã thay đổi"),
    413: ("payload_too_large", "Dữ liệu vượt giới hạn"),
    428: ("precondition_required", "Thiếu If-Match"),
    503: ("service_unavailable", "Dịch vụ tạm không khả dụng"),
}


async def _http_handler(request: Request, exc: Exception) -> JSONResponse:
    """`HTTPException` raised by the framework or a dependency (unknown route, wrong method, missing credentials…).

    A status with a code in the catalog keeps its status and headers (`Allow`, `WWW-Authenticate`). Any other
    status has no generic code — the service must raise `ProblemError` with a specific one — so it is logged and
    answered as `500 internal_error`.
    """
    assert isinstance(exc, StarletteHTTPException)
    mapped = _HTTP_PROBLEMS.get(exc.status_code)
    if mapped is None:
        _log.error("undeclared_http_error", status=exc.status_code, path=request.url.path)
        return problem_response(internal_error_problem(request.url.path))
    code, title = mapped
    # Starlette's default detail is the English reason phrase; keep only a detail the code set on purpose.
    detail = exc.detail if isinstance(exc.detail, str) and exc.detail != HTTPStatus(exc.status_code).phrase else None
    error = ProblemError(exc.status_code, code, title, detail=detail, headers=exc.headers)
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
