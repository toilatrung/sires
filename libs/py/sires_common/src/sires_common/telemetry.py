# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Logging with redaction (structlog) and tracing (OpenTelemetry) — architecture 10.3, 11.5; NFR-OBS-001/002.

Redaction policy, applied to every log record after exceptions are formatted (common to the TS and Python
libraries, PO 12/11/2026: field list of the TS library, JWT pattern of this one, entropy 4.5, `/` not part of a
candidate):
- fields whose name, lower-cased without separators, ends with `apikey` or is one of `_SENSITIVE_FIELDS`
  (authorization, password, secret, client_secret, token, access/refresh/id token, cookie, csrf token…) are
  replaced by `[REDACTED]`;
- inside any string: key-like values with a provider prefix (Anthropic/OpenAI `sk-…`, Google `AIza…`), JWTs,
  `Bearer …` credentials and high-entropy runs (≥ 32 characters, mixed case and digits, Shannon entropy ≥ 4.5;
  `/` ends a run so URL and file paths stay readable) are replaced by `[REDACTED]`;
- `account_id` / `accountId` is replaced by `account_hash`, an HMAC-SHA256 with the key from configuration
  (dropped when no key is configured).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import math
import os
import re
import sys
from collections import Counter
from collections.abc import Mapping, MutableMapping
from typing import Any, TextIO

import structlog
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.propagate import extract, inject
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter
from opentelemetry.trace import SpanKind, Status, StatusCode
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REDACTED = "[REDACTED]"

# Same set as libs/ts/platform/src/logging/redact.ts (SENSITIVE_FIELDS), compared after `_normalise`.
_SENSITIVE_FIELDS = frozenset(
    {
        "authorization",
        "proxyauthorization",
        "password",
        "secret",
        "clientsecret",
        "token",
        "accesstoken",
        "refreshtoken",
        "idtoken",
        "cookie",
        "setcookie",
        "csrftoken",
        "xcsrftoken",
    }
)
_ACCOUNT_FIELDS = ("accountid",)

_PATTERNS: tuple[re.Pattern[str], ...] = (
    # JWT / JWS compact serialisation (internal service tokens included).
    re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*"),
    # Anthropic (sk-ant-…) and OpenAI (sk-…, sk-proj-…, sk-svcacct-…) keys.
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    # Google AI Studio / Gemini keys.
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    # Credentials after an auth scheme.
    re.compile(r"(?i)(?<=\bbearer )[A-Za-z0-9._~+/=\-]{8,}"),
    re.compile(r"(?i)(?<=\bbasic )[A-Za-z0-9+/=]{8,}"),
)
# Candidate secrets for the entropy check; `/` is left out so URL paths and file paths stay readable.
_CANDIDATE = re.compile(r"[A-Za-z0-9+=_\-]{32,}")
_ENTROPY_THRESHOLD = 4.5
_NON_ALNUM = re.compile(r"[^a-z0-9]")


def _normalise(name: str) -> str:
    return _NON_ALNUM.sub("", name.lower())


def _shannon_entropy(value: str) -> float:
    counts = Counter(value)
    total = len(value)
    return -sum(n / total * math.log2(n / total) for n in counts.values())


def _is_high_entropy(token: str) -> bool:
    """Random-looking secret: mixed case and digits, high Shannon entropy. UUIDs and hex trace ids do not match."""
    has_upper = any(c.isupper() for c in token)
    has_lower = any(c.islower() for c in token)
    has_digit = any(c.isdigit() for c in token)
    return has_upper and has_lower and has_digit and _shannon_entropy(token) >= _ENTROPY_THRESHOLD


def redact_text(text: str) -> str:
    """Replace key-like substrings in free text."""
    for pattern in _PATTERNS:
        text = pattern.sub(REDACTED, text)
    return _CANDIDATE.sub(lambda m: REDACTED if _is_high_entropy(m.group(0)) else m.group(0), text)


def _is_sensitive_field(name: str) -> bool:
    norm = _normalise(name)
    return norm.endswith("apikey") or norm in _SENSITIVE_FIELDS


def redact(value: Any) -> Any:
    """Redact a value recursively (dicts, lists, tuples, strings). Field names follow the module policy."""
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, Mapping):
        return {k: (REDACTED if isinstance(k, str) and _is_sensitive_field(k) else redact(v)) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [redact(v) for v in value]
    return value


def hash_account_id(account_id: object, key: bytes) -> str:
    """Keyed hash of an account id for logs (NFR-OBS-001)."""
    return hmac.new(key, str(account_id).encode(), hashlib.sha256).hexdigest()


class Redactor:
    """structlog processor implementing the module redaction policy."""

    def __init__(self, account_hash_key: bytes | None = None) -> None:
        self._key = account_hash_key

    def __call__(self, logger: Any, method_name: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
        out: dict[str, Any] = {}
        for name, value in event_dict.items():
            norm = _normalise(name)
            if norm in _ACCOUNT_FIELDS:
                if self._key is not None and value is not None:
                    out["account_hash"] = hash_account_id(value, self._key)
                continue
            out[name] = REDACTED if _is_sensitive_field(name) else self._nested(value)
        return out

    def _nested(self, value: Any) -> Any:
        if isinstance(value, Mapping):
            result: dict[str, Any] = {}
            for k, v in value.items():
                if isinstance(k, str) and _normalise(k) in _ACCOUNT_FIELDS:
                    if self._key is not None and v is not None:
                        result["account_hash"] = hash_account_id(v, self._key)
                    continue
                result[k] = REDACTED if isinstance(k, str) and _is_sensitive_field(k) else self._nested(v)
            return result
        if isinstance(value, list | tuple):
            return [self._nested(v) for v in value]
        if isinstance(value, str):
            return redact_text(value)
        return value


def _add_trace_context(logger: Any, method_name: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    ctx = trace.get_current_span().get_span_context()
    if ctx.is_valid:
        event_dict.setdefault("trace_id", trace.format_trace_id(ctx.trace_id))
        event_dict.setdefault("span_id", trace.format_span_id(ctx.span_id))
    return event_dict


def configure_logging(
    service: str,
    *,
    account_hash_key: bytes | None = None,
    level: int = logging.INFO,
    stream: TextIO | None = None,
) -> None:
    """JSON logs with the same field names as the NestJS services (architecture 11.5)."""

    def add_service(logger: Any, method_name: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
        event_dict.setdefault("service", service)
        return event_dict

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            add_service,
            _add_trace_context,
            structlog.processors.format_exc_info,
            Redactor(account_hash_key),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.WriteLoggerFactory(file=stream or sys.stdout),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name)


# ---------- OpenTelemetry ----------


def init_telemetry(service: str, *, exporter: SpanExporter | None = None, batch: bool = True) -> TracerProvider:
    """Install a global TracerProvider. Without exporter it exports over OTLP/HTTP only when
    `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set; otherwise spans are created
    (ids for logs and outbox) but not exported."""
    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    if exporter is None and (
        os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        exporter = OTLPSpanExporter()
    if exporter is not None:
        provider.add_span_processor(BatchSpanProcessor(exporter) if batch else SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return provider


def get_tracer(name: str = "sires_common") -> trace.Tracer:
    return trace.get_tracer(name)


def current_trace_id() -> str | None:
    ctx = trace.get_current_span().get_span_context()
    return trace.format_trace_id(ctx.trace_id) if ctx.is_valid else None


def current_traceparent() -> str | None:
    """W3C `traceparent` of the current span, stored in outbox rows and message headers."""
    carrier: dict[str, str] = {}
    inject(carrier)
    return carrier.get("traceparent")


def context_from_traceparent(traceparent: str | None) -> otel_context.Context:
    return extract({"traceparent": traceparent} if traceparent else {})


def context_from_headers(headers: Mapping[str, Any] | None) -> otel_context.Context:
    carrier = {str(k).lower(): str(v) for k, v in (headers or {}).items() if v is not None}
    return extract(carrier)


class RequestContextMiddleware:
    """Request context for logs and traces: `request_id` (from `X-Request-Id` or new) and `trace_id` are bound to
    every log line of the request, `X-Request-Id` is returned, and the request's SERVER span carries
    `sires.request_id`.

    FastAPI's native OpenTelemetry already opens the SERVER span (continuing an incoming `traceparent`); this
    middleware reuses it, and opens one itself only when no span is active (native tracing off, plain Starlette).
    """

    def __init__(self, app: ASGIApp, service: str) -> None:
        self.app = app
        self.service = service

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        from sires_common.tenancy import uuid7

        headers = Headers(scope=scope)
        request_id = headers.get("x-request-id") or str(uuid7())
        if trace.get_current_span().get_span_context().is_valid:
            await self._run(trace.get_current_span(), request_id, scope, receive, send)
            return
        parent = context_from_headers({"traceparent": headers.get("traceparent")})
        name = f"{scope.get('method', 'HTTP')} {scope.get('path', '')}"
        with get_tracer().start_as_current_span(name, context=parent, kind=SpanKind.SERVER) as span:
            span.set_attribute("http.request.method", str(scope.get("method", "")))
            span.set_attribute("url.path", str(scope.get("path", "")))
            await self._run(span, request_id, scope, receive, send, own_span=True)

    async def _run(
        self,
        span: trace.Span,
        request_id: str,
        scope: Scope,
        receive: Receive,
        send: Send,
        *,
        own_span: bool = False,
    ) -> None:
        span.set_attribute("sires.request_id", request_id)
        tokens = structlog.contextvars.bind_contextvars(
            request_id=request_id, trace_id=current_trace_id(), service=self.service
        )

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["x-request-id"] = request_id
                if own_span:
                    status = int(message["status"])
                    span.set_attribute("http.response.status_code", status)
                    if status >= 500:
                        span.set_status(Status(StatusCode.ERROR))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            structlog.contextvars.reset_contextvars(**tokens)
