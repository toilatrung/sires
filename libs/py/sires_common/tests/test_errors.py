# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01 — problem+json codes stay inside the closed catalogs `ErrorCode` and `FieldErrorCode` (NFR-OBS-005)."""

from __future__ import annotations

import uuid
from typing import Any, get_args

import pytest
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field
from support import COMMON_SCHEMAS, contract_errors

from sires_common.errors import (
    ERROR_CODES,
    FIELD_ERROR_CODES,
    PROBLEM_JSON,
    ErrorCode,
    FieldError,
    FieldErrorCode,
    ProblemError,
    field_error_code,
    install_problem_handlers,
    validation_failed,
)
from sires_common.messaging import require_idempotency_key


def _contract_enum(name: str) -> list[str]:
    schemas: dict[str, Any] = yaml.safe_load(COMMON_SCHEMAS.read_text(encoding="utf-8"))
    return list(schemas[name]["enum"])


def test_catalogs_match_contract() -> None:
    """The Literal types are the contract enums, in the same order (common.yaml, PO 11/11/2026)."""
    assert list(get_args(ErrorCode)) == _contract_enum("ErrorCode")
    assert list(get_args(FieldErrorCode)) == _contract_enum("FieldErrorCode")
    assert ERROR_CODES == set(_contract_enum("ErrorCode"))
    assert FIELD_ERROR_CODES == set(_contract_enum("FieldErrorCode"))


def test_codes_outside_catalog_are_refused() -> None:
    with pytest.raises(ValueError, match="ErrorCode"):
        ProblemError(409, "conflict", "Xung đột")  # type: ignore[arg-type]
    bad: FieldError = {"field": "x", "code": "string_too_short"}  # type: ignore[typeddict-item]
    with pytest.raises(ValueError, match="FieldErrorCode"):
        validation_failed([bad])


@pytest.mark.parametrize(
    ("pydantic_type", "expected"),
    [
        ("missing", "required"),
        ("extra_forbidden", "unrecognized_field"),
        ("string_type", "invalid_type"),
        ("int_parsing", "invalid_type"),
        ("uuid_parsing", "invalid_format"),
        ("datetime_from_date_parsing", "invalid_format"),
        ("string_pattern_mismatch", "invalid_format"),
        ("json_invalid", "invalid_format"),
        ("string_too_short", "too_small"),
        ("too_short", "too_small"),
        ("greater_than_equal", "too_small"),
        ("string_too_long", "too_big"),
        ("less_than_equal", "too_big"),
        ("literal_error", "invalid_value"),
        ("enum", "invalid_value"),
        ("value_error", "invalid_value"),
    ],
)
def test_pydantic_types_map_to_field_codes(pydantic_type: str, expected: str) -> None:
    assert field_error_code(pydantic_type) == expected


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    count: int = Field(ge=1, le=5)
    name: str = Field(min_length=3)


def _client() -> TestClient:
    app = FastAPI()
    install_problem_handlers(app)

    @app.post("/things")
    def create(body: Body) -> dict[str, str]:
        return {"name": body.name}

    @app.get("/raise/{status}")
    def raise_status(status: int) -> None:
        raise HTTPException(status, headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)

    return TestClient(app, raise_server_exceptions=False)


def _problem(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == PROBLEM_JSON
    body: dict[str, Any] = response.json()
    assert (body["status"], body["code"]) == (status, code)
    assert contract_errors(COMMON_SCHEMAS, "Problem", body) == []
    return body


def test_validation_errors_use_field_codes() -> None:
    client = _client()
    body = _problem(
        client.post("/things", json={"id": "not-a-uuid", "count": "many", "name": "ab", "extra": 1}),
        400,
        "validation_failed",
    )
    assert {(e["field"], e["code"]) for e in body["errors"]} == {
        ("id", "invalid_format"),
        ("count", "invalid_type"),
        ("name", "too_small"),
        ("extra", "unrecognized_field"),
    }

    body = _problem(
        client.post("/things", json={"id": str(uuid.uuid4()), "count": 9, "name": "abc"}), 400, "validation_failed"
    )
    assert [(e["field"], e["code"]) for e in body["errors"]] == [("count", "too_big")]

    # Malformed JSON: the location is a character offset, so the error is on the body as a whole.
    malformed = client.post("/things", content=b"{", headers={"content-type": "application/json"})
    body = _problem(malformed, 400, "validation_failed")
    assert [(e["field"], e["code"]) for e in body["errors"]] == [("", "invalid_format")]


def test_framework_http_errors_use_catalog_codes() -> None:
    client = _client()
    _problem(client.get("/no-such-route"), 404, "not_found")
    wrong_method = client.delete("/things")
    _problem(wrong_method, 405, "method_not_allowed")
    assert wrong_method.headers["allow"] == "POST"
    unauthenticated = client.get("/raise/401")
    _problem(unauthenticated, 401, "unauthenticated")
    assert unauthenticated.headers["www-authenticate"] == "Bearer"
    for status, code in (
        (400, "validation_failed"),
        (403, "forbidden"),
        (412, "precondition_failed"),
        (413, "payload_too_large"),
        (428, "precondition_required"),
        (503, "service_unavailable"),
    ):
        body = _problem(client.get(f"/raise/{status}"), status, code)
        assert "detail" not in body  # Starlette's English reason phrase is not echoed

    # No generic code for these statuses: the service must raise ProblemError with a specific code.
    for status in (409, 415, 422, 429, 500, 502):
        _problem(client.get(f"/raise/{status}"), 500, "internal_error")


@pytest.mark.parametrize(("header", "code"), [(None, "required"), ("short", "too_small"), ("x" * 129, "too_big")])
def test_idempotency_key_field_codes(header: str | None, code: str) -> None:
    with pytest.raises(ProblemError) as invalid:
        require_idempotency_key(header)
    problem = invalid.value.to_problem()
    assert problem["errors"][0]["code"] == code
    assert contract_errors(COMMON_SCHEMAS, "Problem", problem) == []
