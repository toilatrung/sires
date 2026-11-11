# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S01 — structlog redaction, problem+json for FastAPI, OpenTelemetry request context."""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import BaseModel
from support import COMMON_SCHEMAS, contract_errors

from sires_common.errors import PROBLEM_JSON, ProblemError, install_problem_handlers
from sires_common.telemetry import (
    REDACTED,
    RequestContextMiddleware,
    configure_logging,
    get_logger,
    hash_account_id,
    redact,
)

HASH_KEY = b"test-account-hash-key"
ANTHROPIC_KEY = "sk-ant-api03-Zq3xV9mLp2Rt7Yw4Hk8Jd1Fs6Gb0Nc5Ue-AbCdEfGhIjKlMnOpQrStUvWxYz012345-AA"
OPENAI_KEY = "sk-proj-Q8wErTy7UiOp3AsDfGh2JkLz9XcVbNm4Qw1Er5Ty6Ui0OpAsDf"
GOOGLE_KEY = "AIzaSyD4kQ9xLm2Np7Rt5Vw8Yz3Bc6Df1Gh0JkL"
HIGH_ENTROPY = "Xk9Qm2Lw7Rt4Yp8Zs3Vb6Nc1Jd5Hf0GaTe"
JWT = "eyJhbGciOiJFUzI1NiIsImtpZCI6ImFnZW50LWNvcmUifQ.eyJzdWIiOiJhZ2VudC1jb3JlIn0.c2lnbmF0dXJlLXZhbHVl"
ACCOUNT_ID = "0193a000-0000-7000-8000-00000000000a"
SECRETS = [ANTHROPIC_KEY, OPENAI_KEY, GOOGLE_KEY, HIGH_ENTROPY, JWT, "plain-but-named-api-key-value"]


@pytest.fixture
def log_stream() -> Iterator[io.StringIO]:
    stream = io.StringIO()
    configure_logging("sires-common-test", account_hash_key=HASH_KEY, level=logging.DEBUG, stream=stream)
    yield stream
    structlog.reset_defaults()


def _records(stream: io.StringIO) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


class Body(BaseModel):
    researchQuestion: str


def _app(*, native_tracing: bool = True) -> FastAPI:
    app = FastAPI(telemetry={"tracing": native_tracing})
    install_problem_handlers(app)
    app.add_middleware(RequestContextMiddleware, service="sires-common-test")

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError(f"provider said: invalid key {ANTHROPIC_KEY}")

    @app.get("/declared")
    def declared() -> None:
        raise ProblemError(409, "invalid_transition", "Chuyển trạng thái không hợp lệ", current_state="Ready")

    @app.post("/validate")
    def validate(body: Body) -> dict[str, str]:
        return {"ok": body.researchQuestion}

    @app.get("/log")
    def log_line() -> dict[str, str]:
        get_logger("test").info("inside_request")
        return {"ok": "yes"}

    return app


def test_redaction(log_stream: io.StringIO) -> None:
    """PID-00005-AC02: API keys in logs are masked; an undeclared error returns internal_error."""
    log = get_logger("test")
    log.info(
        f"calling provider with {ANTHROPIC_KEY}",
        api_key="plain-but-named-api-key-value",
        headers={"Authorization": f"Bearer {JWT}", "X-Api-Key": OPENAI_KEY, "accept": "application/json"},
        note=f"google {GOOGLE_KEY} token {HIGH_ENTROPY}",
        nested=[{"apiKey": "plain-but-named-api-key-value"}, f"openai {OPENAI_KEY}"],
        account_id=ACCOUNT_ID,
        project_id="0193a000-0000-7000-8000-0000000000ff",
        trace_hex="4bf92f3577b34da6a3ce929d0e0e4736",
    )
    try:
        raise ValueError(f"SDK error echoing {OPENAI_KEY}")
    except ValueError:
        log.exception("provider_failed")

    output = log_stream.getvalue()
    for secret in SECRETS:
        assert secret not in output
    first, second = _records(log_stream)
    assert first["api_key"] == REDACTED
    assert first["headers"]["Authorization"] == REDACTED
    assert first["headers"]["X-Api-Key"] == REDACTED
    assert first["headers"]["accept"] == "application/json"
    assert first["nested"][0]["apiKey"] == REDACTED
    assert REDACTED in first["event"] and REDACTED in first["note"]
    # accountId is a keyed hash; ids and hex trace ids are not touched.
    assert "account_id" not in first and ACCOUNT_ID not in output
    assert first["account_hash"] == hash_account_id(ACCOUNT_ID, HASH_KEY)
    assert first["project_id"] == "0193a000-0000-7000-8000-0000000000ff"
    assert first["trace_hex"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert "ValueError" in second["exception"] and REDACTED in second["exception"]

    # Undeclared error → 500 internal_error, no stack trace nor message in the body; the log is redacted.
    response = TestClient(_app()).get("/boom")
    assert response.status_code == 500
    assert response.headers["content-type"] == PROBLEM_JSON
    body = response.json()
    assert body["code"] == "internal_error" and body["status"] == 500
    assert contract_errors(COMMON_SCHEMAS, "Problem", body) == []
    text = response.text
    assert "Traceback" not in text and "RuntimeError" not in text and ANTHROPIC_KEY not in text
    assert ANTHROPIC_KEY not in log_stream.getvalue()
    assert "unhandled_error" in log_stream.getvalue()


def test_redact_helper_keeps_safe_values() -> None:
    value = {"Authorization": "Basic dXNlcjpwYXNz", "list": [GOOGLE_KEY, "hello world"], "count": 3}
    assert redact(value) == {"Authorization": REDACTED, "list": [REDACTED, "hello world"], "count": 3}
    assert redact("uuid 0193a000-0000-7000-8000-00000000000a stays") == (
        "uuid 0193a000-0000-7000-8000-00000000000a stays"
    )


def test_account_dropped_without_hash_key() -> None:
    stream = io.StringIO()
    configure_logging("sires-common-test", stream=stream)
    try:
        get_logger().info("x", accountId=ACCOUNT_ID)
    finally:
        structlog.reset_defaults()
    record = json.loads(stream.getvalue())
    assert "accountId" not in record and "account_hash" not in record


def test_problem_json() -> None:
    client = TestClient(_app())
    declared = client.get("/declared")
    assert declared.status_code == 409
    assert declared.headers["content-type"] == PROBLEM_JSON
    assert declared.json() | {"correlationId": None} == {
        "type": "https://sires.etroy.local/problems/invalid_transition",
        "title": "Chuyển trạng thái không hợp lệ",
        "status": 409,
        "code": "invalid_transition",
        "currentState": "Ready",
        "instance": "/declared",
        "correlationId": None,
    }
    assert contract_errors(COMMON_SCHEMAS, "Problem", declared.json()) == []

    invalid = client.post("/validate", json={})
    assert invalid.status_code == 400
    body = invalid.json()
    assert body["code"] == "validation_failed"
    assert body["errors"] == [{"field": "researchQuestion", "code": "required", "message": "Field required"}]
    assert contract_errors(COMMON_SCHEMAS, "Problem", body) == []

    missing = client.get("/no-such-route")
    assert missing.status_code == 404
    assert missing.headers["content-type"] == PROBLEM_JSON
    assert missing.json()["code"] == "not_found"


@pytest.mark.parametrize("native_tracing", [True, False])
def test_request_context(log_stream: io.StringIO, spans: InMemorySpanExporter, native_tracing: bool) -> None:
    """A request has one SERVER span; its logs carry the same request_id and trace_id; works without an
    external exporter and continues an incoming traceparent (FastAPI native tracing on or off)."""
    client = TestClient(_app(native_tracing=native_tracing))
    parent_trace = "4bf92f3577b34da6a3ce929d0e0e4736"
    response = client.get(
        "/log", headers={"traceparent": f"00-{parent_trace}-00f067aa0ba902b7-01", "x-request-id": "req-123"}
    )
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "req-123"
    finished = [s for s in spans.get_finished_spans() if s.name == "GET /log"]
    assert len(finished) == 1
    span = finished[0]
    assert format(span.context.trace_id, "032x") == parent_trace
    assert span.attributes is not None and span.attributes["sires.request_id"] == "req-123"
    record = next(r for r in _records(log_stream) if r["event"] == "inside_request")
    assert record["request_id"] == "req-123"
    assert record["trace_id"] == parent_trace
    assert record["service"] == "sires-common-test"

    # A 500 carries the trace id as correlationId.
    failed = client.get("/boom", headers={"traceparent": f"00-{parent_trace}-00f067aa0ba902b7-01"})
    assert failed.json()["correlationId"] == parent_trace
